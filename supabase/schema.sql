-- © 2026 Wahidul Alam Riyad. All rights reserved. Proprietary — see LICENSE.
-- =============================================================================
--  Classfolio — Supabase schema (attendance, marks, portfolios)
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

-- =============================================================================
--  PART 2 — Student Management: course outcomes, assessment plan, marks,
--  project groups, grading and the student portal. Safe to re-run.
-- =============================================================================
alter table public.courses  add column if not exists credit_hours numeric(3,1);
alter table public.courses  add column if not exists cos jsonb not null default '[]'::jsonb;      -- [{code, statement, po, level}]
alter table public.courses  add column if not exists co_target int not null default 60 check (co_target between 0 and 100);
alter table public.sections add column if not exists instructor text check (instructor is null or length(instructor) <= 120);
alter table public.sections add column if not exists portfolio_published boolean not null default false;
alter table public.sections add column if not exists round_total boolean not null default true;
alter table public.sections add column if not exists grade_scale jsonb not null default
  '[{"min":90,"grade":"A+","point":4.00},{"min":85,"grade":"A","point":3.75},{"min":80,"grade":"B+","point":3.50},
    {"min":75,"grade":"B","point":3.25},{"min":70,"grade":"C+","point":3.00},{"min":65,"grade":"C","point":2.75},
    {"min":60,"grade":"D+","point":2.50},{"min":50,"grade":"D","point":2.25},{"min":0,"grade":"F","point":0}]'::jsonb;
alter table public.terms    add column if not exists weight numeric(5,2) check (weight is null or weight between 0 and 100);
alter table public.students add column if not exists special_grade text check (special_grade is null or special_grade in ('I', 'W', 'UW'));

create table if not exists public.assessments (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  term_id    uuid not null references public.terms(id) on delete cascade,
  name       text not null check (length(name) between 1 and 80),          -- e.g. Quiz 1, Criterion 1
  grp        text check (grp is null or length(grp) <= 80),                -- e.g. Quiz, Term Exam
  rule       text not null default 'sum' check (rule in ('sum', 'best', 'avg')),
  kind       text not null default 'marks' check (kind in ('marks', 'attendance')),
  max_marks  numeric(6,2) not null default 10 check (max_marks > 0),
  weight     numeric(6,2) not null default 10 check (weight between 0 and 100),   -- % of the term total
  co         text check (co is null or length(co) <= 10),
  by_group   boolean not null default false,
  visible    boolean not null default true,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.marks (
  id            bigint generated always as identity primary key,
  owner         uuid not null default auth.uid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id    text not null,
  score         numeric(6,2) check (score is null or score >= 0),
  updated_at    timestamptz not null default now(),
  unique (assessment_id, student_id)
);
create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  name       text not null check (length(name) between 1 and 40),
  title      text check (title is null or length(title) <= 160),
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  unique (section_id, name)
);
create table if not exists public.group_members (
  id         bigint generated always as identity primary key,
  owner      uuid not null default auth.uid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  student_id text not null,
  unique (section_id, student_id)                                          -- a student is in one group per section
);
create index if not exists assessments_section_idx on public.assessments (section_id);
create index if not exists marks_assessment_idx    on public.marks (assessment_id);
create index if not exists groups_section_idx      on public.groups (section_id);
create index if not exists group_members_group_idx on public.group_members (group_id);
create index if not exists students_sid_idx        on public.students (student_id);

alter table public.assessments   enable row level security;
alter table public.marks         enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
do $$
declare t text;
begin
  foreach t in array array['assessments','marks','groups','group_members'] loop
    execute format('drop policy if exists owner_all on public.%I', t);
  end loop;
end $$;
create policy owner_all on public.assessments for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid()
              and exists (select 1 from public.terms t join public.sections s on s.id = t.section_id
                          where t.id = term_id and s.id = section_id and s.owner = auth.uid()));
