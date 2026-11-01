begin;
alter table public.registration_submissions
  add column submitted_shifts jsonb not null default '{}' check (jsonb_typeof(submitted_shifts)='object'),
  add column protected_shifts jsonb not null default '{}' check (jsonb_typeof(protected_shifts)='object'),
  add column needs_confirmation boolean not null default false;

-- Old rows stored mutable selections and one sticky flag, not a submitted
-- snapshot. Preserve drafts, assignments and history; do not invent timestamps.
update public.registration_submissions s set needs_confirmation=true,submitted=false
where submitted or exists(select 1 from public.shift_assignments a where a.week_start=s.week_start and a.employee_id=s.employee_id);

-- Recover only an attributable, unchanged weekly form. A later edit/approval
-- could have changed the old mutable list. Equal/unknown historical priority
-- stays JSON null; do not rank a resubmission as if it were the first submission.
with confirmed as (
  select distinct on (l.week_start,p.employee_id) l.week_start,p.employee_id
  from public.audit_logs l join public.profiles p on p.id=l.actor and p.employee_id is not null
  where l.action='submit' and l.result#>>'{details,fromPhase}'='1'
    and not exists(select 1 from public.audit_logs later where later.id>l.id and
      ((later.week_start=l.week_start and later.action in ('registration','approve','demo_seed'))
       or (later.action='account_update' and later.fingerprint=p.id::text)))
  order by l.week_start,p.employee_id,l.id desc
)
update public.registration_submissions s set needs_confirmation=false,submitted=true,
  submitted_shifts=(select coalesce(jsonb_object_agg(r.shift_id,'null'::jsonb),'{}'::jsonb)
    from public.shift_registrations r where r.week_start=s.week_start and r.employee_id=s.employee_id)
from confirmed c where s.week_start=c.week_start and s.employee_id=c.employee_id;

-- Reconstruct historical approved supplements, except where a later explicit
-- approved leave/swap superseded them (including an audited mutual swap).
with active_locks as (
  select distinct on (r.week_start,r.employee_id,r.shift_id) r.*
  from public.change_requests r left join public.approval_history ah on ah.request_id=r.id
  where r.type='Đăng ký bổ sung' and r.status='ĐÃ DUYỆT' and not exists (
    select 1 from public.change_requests d join public.approval_history dh on dh.request_id=d.id
    where d.week_start=r.week_start and d.status='ĐÃ DUYỆT' and d.type in ('Xin đổi ca','Xin nghỉ đột xuất')
      and dh.created_at>=coalesce(ah.created_at,r.created_at) and
      ((d.employee_id=r.employee_id and d.shift_id=r.shift_id) or
       (d.target_shift_id=r.shift_id and exists(select 1 from public.audit_logs l where l.week_start=r.week_start
         and l.action='approve' and l.result#>>'{details,requestId}'=d.id::text
         and l.result#>>'{reassignment,mutualSwap}'='true' and l.result#>>'{reassignment,replacementId}'=r.employee_id)))
  ) order by r.week_start,r.employee_id,r.shift_id,coalesce(ah.created_at,r.created_at) desc,r.id
), per_employee as (
  select week_start,employee_id,jsonb_object_agg(shift_id,id) locks,
    jsonb_object_agg(shift_id,floor(extract(epoch from created_at)*1000)::bigint) submissions
  from active_locks group by week_start,employee_id
)
update public.registration_submissions s set protected_shifts=p.locks,submitted_shifts=s.submitted_shifts || p.submissions
from per_employee p where s.week_start=p.week_start and s.employee_id=p.employee_id;

create or replace function public.workspace_snapshot(p_week date) returns jsonb language sql stable security definer set search_path = '' as $$
select jsonb_build_object(
  'week',p_week, 'revision',coalesce((select revision from public.weekly_schedules where week_start=p_week),0),
  'exists',exists(select 1 from public.weekly_schedules where week_start=p_week),
  'employees',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'dept',dept,'role',role) order by id) from public.employees),'[]'::jsonb),
  'state',jsonb_build_object('currentRole',null,'weekStatus',coalesce((select phase from public.weekly_schedules where week_start=p_week),2),
    'shifts',(select jsonb_object_agg(d||'-'||k,jsonb_build_object('id',d||'-'||k,'dayKey',d,'shiftKey',k,
      'registered',coalesce((select jsonb_agg(employee_id order by position) from public.shift_registrations where week_start=p_week and shift_id=d||'-'||k),'[]'::jsonb),
      'assigned',coalesce((select jsonb_agg(employee_id order by position) from public.shift_assignments where week_start=p_week and shift_id=d||'-'||k),'[]'::jsonb),
      'hasChangeReq',exists(select 1 from public.change_requests where week_start=p_week and shift_id=d||'-'||k and status='CHỜ DUYỆT')))
      from unnest(array['mon','tue','wed','thu','fri','sat','sun']) with ordinality days(d,di) cross join unnest(array['morn','after','eve']) with ordinality configs(k,ki)),
    'registrations',coalesce((select jsonb_object_agg(e.id,jsonb_build_object('isSubmitted',coalesce(s.submitted,false),
      'submittedShifts',coalesce(s.submitted_shifts,'{}'::jsonb),'protectedShifts',coalesce(s.protected_shifts,'{}'::jsonb),
      'needsConfirmation',coalesce(s.needs_confirmation,false),'isDisqualified',coalesce(s.disqualified,false),'reason',coalesce(s.reason,''))) from public.employees e left join public.registration_submissions s on s.employee_id=e.id and s.week_start=p_week),'{}'::jsonb),
    'changeRequests',coalesce((select jsonb_agg(jsonb_build_object('id',id,'empId',employee_id,'shiftId',shift_id,'targetShiftId',target_shift_id,'type',type,'reason',reason,'status',status,'time',created_at) order by created_at desc,id) from public.change_requests where week_start=p_week),'[]'::jsonb)))
