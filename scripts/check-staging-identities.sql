-- READ ONLY, after authorized provisioning. Aggregate output only: no credentials/tokens/phones.
begin transaction read only;
select role, count(*) as profiles, count(*) filter (where active) as active
from public.profiles group by role order by role;
select count(*) as identity_mismatches
from public.profiles p left join auth.users u on u.id=p.id
where u.id is null or not (
 (u.email ~ '^[a-f0-9]{64}@2ce-staging[.]invalid$' and u.email_confirmed_at is not null)
 or (ltrim(u.phone,'+') = ltrim(p.phone,'+') and u.phone_confirmed_at is not null)
) is true;
-- Email mode: UUID/confirmation/shape only. Exact HMAC ownership is verified by
-- scripts/check-staging-accounts.cjs with the server-only mapping key, never in SQL output.
select count(*) as employees_without_active_profile
from public.employees e left join public.profiles p on p.employee_id=e.id and p.role='employee' and p.active
where p.id is null;
select count(*) as auth_users_without_profile
from auth.users u left join public.profiles p on p.id=u.id where p.id is null;
select week_start, phase, revision,
 (select count(*) from public.shift_registrations r where r.week_start=w.week_start) as registrations,
 (select count(*) from public.shift_assignments a where a.week_start=w.week_start) as assignments,
 (select count(*) from public.registration_submissions s where s.week_start=w.week_start and s.disqualified) as excluded
from public.weekly_schedules w order by week_start;
commit;
