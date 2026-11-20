-- © 2026 Wahidul Alam Riyad. All rights reserved. Proprietary — see LICENSE.
-- =============================================================================
--  Attendance Management System — Supabase schema
--  Run this once in Supabase: Dashboard ▸ SQL Editor ▸ New query ▸ paste ▸ Run.
--  Safe to re-run: it creates what is missing and replaces the functions.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
--  Tables (every row belongs to the faculty member who created it: owner)
-- -----------------------------------------------------------------------------
create table if not exists public.intakes (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid(),
  name       text not null check (length(name) between 1 and 60),       -- e.g. Fall 2026-27
  created_at timestamptz not null default now(),
  unique (owner, name)
);

create table if not exists public.courses (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid(),
  code       text not null check (length(code) between 1 and 20),       -- e.g. CSC 3215
  title      text not null check (length(title) between 1 and 120),     -- e.g. Web Technologies
  created_at timestamptz not null default now(),
  unique (owner, code)
);

create table if not exists public.sections (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null default auth.uid(),
  intake_id    uuid not null references public.intakes(id) on delete cascade,
  course_id    uuid not null references public.courses(id) on delete cascade,
  name         text not null check (length(name) between 1 and 20),     -- e.g. R
  class_code   text check (class_code is null or length(class_code) <= 20),  -- e.g. 01553
  public_token text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  one_device_per_class boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (intake_id, course_id, name)
);

create table if not exists public.terms (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  name       text not null check (length(name) between 1 and 40),       -- e.g. Mid Term
  sort       int  not null default 1,
  unique (section_id, name)
);

create table if not exists public.classes (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid(),
  term_id    uuid not null references public.terms(id) on delete cascade,
  number     int  not null check (number between 1 and 200),            -- Class-01, Class-02 ...
  title      text check (title is null or length(title) <= 120),
  class_date date,
  is_open    boolean not null default false,
  opened_at  timestamptz,                                                -- first time a PIN session was started
  expires_at timestamptz,
  unique (term_id, number)
);

create table if not exists public.students (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  student_id text not null check (length(student_id) between 1 and 30),
  name       text not null default '' check (length(name) <= 120),
  seq        int  not null default 0,                                    -- order of the uploaded list
  unique (section_id, student_id)
);

create table if not exists public.attendance (
  id           bigint generated always as identity primary key,
  owner        uuid not null default auth.uid(),
  class_id     uuid not null references public.classes(id) on delete cascade,
  student_id   text not null,
  student_name text not null default '',
  submitted_at timestamptz not null default now(),
  source       text not null default 'pin' check (source in ('pin', 'manual')),
  device_id    text,
  unique (class_id, student_id)                                          -- no duplicate attendance
);

-- private tables: no policies, reachable only through the functions below
create table if not exists public.class_secrets (
  class_id uuid primary key references public.classes(id) on delete cascade,
  secret   bytea not null
);
create table if not exists public.failed_attempts (
  class_id   uuid not null references public.classes(id) on delete cascade,
  student_id text not null,
  attempts   int  not null default 0,
  last_at    timestamptz not null default now(),
  primary key (class_id, student_id)
);

alter table public.students add column if not exists seq int not null default 0;

-- v2 additions (safe to re-run on an existing database)
alter table public.attendance add column if not exists status text not null default 'present'
  check (status in ('present', 'late', 'excused'));                     -- excused counts as attended
alter table public.attendance add column if not exists note text check (note is null or length(note) <= 200);
alter table public.sections add column if not exists late_after_minutes int
  check (late_after_minutes is null or late_after_minutes between 1 and 180);   -- null = no late marking
alter table public.sections add column if not exists min_attendance_pct int not null default 80
  check (min_attendance_pct between 0 and 100);
alter table public.classes add column if not exists session_started_at timestamptz;   -- start of the latest PIN session

create index if not exists attendance_class_idx on public.attendance (class_id);
create index if not exists classes_term_idx     on public.classes (term_id);
create index if not exists terms_section_idx    on public.terms (section_id);
create index if not exists students_section_idx on public.students (section_id);

-- -----------------------------------------------------------------------------
--  Row Level Security: a faculty member sees and changes only their own rows.
--  Students (anon) have NO table access at all — only the two public functions.
-- -----------------------------------------------------------------------------
alter table public.intakes         enable row level security;
alter table public.courses         enable row level security;
alter table public.sections        enable row level security;
alter table public.terms           enable row level security;
alter table public.classes         enable row level security;
alter table public.students        enable row level security;
alter table public.attendance      enable row level security;
alter table public.class_secrets   enable row level security;
alter table public.failed_attempts enable row level security;