create policy owner_all on public.marks for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and exists (select 1 from public.assessments a where a.id = assessment_id and a.owner = auth.uid()));
create policy owner_all on public.groups for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and exists (select 1 from public.sections s where s.id = section_id and s.owner = auth.uid()));
create policy owner_all on public.group_members for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and exists (select 1 from public.groups g where g.id = group_id and g.section_id = section_id and g.owner = auth.uid()));
revoke all on public.assessments, public.marks, public.groups, public.group_members from anon;
grant select, insert, update, delete on public.assessments, public.marks, public.groups, public.group_members to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- -----------------------------------------------------------------------------
--  Student portal (no login): look up by Student ID, view portfolio, check in
-- -----------------------------------------------------------------------------
create or replace function public._norm_id(p text) returns text language sql immutable as
$$ select upper(regexp_replace(coalesce(p, ''), '\s', '', 'g')) $$;

create or replace function public.portal_lookup(p_student_id text)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_id text := _norm_id(p_student_id); r json;
begin
  if length(v_id) = 0 or length(v_id) > 30 then
    return json_build_object('ok', false, 'code', 'bad_id', 'message', 'Enter your Student ID.');
  end if;
  select coalesce(json_agg(row_to_json(q) order by q.created_at desc), '[]'::json) into r from (
    select se.public_token as token, co.code as course_code, co.title as course_title, co.credit_hours,
           se.name as section, se.class_code, i.name as intake, se.instructor, se.portfolio_published as published, se.created_at,
           (select json_build_object('term', t.name, 'number', cl.number, 'title', cl.title, 'expires_at', cl.expires_at,
                                     'status', (select a.status from attendance a where a.class_id = cl.id and a.student_id = v_id))
              from classes cl join terms t on t.id = cl.term_id
             where t.section_id = se.id and cl.is_open and cl.expires_at > now()
             order by cl.expires_at desc limit 1) as active,
           _student_summary(se.id, v_id) as summary
      from students st join sections se on se.id = st.section_id
      join courses co on co.id = se.course_id join intakes i on i.id = se.intake_id
     where st.student_id = v_id) q;
  if r::text = '[]' then
    return json_build_object('ok', false, 'code', 'not_found', 'message', 'No courses were found for this Student ID. Check the ID and try again.');
  end if;
  return json_build_object('ok', true, 'student_id', v_id, 'sections', r);
end $$;

