-- Let a demo session own data. Apply after 0002_visual_analysis.sql.
--
-- `users` was declared as `id uuid primary key references auth.users (id)`, which is the
-- conventional Supabase profile-table shape and correct for real accounts. It also made a
-- hosted demo impossible: a demo session is a signed cookie, not a Supabase Auth account,
-- so `ensureUser` inserted a profile row for an id that does not exist in `auth.users` and
-- the foreign key rejected it. Creating any campaign failed at the first write.
--
-- Dropping the constraint decouples the profile table from the auth table. Nothing else
-- changes: the app still writes the auth user's own id into `users.id` for real sessions,
-- so the two stay aligned, and every row-level security policy keys off `auth.uid()`
-- rather than off this constraint.
--
-- What is genuinely lost is the `on delete cascade`: deleting a Supabase Auth account no
-- longer removes its profile row automatically. The orphan is inert — nothing can sign in
-- as it — but it is left behind, so account deletion should clear `users` explicitly.

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
    from pg_constraint
   where conrelid = 'public.users'::regclass
     and contype = 'f';

  if constraint_name is not null then
    execute format('alter table public.users drop constraint %I', constraint_name);
  end if;
end $$;

comment on table users is
  'Application profile. Ids match auth.users for real accounts, but the foreign key is deliberately absent so a demo session can own data without an auth account.';