do $$
declare t text;
begin
  foreach t in array array['intakes','courses','sections','terms','classes','students','attendance'] loop
    execute format('drop policy if exists owner_all on public.%I', t);
  end loop;
end $$;

create policy owner_all on public.intakes for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
create policy owner_all on public.courses for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
create policy owner_all on public.sections for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid()
              and exists (select 1 from public.intakes i where i.id = intake_id and i.owner = auth.uid())
              and exists (select 1 from public.courses c where c.id = course_id and c.owner = auth.uid()));
create policy owner_all on public.terms for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and exists (select 1 from public.sections s where s.id = section_id and s.owner = auth.uid()));
create policy owner_all on public.classes for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and exists (select 1 from public.terms t where t.id = term_id and t.owner = auth.uid()));
create policy owner_all on public.students for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and exists (select 1 from public.sections s where s.id = section_id and s.owner = auth.uid()));
create policy owner_all on public.attendance for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and exists (select 1 from public.classes c where c.id = class_id and c.owner = auth.uid()));

revoke all on public.class_secrets, public.failed_attempts from anon, authenticated;
revoke all on public.intakes, public.courses, public.sections, public.terms, public.classes,
              public.students, public.attendance from anon;
-- Signed-in faculty need table access through the Data API (Row Level Security above
-- still limits each account to its own rows). Explicit, so it works even when
-- "Grant API access to new tables automatically" is off in the Supabase project.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.intakes, public.courses, public.sections, public.terms,
      public.classes, public.students, public.attendance to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- -----------------------------------------------------------------------------
--  Rotating PIN: 6 digits, changes every 15 seconds, derived on the server from a
--  random per-class secret with HMAC-SHA256 (same idea as authenticator apps).
-- -----------------------------------------------------------------------------
create or replace function public._pin_period() returns int language sql immutable as $$ select 15 $$;

create or replace function public._pin_step(ts timestamptz default now()) returns bigint
language sql stable as $$ select floor(extract(epoch from ts) / public._pin_period())::bigint $$;

create or replace function public._pin_for(p_secret bytea, p_step bigint) returns text
language sql immutable as $$
  select lpad((((((get_byte(h, 0) & 127)::bigint << 24)
               | (get_byte(h, 1)::bigint << 16)
               | (get_byte(h, 2)::bigint << 8)
               |  get_byte(h, 3)::bigint) % 1000000))::text, 6, '0')
  from (select extensions.hmac(convert_to(p_step::text, 'UTF8'), p_secret, 'sha256') as h) x
$$;

-- -----------------------------------------------------------------------------
--  Faculty functions (signed-in owner only)
-- -----------------------------------------------------------------------------
create or replace function public.open_class(p_class_id uuid, p_minutes int default 10)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_section uuid; v_exp timestamptz;
begin
  select t.section_id into v_section
    from classes c join terms t on t.id = c.term_id
   where c.id = p_class_id and c.owner = auth.uid();
  if v_section is null then raise exception 'Class not found'; end if;
  p_minutes := greatest(1, least(coalesce(p_minutes, 10), 180));
  v_exp := now() + make_interval(mins => p_minutes);

  -- only one open class per section at a time
  update classes c set is_open = false
    from terms t where t.id = c.term_id and t.section_id = v_section and c.id <> p_class_id and c.is_open;

  insert into class_secrets (class_id, secret) values (p_class_id, gen_random_bytes(32))
    on conflict (class_id) do update set secret = excluded.secret;
  update classes set is_open = true, opened_at = coalesce(opened_at, now()), session_started_at = now(), expires_at = v_exp,
         class_date = coalesce(class_date, (now() at time zone 'Asia/Dhaka')::date)
   where id = p_class_id;
  return json_build_object('ok', true, 'expires_at', v_exp);
end $$;

create or replace function public.extend_class(p_class_id uuid, p_minutes int default 5)
returns json language plpgsql security definer set search_path = public as $$
declare v_exp timestamptz;
begin
  update classes set expires_at = greatest(coalesce(expires_at, now()), now()) + make_interval(mins => greatest(1, least(p_minutes, 60)))
   where id = p_class_id and owner = auth.uid() and is_open
   returning expires_at into v_exp;
  if v_exp is null then raise exception 'Class is not open'; end if;
  return json_build_object('ok', true, 'expires_at', v_exp);
end $$;