create or replace function public.portal_portfolio(p_token text, p_student_id text)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_id text := _norm_id(p_student_id); s record; v_special text;
begin
  select se.id, se.name, se.class_code, se.instructor, se.grade_scale, se.round_total, se.min_attendance_pct, se.portfolio_published,
         co.code, co.title, co.credit_hours, co.cos, co.co_target, i.name as intake into s
    from sections se join courses co on co.id = se.course_id join intakes i on i.id = se.intake_id
   where se.public_token = p_token;
  if not found then return json_build_object('ok', false, 'code', 'invalid', 'message', 'This course could not be found.'); end if;
  select special_grade into v_special from students where section_id = s.id and student_id = v_id;
  if not found then return json_build_object('ok', false, 'code', 'not_enrolled', 'message', 'This Student ID is not on the list for this course.'); end if;
  if not s.portfolio_published then
    return json_build_object('ok', false, 'code', 'unpublished', 'message', 'Your instructor has not published the portfolio for this course yet.');
  end if;
  return json_build_object('ok', true,
    'course', json_build_object('code', s.code, 'title', s.title, 'credit_hours', s.credit_hours, 'cos', s.cos, 'co_target', s.co_target),
    'section', json_build_object('name', s.name, 'class_code', s.class_code, 'intake', s.intake, 'instructor', s.instructor,
                                 'grade_scale', s.grade_scale, 'round_total', s.round_total, 'min_attendance_pct', s.min_attendance_pct),
    'student', json_build_object('student_id', v_id, 'special_grade', v_special),
    'terms', (select coalesce(json_agg(json_build_object('id', t.id, 'name', t.name, 'weight', t.weight, 'sort', t.sort) order by t.sort, t.name), '[]'::json)
                from terms t where t.section_id = s.id),
    'assessments', (select coalesce(json_agg(json_build_object('id', a.id, 'term_id', a.term_id, 'name', a.name, 'grp', a.grp, 'rule', a.rule,
                      'kind', a.kind, 'max_marks', a.max_marks, 'weight', a.weight, 'co', a.co, 'visible', a.visible, 'sort', a.sort) order by a.sort), '[]'::json)
                from assessments a where a.section_id = s.id),
    'marks', (select coalesce(json_object_agg(m.assessment_id, m.score), '{}'::json)
                from marks m join assessments a on a.id = m.assessment_id
               where a.section_id = s.id and a.visible and m.student_id = v_id and m.score is not null),
    'averages', (select coalesce(json_object_agg(x.aid, x.av), '{}'::json) from (
                   select a.id as aid, round(avg(m.score), 2) as av
                     from assessments a join marks m on m.assessment_id = a.id and m.score is not null
                     join students st on st.section_id = a.section_id and st.student_id = m.student_id
                    where a.section_id = s.id and a.visible group by a.id) x),
    'classes', (select coalesce(json_agg(json_build_object('term_id', cl.term_id, 'number', cl.number, 'date', cl.class_date,
                   'held', (cl.opened_at is not null or exists (select 1 from attendance a where a.class_id = cl.id)),
                   'status', (select a.status from attendance a where a.class_id = cl.id and a.student_id = v_id)) order by t.sort, cl.number), '[]'::json)
                from classes cl join terms t on t.id = cl.term_id where t.section_id = s.id),
    'group', (select json_build_object('name', g.name, 'title', g.title,
                     'members', (select json_agg(gm2.student_id order by gm2.student_id) from group_members gm2 where gm2.group_id = g.id))
                from group_members gm join groups g on g.id = gm.group_id where gm.section_id = s.id and gm.student_id = v_id limit 1)
  );
end $$;