$$;

create or replace function public.commit_workspace(p_actor uuid, p_action text, p_request uuid, p_week date, p_revision integer, p_fingerprint text, p_state jsonb, p_result jsonb, p_expected_employee_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor_role text; actor_employee text; rev integer; previous public.audit_logs; item record; emp text; req jsonb; old_status text; submission jsonb; committed_ms bigint; begin
  -- This row lock conflicts with manage_profile's UPDATE and lasts until commit.
  select role, employee_id into actor_role, actor_employee
    from public.profiles where id=p_actor and active for share;
  if actor_role is null or (p_action in ('phase','generate','approve','reject') and actor_role <> 'manager') or (p_action in ('registration','submit','request','withdraw') and actor_role <> 'employee') or p_action not in ('phase','generate','approve','reject','registration','submit','request','withdraw','demo_seed') or (p_action='demo_seed' and actor_role <> 'manager') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if actor_employee is distinct from p_expected_employee_id then
    raise exception 'STALE_EMPLOYEE_MAPPING' using errcode='40001';
  end if;
  insert into public.weekly_schedules(week_start) values(p_week) on conflict do nothing;
  select revision into rev from public.weekly_schedules where week_start=p_week for update;
  select * into previous from public.audit_logs where actor=p_actor and request_id=p_request;
  if found then
    if previous.fingerprint <> p_fingerprint or previous.week_start <> p_week or previous.action <> p_action then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='40001'; end if;
    return previous.result;
  end if;
  -- A replay-only call may return an existing result, but cannot create a plan.
  if p_state is null or p_result is null then raise exception 'MISSING_PLAN' using errcode='40001'; end if;
  if rev <> p_revision then raise exception 'STALE_REVISION' using errcode='40001'; end if;
  if (select count(*) from jsonb_object_keys(p_state->'shifts')) <> 21 then raise exception 'INVALID_SHIFT_COUNT' using errcode='23514'; end if;
  insert into public.shifts(week_start,id) select p_week,d||'-'||k from unnest(array['mon','tue','wed','thu','fri','sat','sun']) d cross join unnest(array['morn','after','eve']) k on conflict do nothing;
  -- Only an approved departure requested by this employee can release a lock.
  if exists (
    select 1 from public.registration_submissions s cross join lateral jsonb_each_text(s.protected_shifts) lock
    where s.week_start=p_week and
      ((p_state#>>array['registrations',s.employee_id,'protectedShifts',lock.key]) is distinct from lock.value
       or (not coalesce((p_state#>array['shifts',lock.key,'assigned']) ? s.employee_id,false)
           and (p_action='generate' or exists (select 1 from public.shift_assignments a where
             a.week_start=p_week and a.shift_id=lock.key and a.employee_id=s.employee_id))))
      and not (p_action='approve' and exists (
        select 1 from jsonb_array_elements(p_state->'changeRequests') r
        where r->>'id'=p_result#>>'{details,requestId}' and r->>'status'='ĐÃ DUYỆT'
          and r->>'type' in ('Xin nghỉ đột xuất','Xin đổi ca') and r->>'empId'=s.employee_id and r->>'shiftId'=lock.key
      ))
  ) then raise exception 'PROTECTED_ASSIGNMENT_CONFLICT' using errcode='23514'; end if;

  if p_action='generate' and exists (
    select 1 from jsonb_each(p_state->'shifts') sh cross join lateral jsonb_array_elements_text(sh.value->'assigned') a(id)
    where not coalesce((p_state#>array['registrations',a.id,'submittedShifts']) ? sh.key,false)
  ) then raise exception 'UNSUBMITTED_ASSIGNMENT' using errcode='23514'; end if;
  committed_ms := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  delete from public.shift_assignments where week_start=p_week;
  delete from public.shift_registrations where week_start=p_week;
  for item in select key,value from jsonb_each(p_state->'shifts') loop
    if item.key <> item.value->>'id' then raise exception 'INVALID_SHIFT' using errcode='23514'; end if;
    for emp in select jsonb_array_elements_text(item.value->'registered') loop
      insert into public.shift_registrations(week_start,shift_id,employee_id) values(p_week,item.key,emp);
    end loop;
    for emp in select jsonb_array_elements_text(item.value->'assigned') loop
      insert into public.shift_assignments(week_start,shift_id,employee_id) values(p_week,item.key,emp);
    end loop;
  end loop;
  for item in select key,value from jsonb_each(p_state->'registrations') loop
    submission := coalesce(item.value->'submittedShifts','{}'::jsonb);
    if p_action='submit' and item.key=actor_employee and not (p_result->'details' ? 'shiftIds') then
      -- Stamp newly submitted slots only after authorization and the week lock.
      select coalesce(jsonb_object_agg(k,coalesce(s.submitted_shifts->k,to_jsonb(committed_ms))),'{}'::jsonb)
        into submission from jsonb_object_keys(submission) k left join public.registration_submissions s
        on s.week_start=p_week and s.employee_id=item.key;
    end if;
    insert into public.registration_submissions(week_start,employee_id,submitted,disqualified,reason,submitted_shifts,protected_shifts,needs_confirmation)
      values(p_week,item.key,(item.value->>'isSubmitted')::boolean,(item.value->>'isDisqualified')::boolean,item.value->>'reason',
        submission,coalesce(item.value->'protectedShifts','{}'::jsonb),coalesce((item.value->>'needsConfirmation')::boolean,false))
      on conflict(week_start,employee_id) do update set submitted=excluded.submitted,disqualified=excluded.disqualified,
        reason=excluded.reason,submitted_shifts=excluded.submitted_shifts,protected_shifts=excluded.protected_shifts,
        needs_confirmation=excluded.needs_confirmation,updated_at=now();
  end loop;
  for req in select jsonb_array_elements(p_state->'changeRequests') loop
    if exists(select 1 from public.change_requests where id=(req->>'id')::uuid and (week_start<>p_week or employee_id<>req->>'empId' or shift_id<>req->>'shiftId' or type<>req->>'type' or target_shift_id is distinct from req->>'targetShiftId' or reason<>req->>'reason')) then raise exception 'IMMUTABLE_REQUEST_MISMATCH' using errcode='23514'; end if;
    select status into old_status from public.change_requests where id=(req->>'id')::uuid;
    if old_status is not null and old_status <> 'CHỜ DUYỆT' and old_status <> req->>'status' then raise exception 'REQUEST_ALREADY_REVIEWED' using errcode='40001'; end if;
    insert into public.change_requests(id,week_start,employee_id,shift_id,target_shift_id,type,reason,status,created_at)
      values((req->>'id')::uuid,p_week,req->>'empId',req->>'shiftId',req->>'targetShiftId',req->>'type',req->>'reason',req->>'status',case when p_action='submit' and req->>'type'='Đăng ký bổ sung' then to_timestamp(committed_ms/1000.0) else (req->>'time')::timestamptz end)
      on conflict(id) do update set status=excluded.status,updated_at=now();
    if old_status='CHỜ DUYỆT' and req->>'status'='ĐÃ DUYỆT' and req->>'type'='Đăng ký bổ sung'
       and ((p_state#>>array['registrations',req->>'empId','protectedShifts',req->>'shiftId']) is distinct from req->>'id'
       or not coalesce((p_state#>array['shifts',req->>'shiftId','assigned']) ? (req->>'empId'),false))
    then raise exception 'APPROVAL_REQUIRES_ASSIGNMENT' using errcode='23514'; end if;
    if old_status='CHỜ DUYỆT' and req->>'status' in ('ĐÃ DUYỆT','TỪ CHỐI') then
      insert into public.approval_history(request_id,actor,result) values((req->>'id')::uuid,p_actor,req->>'status');
    end if;
  end loop;
  update public.weekly_schedules set phase=(p_state->>'weekStatus')::smallint,revision=revision+1,updated_at=now() where week_start=p_week;
  insert into public.audit_logs(actor,request_id,action,week_start,fingerprint,result) values(p_actor,p_request,p_action,p_week,p_fingerprint,p_result);
  return p_result;
end $$;

commit;
