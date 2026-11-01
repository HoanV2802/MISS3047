-- Read-only verification of the scheduling schema and bound commit RPC.
-- Does not migrate, provision, seed, reset or expose credentials.
select version() as postgres_version;
select to_regclass('auth.users') as auth_users, to_regprocedure('auth.uid()') as auth_uid;
select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in (
 'employees','profiles','weekly_schedules','shifts','shift_registrations','shift_assignments',
 'registration_submissions','change_requests','approval_history','audit_logs','web_sessions','login_limits'
) order by tablename;
select p.proname, p.prosecdef, p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('workspace_snapshot','commit_workspace','consume_login_limit','manage_profile') order by p.proname;
select count(*) as employees, count(distinct id) as unique_employee_ids from public.employees;
select has_table_privilege('authenticated','public.profiles','UPDATE') as client_can_change_roles,
 has_table_privilege('authenticated','public.web_sessions','SELECT') as client_can_read_sessions,
 has_table_privilege('anon','public.employees','SELECT') as anonymous_can_read_employees;
-- Expected: 12 RLS=true tables; 4 definer functions with empty search_path,
-- anon/authenticated EXECUTE=false, service EXECUTE=true; 18 employees; 3 false grants.

select to_regprocedure('public.commit_workspace(uuid,text,uuid,date,integer,text,jsonb,jsonb,text)') is not null as bound_commit_installed,
       to_regprocedure('public.commit_workspace(uuid,text,uuid,date,integer,text,jsonb,jsonb)') is null as unbound_commit_removed;
-- Both must be true for the actor-bound API.

select count(*) = 3 as submitted_plan_columns_installed from information_schema.columns
where table_schema='public' and table_name='registration_submissions'
  and column_name in ('submitted_shifts','protected_shifts','needs_confirmation');