-- one place for students to check in: finds the open class in any of their sections
create or replace function public.portal_checkin(p_student_id text, p_pin text, p_device text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id text := _norm_id(p_student_id);
  v_pin text := regexp_replace(coalesce(p_pin, ''), '\D', '', 'g');
  c record; v_secret bytea; v_step bigint; n_open int := 0; v_fail int := 0; res jsonb;
begin
  if length(v_id) = 0 or length(v_id) > 30 then return json_build_object('ok', false, 'code', 'bad_id', 'message', 'Enter your Student ID.'); end if;
  if length(v_pin) <> 6 then return json_build_object('ok', false, 'code', 'bad_pin', 'message', 'The PIN has 6 digits.'); end if;
  v_step := _pin_step();
  for c in select cl.id as class_id, se.public_token as token, co.code, co.title
             from students st join sections se on se.id = st.section_id join courses co on co.id = se.course_id
             join terms t on t.section_id = se.id join classes cl on cl.term_id = t.id
            where st.student_id = v_id and cl.is_open and cl.expires_at > now() loop
    n_open := n_open + 1;
    select secret into v_secret from class_secrets where class_id = c.class_id;
    if exists (select 1 from attendance where class_id = c.class_id and student_id = v_id)
       or (v_secret is not null and (v_pin = _pin_for(v_secret, v_step) or v_pin = _pin_for(v_secret, v_step - 1))) then
      res := submit_attendance(c.token, v_id, v_pin, p_device)::jsonb;
      return (res || jsonb_build_object('course_code', c.code, 'course_title', c.title))::json;
    end if;
  end loop;
  if n_open = 0 then
    return json_build_object('ok', false, 'code', 'closed', 'message', 'None of your classes is taking attendance right now.');
  end if;
  for c in select cl.id as class_id
             from students st join terms t on t.section_id = st.section_id join classes cl on cl.term_id = t.id
            where st.student_id = v_id and cl.is_open and cl.expires_at > now() loop
    insert into failed_attempts (class_id, student_id, attempts, last_at) values (c.class_id, v_id, 1, now())
      on conflict (class_id, student_id) do update set attempts = failed_attempts.attempts + 1, last_at = now()
      returning greatest(attempts, v_fail) into v_fail;
  end loop;
  if v_fail >= 5 then
    return json_build_object('ok', false, 'code', 'locked', 'message', 'Too many wrong PINs. Ask your instructor to mark you.');
  end if;
  return json_build_object('ok', false, 'code', 'wrong_pin', 'message', format('Wrong or expired PIN. Check the screen and try again (%s left).', 5 - v_fail));
end $$;

revoke all on function public.portal_lookup(text)                 from public;
revoke all on function public.portal_portfolio(text, text)        from public;
revoke all on function public.portal_checkin(text, text, text)    from public;
grant execute on function public.portal_lookup(text)              to anon, authenticated;
grant execute on function public.portal_portfolio(text, text)     to anon, authenticated;
grant execute on function public.portal_checkin(text, text, text) to anon, authenticated;

-- =============================================================================
--  PART 3 — Classfolio: exact-grading defaults, rounded rubric groups,
--  portal rate limiting and optional portfolio access codes. Safe to re-run.
-- =============================================================================
alter table public.sections alter column round_total set default false;   -- AIUB: 85 – < 90 = A (no rounding)
alter table public.assessments drop constraint if exists assessments_rule_check;
alter table public.assessments add constraint assessments_rule_check check (rule in ('sum', 'best', 'avg', 'sum_up'));

create or replace function public._new_code() returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 32), 1), '')
    from (select extensions.gen_random_bytes(6) as b) x, generate_series(0, 5) i
$$;
alter table public.sections add column if not exists portfolio_code_required boolean not null default false;
alter table public.students add column if not exists access_code text not null default public._new_code();

-- private helper tables (no policies; functions only)
create table if not exists public.portal_seen (
  ip text not null, student_id text not null, at timestamptz not null default now(),
  primary key (ip, student_id)
);
create table if not exists public.portal_fail (
  section_id uuid not null references public.sections(id) on delete cascade, student_id text not null,
  attempts int not null default 0, last_at timestamptz not null default now(),
  primary key (section_id, student_id)
);
alter table public.portal_seen enable row level security;
alter table public.portal_fail enable row level security;
revoke all on public.portal_seen, public.portal_fail from anon, authenticated;

-- Slows down anyone trying many Student IDs: at most 300 different IDs per connection per hour.
create or replace function public._portal_guard(p_id text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_ip text; n int;
begin
  v_ip := coalesce(nullif(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1), ''),
                   current_setting('request.headers', true)::json ->> 'x-real-ip', 'unknown');
  if random() < 0.02 then delete from portal_seen where at < now() - interval '1 hour'; end if;
  if exists (select 1 from portal_seen where ip = v_ip and student_id = p_id and at > now() - interval '1 hour') then return true; end if;
  select count(*) into n from portal_seen where ip = v_ip and at > now() - interval '1 hour';
  if n >= 300 then return false; end if;
  insert into portal_seen (ip, student_id, at) values (v_ip, p_id, now()) on conflict (ip, student_id) do update set at = now();
  return true;
end $$;
revoke all on function public._portal_guard(text) from public, anon, authenticated;

