begin;
create table public.employees (
  id text primary key check (id ~ '^NV[0-9]{2}$'),
  name text not null check (length(name) between 1 and 120),
  dept text not null check (dept in ('Bếp','Phục vụ','Pha chế')),
  role text not null default 'Part-time' check (role = 'Part-time'),
  created_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  phone text not null unique check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  display_name text not null check (length(display_name) between 1 and 120),
  role text not null check (role in ('admin','manager','employee')),
  employee_id text unique references public.employees(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((role = 'employee' and employee_id is not null) or (role <> 'employee' and employee_id is null))
);
create table public.weekly_schedules (
  week_start date primary key check (extract(isodow from week_start) = 1 and week_start between date '2020-01-01' and date '2100-12-31'),
  phase smallint not null default 2 check (phase between 1 and 4),
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.shifts (
  week_start date not null references public.weekly_schedules(week_start) on delete restrict,
  id text not null check (id ~ '^(mon|tue|wed|thu|fri|sat|sun)-(morn|after|eve)$'),
  primary key (week_start,id)
);
create table public.shift_registrations (
  position bigint generated always as identity primary key,
  week_start date not null, shift_id text not null,
  employee_id text not null references public.employees(id), created_at timestamptz not null default now(),
  unique (week_start,shift_id,employee_id), foreign key (week_start,shift_id) references public.shifts(week_start,id) on delete restrict
);
create table public.shift_assignments (
  position bigint generated always as identity primary key,
  week_start date not null, shift_id text not null,
  employee_id text not null references public.employees(id), created_at timestamptz not null default now(),
  unique (week_start,shift_id,employee_id), foreign key (week_start,shift_id) references public.shifts(week_start,id) on delete restrict
);
create table public.registration_submissions (
  week_start date not null references public.weekly_schedules(week_start), employee_id text not null references public.employees(id),
  submitted boolean not null default false, disqualified boolean not null default false, reason text not null default '',
  updated_at timestamptz not null default now(), primary key (week_start,employee_id)
);
create table public.change_requests (
  id uuid primary key, week_start date not null, employee_id text not null references public.employees(id),
  shift_id text not null, target_shift_id text,
  type text not null check (type in ('Xin đổi ca','Xin nghỉ đột xuất')),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  status text not null default 'CHỜ DUYỆT' check (status in ('CHỜ DUYỆT','ĐÃ DUYỆT','TỪ CHỐI')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (week_start,shift_id) references public.shifts(week_start,id),
  foreign key (week_start,target_shift_id) references public.shifts(week_start,id),
  check ((type = 'Xin đổi ca' and target_shift_id is not null and target_shift_id <> shift_id) or (type = 'Xin nghỉ đột xuất' and target_shift_id is null))
);
create unique index one_pending_request on public.change_requests(week_start,employee_id,shift_id) where status = 'CHỜ DUYỆT';
create index requests_week on public.change_requests(week_start,created_at);
create table public.approval_history (
  id bigint generated always as identity primary key, request_id uuid not null unique references public.change_requests(id),
  actor uuid not null references public.profiles(id), result text not null check (result in ('ĐÃ DUYỆT','TỪ CHỐI')), created_at timestamptz not null default now()
);
create table public.audit_logs (
  id bigint generated always as identity primary key, actor uuid not null references public.profiles(id),
  request_id uuid not null, action text not null, week_start date references public.weekly_schedules(week_start),
  fingerprint text not null, result jsonb not null, created_at timestamptz not null default now(), unique(actor,request_id)
);
create table public.web_sessions (
  id text primary key check (length(id) = 64), user_id uuid not null references public.profiles(id),
  encrypted_tokens text not null, revision integer not null default 0,
  created_at timestamptz not null default now(), last_seen timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user on public.web_sessions(user_id);
create table public.login_limits (key text primary key, bucket bigint not null, attempts integer not null, updated_at timestamptz not null default now());

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create function private.app_role() returns text language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and active
$$;
create function private.employee_id() returns text language sql stable security definer set search_path = '' as $$
  select employee_id from public.profiles where id = auth.uid() and active
$$;
grant usage on schema private to authenticated;
grant execute on function private.app_role(), private.employee_id() to authenticated;

-- No authenticated/anonymous client can write tables, bypass workflows or read sessions.
do $$ declare t text; begin
  foreach t in array array['employees','profiles','weekly_schedules','shifts','shift_registrations','shift_assignments','registration_submissions','change_requests','approval_history','audit_logs','web_sessions','login_limits'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from anon, authenticated',t);
    execute format('grant all on table public.%I to service_role',t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to service_role;
grant select on public.employees, public.profiles, public.weekly_schedules, public.shifts, public.shift_registrations, public.shift_assignments, public.registration_submissions, public.change_requests, public.approval_history, public.audit_logs to authenticated;
create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or private.app_role() = 'admin');
create policy employees_read on public.employees for select to authenticated using (private.app_role() = 'manager' or id = private.employee_id());
create policy weeks_read on public.weekly_schedules for select to authenticated using (private.app_role() in ('manager','employee'));
create policy shifts_read on public.shifts for select to authenticated using (private.app_role() in ('manager','employee'));
create policy registrations_read on public.shift_registrations for select to authenticated using (private.app_role() = 'manager' or employee_id = private.employee_id());
create policy assignments_read on public.shift_assignments for select to authenticated using (private.app_role() = 'manager' or employee_id = private.employee_id());
create policy submissions_read on public.registration_submissions for select to authenticated using (private.app_role() = 'manager' or employee_id = private.employee_id());
create policy requests_read on public.change_requests for select to authenticated using (private.app_role() = 'manager' or employee_id = private.employee_id());
create policy approvals_read on public.approval_history for select to authenticated using (private.app_role() in ('admin','manager'));
create policy audit_read on public.audit_logs for select to authenticated using (private.app_role() in ('admin','manager'));

create function private.check_department() returns trigger language plpgsql set search_path = '' as $$
declare d text; k text; begin
  select dept into d from public.employees where id = new.employee_id;
  if d is null then return new; end if; -- Let the foreign key report an unknown employee.
  k := split_part(new.shift_id,'-',2);
  if (k = 'morn' and d <> 'Pha chế') or (k = 'after' and d = 'Phục vụ') then raise exception 'DEPARTMENT_NOT_ALLOWED' using errcode = '23514'; end if;
  return new;
end $$;
create trigger registration_department before insert or update on public.shift_registrations for each row execute function private.check_department();
create trigger assignment_department before insert or update on public.shift_assignments for each row execute function private.check_department();

-- Snapshot returns the familiar state shape, but only to trusted server processes.
create function public.workspace_snapshot(p_week date) returns jsonb language sql stable security definer set search_path = '' as $$
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
    'registrations',coalesce((select jsonb_object_agg(e.id,jsonb_build_object('isSubmitted',coalesce(s.submitted,false),'isDisqualified',coalesce(s.disqualified,false),'reason',coalesce(s.reason,''))) from public.employees e left join public.registration_submissions s on s.employee_id=e.id and s.week_start=p_week),'{}'::jsonb),
    'changeRequests',coalesce((select jsonb_agg(jsonb_build_object('id',id,'empId',employee_id,'shiftId',shift_id,'targetShiftId',target_shift_id,'type',type,'reason',reason,'status',status,'time',created_at) order by created_at desc,id) from public.change_requests where week_start=p_week),'[]'::jsonb)))
$$;

create function public.commit_workspace(p_actor uuid, p_action text, p_request uuid, p_week date, p_revision integer, p_fingerprint text, p_state jsonb, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor_role text; rev integer; previous public.audit_logs; item record; emp text; req jsonb; old_status text; begin
  select role into actor_role from public.profiles where id=p_actor and active for share;
  if actor_role is null or (p_action in ('phase','generate','approve','reject') and actor_role <> 'manager') or (p_action in ('registration','submit','request') and actor_role <> 'employee') or p_action not in ('phase','generate','approve','reject','registration','submit','request','demo_seed') or (p_action='demo_seed' and actor_role <> 'manager') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
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
    if old_status='CHỜ DUYỆT' and req->>'status' <> 'CHỜ DUYỆT' then
      insert into public.approval_history(request_id,actor,result) values((req->>'id')::uuid,p_actor,req->>'status');
    end if;
  end loop;
  update public.weekly_schedules set phase=(p_state->>'weekStatus')::smallint,revision=revision+1,updated_at=now() where week_start=p_week;
  insert into public.audit_logs(actor,request_id,action,week_start,fingerprint,result) values(p_actor,p_request,p_action,p_week,p_fingerprint,p_result);
  return p_result;
end $$;

create function public.consume_login_limit(p_key text, p_limit integer) returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer; b bigint := floor(extract(epoch from now())/300); begin
  insert into public.login_limits(key,bucket,attempts) values(p_key,b,1) on conflict(key) do update set
    attempts=case when public.login_limits.bucket=b then public.login_limits.attempts+1 else 1 end,bucket=b,updated_at=now() returning attempts into n;
  return n <= p_limit;
end $$;

-- Role administration is separate from scheduling; self-role changes are forbidden.
create function public.manage_profile(p_actor uuid, p_target uuid, p_phone text, p_name text, p_role text, p_employee text, p_active boolean, p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles where id=p_actor and active and role='admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_actor=p_target then raise exception 'SELF_ADMINISTRATION_FORBIDDEN' using errcode='42501'; end if;
  perform id from public.profiles where role='admin' order by id for update;
  if exists(select 1 from public.profiles where id=p_target and role='admin' and active) and (p_role<>'admin' or not p_active) and (select count(*) from public.profiles where role='admin' and active)=1 then raise exception 'LAST_ADMIN_REQUIRED' using errcode='23514'; end if;
  insert into public.profiles(id,phone,display_name,role,employee_id,active) values(p_target,p_phone,p_name,p_role,p_employee,p_active)
    on conflict(id) do update set display_name=excluded.display_name,role=excluded.role,employee_id=excluded.employee_id,active=excluded.active,updated_at=now();
  if not p_active then delete from public.web_sessions where user_id=p_target; end if;
  insert into public.audit_logs(actor,request_id,action,fingerprint,result) values(p_actor,p_request,'account_update',p_target::text,jsonb_build_object('target',p_target,'role',p_role,'active',p_active));
end $$;

revoke all on function public.workspace_snapshot(date), public.commit_workspace(uuid,text,uuid,date,integer,text,jsonb,jsonb), public.consume_login_limit(text,integer), public.manage_profile(uuid,uuid,text,text,text,text,boolean,uuid) from public, anon, authenticated;
grant execute on function public.workspace_snapshot(date), public.commit_workspace(uuid,text,uuid,date,integer,text,jsonb,jsonb), public.consume_login_limit(text,integer), public.manage_profile(uuid,uuid,text,text,text,text,boolean,uuid) to service_role;
commit;