create or replace function public.close_class(p_class_id uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  update classes set is_open = false where id = p_class_id and owner = auth.uid();
  delete from class_secrets s using classes c where s.class_id = c.id and c.id = p_class_id and c.owner = auth.uid();
  return json_build_object('ok', true);
end $$;

create or replace function public.current_pin(p_class_id uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare c record; v_secret bytea; v_step bigint; v_left numeric; v_present int; v_enrolled int;
begin
  select cl.*, t.section_id, se.late_after_minutes into c from classes cl join terms t on t.id = cl.term_id join sections se on se.id = t.section_id
   where cl.id = p_class_id and cl.owner = auth.uid();
  if not found then raise exception 'Class not found'; end if;
  select count(*) into v_present from attendance where class_id = p_class_id;
  select count(*) into v_enrolled from students where section_id = c.section_id;
  if not c.is_open or c.expires_at is null or c.expires_at <= now() then
    if c.is_open then update classes set is_open = false where id = p_class_id; end if;
    return json_build_object('is_open', false, 'present', v_present, 'enrolled', v_enrolled);
  end if;
  select secret into v_secret from class_secrets where class_id = p_class_id;
  v_step := _pin_step();
  v_left := (v_step + 1) * _pin_period() - extract(epoch from now());
  return json_build_object('is_open', true, 'pin', _pin_for(v_secret, v_step), 'seconds_left', round(v_left, 2),
                           'period', _pin_period(), 'expires_at', c.expires_at, 'server_time', now(),
                           'present', v_present, 'enrolled', v_enrolled,
                           'late_at', case when c.late_after_minutes is null then null
                                           else c.session_started_at + make_interval(mins => c.late_after_minutes) end);
end $$;

-- A student's own totals in a section (shown only after a valid PIN check-in)
create or replace function public._student_summary(p_section uuid, p_student text)
returns json language sql stable security definer set search_path = public as $$
  with held as (
    select cl.id from classes cl join terms t on t.id = cl.term_id
     where t.section_id = p_section
       and (cl.opened_at is not null or exists (select 1 from attendance a where a.class_id = cl.id))
  ), mine as (
    select a.status from attendance a join held h on h.id = a.class_id where a.student_id = p_student
  ), m as (select (select count(*) from held) as held, (select count(*) from mine) as attended,
                  (select count(*) from mine where status = 'late') as late,
                  (select min_attendance_pct from sections where id = p_section) as min_pct)
  select json_build_object('held', held, 'attended', attended, 'late', late, 'min_pct', min_pct,
                           'pct', case when held = 0 then null else round(attended * 100.0 / held) end) from m
$$;

-- -----------------------------------------------------------------------------
--  Public functions (students, no login)
-- -----------------------------------------------------------------------------
create or replace function public.get_section_public(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare s record; c record;
begin
  select se.id, se.name, se.class_code, co.code, co.title, i.name as intake into s
    from sections se join courses co on co.id = se.course_id join intakes i on i.id = se.intake_id
   where se.public_token = p_token;
  if not found then return json_build_object('ok', false, 'message', 'This attendance link is not valid.'); end if;
  select cl.number, cl.title, t.name as term, cl.expires_at into c
    from classes cl join terms t on t.id = cl.term_id
   where t.section_id = s.id and cl.is_open and cl.expires_at > now()
   order by cl.expires_at desc limit 1;
  return json_build_object('ok', true, 'course_code', s.code, 'course_title', s.title, 'section', s.name,
                           'class_code', s.class_code, 'intake', s.intake,
                           'active', case when c.number is null then null else
                             json_build_object('term', c.term, 'number', c.number, 'title', c.title, 'expires_at', c.expires_at) end);
end $$;

create or replace function public.submit_attendance(p_token text, p_student_id text, p_pin text, p_device text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id text := upper(regexp_replace(coalesce(p_student_id, ''), '\s', '', 'g'));
  v_pin text := regexp_replace(coalesce(p_pin, ''), '\D', '', 'g');
  v_dev text := left(nullif(trim(coalesce(p_device, '')), ''), 64);
  s record; c record; v_secret bytea; v_step bigint; v_name text; v_fail int; v_when timestamptz; v_status text;
  max_attempts constant int := 5;
begin
  if length(v_id) = 0 or length(v_id) > 30 then
    return json_build_object('ok', false, 'code', 'bad_id', 'message', 'Enter your Student ID.');
  end if;
  if length(v_pin) <> 6 then
    return json_build_object('ok', false, 'code', 'bad_pin', 'message', 'The PIN has 6 digits.');
  end if;

  select id, owner, one_device_per_class, late_after_minutes into s from sections where public_token = p_token;
  if not found then return json_build_object('ok', false, 'code', 'invalid_link', 'message', 'This attendance link is not valid.'); end if;

  select cl.id, cl.number, cl.session_started_at, t.name as term into c
    from classes cl join terms t on t.id = cl.term_id
   where t.section_id = s.id and cl.is_open and cl.expires_at > now()
   order by cl.expires_at desc limit 1;
  if not found then
    return json_build_object('ok', false, 'code', 'closed', 'message', 'Attendance is not open right now. Ask your instructor.');
  end if;

  -- already recorded? (idempotent, no duplicates)
  select submitted_at, status into v_when, v_status from attendance where class_id = c.id and student_id = v_id;
  if found then
    return json_build_object('ok', true, 'code', 'already', 'message', 'Your attendance for this class is already recorded.',
                             'term', c.term, 'class', c.number, 'at', v_when, 'status', v_status,
                             'summary', _student_summary(s.id, v_id));
  end if;

  select attempts into v_fail from failed_attempts where class_id = c.id and student_id = v_id;
  if coalesce(v_fail, 0) >= max_attempts then
    return json_build_object('ok', false, 'code', 'locked', 'message', 'Too many wrong PINs for this ID. Ask your instructor to mark you.');
  end if;

  select secret into v_secret from class_secrets where class_id = c.id;
  v_step := _pin_step();
  -- accept the current PIN and the previous one (covers the moment the PIN changes)
  if v_secret is null or (v_pin <> _pin_for(v_secret, v_step) and v_pin <> _pin_for(v_secret, v_step - 1)) then
    insert into failed_attempts (class_id, student_id, attempts, last_at) values (c.id, v_id, 1, now())
      on conflict (class_id, student_id) do update set attempts = failed_attempts.attempts + 1, last_at = now()
      returning attempts into v_fail;
    return json_build_object('ok', false, 'code', 'wrong_pin',
                             'message', format('Wrong or expired PIN. Check the screen and try again (%s left).', max_attempts - v_fail));
  end if;

  -- cross-check with the uploaded student list
  select name into v_name from students where section_id = s.id and student_id = v_id;
  if not found then
    return json_build_object('ok', false, 'code', 'not_enrolled', 'message', 'This Student ID is not on the list for this section.');
  end if;

  if s.one_device_per_class and v_dev is not null and exists (
       select 1 from attendance where class_id = c.id and device_id = v_dev and student_id <> v_id) then
    return json_build_object('ok', false, 'code', 'device_used',
                             'message', 'This device was already used to record another student in this class.');
  end if;

  v_status := case when s.late_after_minutes is not null and c.session_started_at is not null
                     and now() > c.session_started_at + make_interval(mins => s.late_after_minutes)
                   then 'late' else 'present' end;
  insert into attendance (owner, class_id, student_id, student_name, source, device_id, status)
  values (s.owner, c.id, v_id, coalesce(v_name, ''), 'pin', v_dev, v_status)
  on conflict (class_id, student_id) do nothing;
  delete from failed_attempts where class_id = c.id and student_id = v_id;

  return json_build_object('ok', true, 'code', 'recorded',
                           'message', case when v_status = 'late' then 'Attendance recorded (late).' else 'Attendance recorded.' end,
                           'name', v_name, 'term', c.term, 'class', c.number, 'at', now(), 'status', v_status,
                           'summary', _student_summary(s.id, v_id));
end $$;

-- -----------------------------------------------------------------------------
--  Who may call what
-- -----------------------------------------------------------------------------
revoke all on function public._pin_for(bytea, bigint)                  from public, anon, authenticated;
revoke all on function public._student_summary(uuid, text)             from public, anon, authenticated;
revoke all on function public.open_class(uuid, int)                    from public, anon;
revoke all on function public.extend_class(uuid, int)                  from public, anon;
revoke all on function public.close_class(uuid)                        from public, anon;
revoke all on function public.current_pin(uuid)                        from public, anon;
grant execute on function public.open_class(uuid, int)                 to authenticated;
grant execute on function public.extend_class(uuid, int)               to authenticated;
grant execute on function public.close_class(uuid)                     to authenticated;
grant execute on function public.current_pin(uuid)                     to authenticated;
grant execute on function public.get_section_public(text)              to anon, authenticated;
grant execute on function public.submit_attendance(text, text, text, text) to anon, authenticated;