-- portal_lookup with rate limit (same result as before)
create or replace function public.portal_lookup(p_student_id text)
returns json language plpgsql security definer set search_path = public as $$
declare v_id text := _norm_id(p_student_id); r json;
begin
  if length(v_id) = 0 or length(v_id) > 30 then
    return json_build_object('ok', false, 'code', 'bad_id', 'message', 'Enter your Student ID.');
  end if;
  if not _portal_guard(v_id) then
    return json_build_object('ok', false, 'code', 'rate', 'message', 'Too many look-ups from this connection. Please try again in an hour.');
  end if;
  select coalesce(json_agg(row_to_json(q) order by q.created_at desc), '[]'::json) into r from (
    select se.public_token as token, co.code as course_code, co.title as course_title, co.credit_hours,
           se.name as section, se.class_code, i.name as intake, se.instructor, se.portfolio_published as published,
           se.portfolio_code_required as needs_code, se.created_at,
           (select json_build_object('term', t.name, 'number', cl.number, 'title', cl.title, 'expires_at', cl.expires_at,
                                     'status', (select a.status from attendance a where a.class_id = cl.id and a.student_id = v_id))
              from classes cl join terms t on t.id = cl.term_id
             where t.section_id = se.id and cl.is_open and cl.expires_at > now()
             order by cl.expires_at desc limit 1) as active,
           _student_summary(se.id, v_id) as summary
      from students st join sections se on se.id = st.section_id
      join courses co on co.id = se.course_id join intakes i on i.id = se.intake_id
     where st.student_id = v_id) q;
  if r::text = '[]' then
    return json_build_object('ok', false, 'code', 'not_found', 'message', 'No courses were found for this Student ID. Check the ID and try again.');
  end if;
  return json_build_object('ok', true, 'student_id', v_id, 'sections', r);
end $$;

