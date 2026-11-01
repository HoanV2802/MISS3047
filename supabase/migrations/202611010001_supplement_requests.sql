begin;
-- Reuse the existing private request, week revision and manager-review records.
alter table public.change_requests
  drop constraint change_requests_type_check,
  drop constraint change_requests_status_check,
  drop constraint change_requests_check,
  add constraint change_requests_type_check check (type in ('Xin đổi ca','Xin nghỉ đột xuất','Đăng ký bổ sung')),
  add constraint change_requests_status_check check (status in ('CHỜ DUYỆT','ĐÃ DUYỆT','TỪ CHỐI') or (status='ĐÃ RÚT' and type='Đăng ký bổ sung')),
  add constraint change_requests_check check ((type='Xin đổi ca' and target_shift_id is not null and target_shift_id<>shift_id) or (type in ('Xin nghỉ đột xuất','Đăng ký bổ sung') and target_shift_id is null));

-- Same transaction and permissions. Withdrawals are employee actions in audit_logs;
-- approval_history continues to contain only manager decisions.
create or replace function public.commit_workspace(p_actor uuid, p_action text, p_request uuid, p_week date, p_revision integer, p_fingerprint text, p_state jsonb, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor_role text; rev integer; previous public.audit_logs; item record; emp text; req jsonb; old_status text; begin
  select role into actor_role from public.profiles where id=p_actor and active for share;
  if actor_role is null or (p_action in ('phase','generate','approve','reject') and actor_role <> 'manager') or (p_action in ('registration','submit','request','withdraw') and actor_role <> 'employee') or p_action not in ('phase','generate','approve','reject','registration','submit','request','withdraw','demo_seed') or (p_action='demo_seed' and actor_role <> 'manager') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  insert into public.weekly_schedules(week_start) values(p_week) on conflict do nothing;
  select revision into rev from public.weekly_schedules where week_start=p_week for update;
  select * into previous from public.audit_logs where actor=p_actor and request_id=p_request;
  if found then
    if previous.fingerprint <> p_fingerprint or previous.week_start <> p_week or previous.action <> p_action then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='40001'; end if;
    return previous.result;
  end if;
  if rev <> p_revision then raise exception 'STALE_REVISION' using errcode='40001'; end if;
  if (select count(*) from jsonb_object_keys(p_state->'shifts')) <> 21 then raise exception 'INVALID_SHIFT_COUNT' using errcode='23514'; end if;
  insert into public.shifts(week_start,id) select p_week,d||'-'||k from unnest(array['mon','tue','wed','thu','fri','sat','sun']) d cross join unnest(array['morn','after','eve']) k on conflict do nothing;
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
    insert into public.registration_submissions(week_start,employee_id,submitted,disqualified,reason) values(p_week,item.key,(item.value->>'isSubmitted')::boolean,(item.value->>'isDisqualified')::boolean,item.value->>'reason')
      on conflict(week_start,employee_id) do update set submitted=excluded.submitted,disqualified=excluded.disqualified,reason=excluded.reason,updated_at=now();
  end loop;
  for req in select jsonb_array_elements(p_state->'changeRequests') loop
    if exists(select 1 from public.change_requests where id=(req->>'id')::uuid and (week_start<>p_week or employee_id<>req->>'empId' or shift_id<>req->>'shiftId' or type<>req->>'type' or target_shift_id is distinct from req->>'targetShiftId' or reason<>req->>'reason')) then raise exception 'IMMUTABLE_REQUEST_MISMATCH' using errcode='23514'; end if;
    select status into old_status from public.change_requests where id=(req->>'id')::uuid;
    if old_status is not null and old_status <> 'CHỜ DUYỆT' and old_status <> req->>'status' then raise exception 'REQUEST_ALREADY_REVIEWED' using errcode='40001'; end if;
    insert into public.change_requests(id,week_start,employee_id,shift_id,target_shift_id,type,reason,status,created_at)
      values((req->>'id')::uuid,p_week,req->>'empId',req->>'shiftId',req->>'targetShiftId',req->>'type',req->>'reason',req->>'status',(req->>'time')::timestamptz)
      on conflict(id) do update set status=excluded.status,updated_at=now();
    if old_status='CHỜ DUYỆT' and req->>'status' in ('ĐÃ DUYỆT','TỪ CHỐI') then
      insert into public.approval_history(request_id,actor,result) values((req->>'id')::uuid,p_actor,req->>'status');
    end if;
  end loop;
  update public.weekly_schedules set phase=(p_state->>'weekStatus')::smallint,revision=revision+1,updated_at=now() where week_start=p_week;
  insert into public.audit_logs(actor,request_id,action,week_start,fingerprint,result) values(p_actor,p_request,p_action,p_week,p_fingerprint,p_result);
  return p_result;
end $$;

commit;