-- portfolio now takes an optional access code; the old 2-argument version is removed
drop function if exists public.portal_portfolio(text, text);
create or replace function public.portal_portfolio(p_token text, p_student_id text, p_code text default null)
returns json language plpgsql security definer set search_path = public as $$
declare v_id text := _norm_id(p_student_id); s record; st record; v_fail int;
begin
  if not _portal_guard(v_id) then
    return json_build_object('ok', false, 'code', 'rate', 'message', 'Too many look-ups from this connection. Please try again in an hour.');
  end if;
  select se.id, se.name, se.class_code, se.instructor, se.grade_scale, se.round_total, se.min_attendance_pct, se.portfolio_published,
         se.portfolio_code_required, co.code, co.title, co.credit_hours, co.cos, co.co_target, i.name as intake into s
    from sections se join courses co on co.id = se.course_id join intakes i on i.id = se.intake_id
   where se.public_token = p_token;
  if not found then return json_build_object('ok', false, 'code', 'invalid', 'message', 'This course could not be found.'); end if;
  select special_grade, access_code into st from students where section_id = s.id and student_id = v_id;
  if not found then return json_build_object('ok', false, 'code', 'not_enrolled', 'message', 'This Student ID is not on the list for this course.'); end if;
  if not s.portfolio_published then
    return json_build_object('ok', false, 'code', 'unpublished', 'message', 'Your instructor has not published the portfolio for this course yet.');
  end if;
  if s.portfolio_code_required then
    select attempts into v_fail from portal_fail where section_id = s.id and student_id = v_id and last_at > now() - interval '1 hour';
    if coalesce(v_fail, 0) >= 10 then
      return json_build_object('ok', false, 'code', 'locked', 'message', 'Too many wrong access codes. Try again in an hour or ask your instructor.');
    end if;
    if p_code is null or upper(regexp_replace(p_code, '\s', '', 'g')) <> st.access_code then
      if p_code is not null then
        insert into portal_fail (section_id, student_id, attempts, last_at) values (s.id, v_id, 1, now())
          on conflict (section_id, student_id) do update
            set attempts = case when portal_fail.last_at < now() - interval '1 hour' then 1 else portal_fail.attempts + 1 end, last_at = now();
      end if;
      return json_build_object('ok', false, 'code', 'need_code',
        'message', case when p_code is null then 'Enter the access code your instructor gave you.' else 'That access code is not correct.' end);
    end if;
    delete from portal_fail where section_id = s.id and student_id = v_id;
  end if;
  return json_build_object('ok', true,
    'course', json_build_object('code', s.code, 'title', s.title, 'credit_hours', s.credit_hours, 'cos', s.cos, 'co_target', s.co_target),
    'section', json_build_object('name', s.name, 'class_code', s.class_code, 'intake', s.intake, 'instructor', s.instructor,
                                 'grade_scale', s.grade_scale, 'round_total', s.round_total, 'min_attendance_pct', s.min_attendance_pct),
    'student', json_build_object('student_id', v_id, 'special_grade', st.special_grade),
    'terms', (select coalesce(json_agg(json_build_object('id', t.id, 'name', t.name, 'weight', t.weight, 'sort', t.sort) order by t.sort, t.name), '[]'::json)
                from terms t where t.section_id = s.id),
    'assessments', (select coalesce(json_agg(json_build_object('id', a.id, 'term_id', a.term_id, 'name', a.name, 'grp', a.grp, 'rule', a.rule,
                      'kind', a.kind, 'max_marks', a.max_marks, 'weight', a.weight, 'co', a.co, 'visible', a.visible, 'sort', a.sort) order by a.sort), '[]'::json)
                from assessments a where a.section_id = s.id),
    'marks', (select coalesce(json_object_agg(m.assessment_id, m.score), '{}'::json)
                from marks m join assessments a on a.id = m.assessment_id
               where a.section_id = s.id and a.visible and m.student_id = v_id and m.score is not null),
    'averages', (select coalesce(json_object_agg(x.aid, x.av), '{}'::json) from (
                   select a.id as aid, round(avg(m.score), 2) as av
                     from assessments a join marks m on m.assessment_id = a.id and m.score is not null
                     join students s2 on s2.section_id = a.section_id and s2.student_id = m.student_id
                    where a.section_id = s.id and a.visible group by a.id) x),
    'classes', (select coalesce(json_agg(json_build_object('term_id', cl.term_id, 'number', cl.number, 'date', cl.class_date,
                   'held', (cl.opened_at is not null or exists (select 1 from attendance a where a.class_id = cl.id)),
                   'status', (select a.status from attendance a where a.class_id = cl.id and a.student_id = v_id)) order by t.sort, cl.number), '[]'::json)
                from classes cl join terms t on t.id = cl.term_id where t.section_id = s.id),
    'group', (select json_build_object('name', g.name, 'title', g.title,
                     'members', (select json_agg(gm2.student_id order by gm2.student_id) from group_members gm2 where gm2.group_id = g.id))
                from group_members gm join groups g on g.id = gm.group_id where gm.section_id = s.id and gm.student_id = v_id limit 1)
  );
end $$;
revoke all on function public.portal_portfolio(text, text, text) from public;
grant execute on function public.portal_portfolio(text, text, text) to anon, authenticated;
revoke all on function public.portal_lookup(text) from public;
grant execute on function public.portal_lookup(text) to anon, authenticated;

-- faculty: new access codes for a whole section
create or replace function public.reset_access_codes(p_section uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update students set access_code = _new_code() where section_id = p_section and owner = auth.uid();
  get diagnostics n = row_count; return n;
end $$;
revoke all on function public.reset_access_codes(uuid) from public, anon;
grant execute on function public.reset_access_codes(uuid) to authenticated;

-- one-time fixes (run once, then remembered)
create table if not exists public.classfolio_migrations (name text primary key, at timestamptz not null default now());
alter table public.classfolio_migrations enable row level security;
revoke all on public.classfolio_migrations from anon, authenticated;
do $$ begin
  if not exists (select 1 from public.classfolio_migrations where name = 'round_total_off') then
    update public.sections set round_total = false;          -- match the Portfolio Excel files: grade the exact total
    insert into public.classfolio_migrations (name) values ('round_total_off');
  end if;
end $$;
