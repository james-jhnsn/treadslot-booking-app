-- =============================================================================
-- TreadSlot — Supabase schema
--
-- Run once against a fresh Supabase project via the SQL editor or CLI.
-- Users are managed entirely by Supabase Auth (auth.users).
-- Do NOT seed users here — create test accounts through the Auth UI or API.
-- =============================================================================


-- ── services ──────────────────────────────────────────────────────────────────
-- Catalogue of bookable services. Seeded by this script; not customer-writable.

create table public.services (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  duration_min int  not null check (duration_min > 0),
  unique (name)
);

alter table public.services enable row level security;

create policy "authenticated users can read services"
  on public.services
  for select
  to authenticated
  using (true);


-- ── slots ─────────────────────────────────────────────────────────────────────
-- Pre-scheduled appointment windows, each tied to a service.
-- unique (starts_at) encodes the single-technician model: no two slots can
-- share a start time because there is only one technician.

create table public.slots (
  id         uuid        primary key default gen_random_uuid(),
  service_id uuid        not null references public.services (id),
  starts_at  timestamptz not null,
  unique (starts_at)
);

alter table public.slots enable row level security;

create policy "authenticated users can read slots"
  on public.slots
  for select
  to authenticated
  using (true);


-- ── bookings ──────────────────────────────────────────────────────────────────
-- Customer reservations. The status column drives both the double-booking
-- guard and the cancellation flow.

create table public.bookings (
  id                   uuid        primary key default gen_random_uuid(),
  slot_id              uuid        not null references public.slots (id),
  user_id              uuid        not null references auth.users (id),
  status               text        not null default 'booked'
                                     check (status in ('booked', 'cancelled')),
  created_at           timestamptz not null default now(),
  confirmation_message text
);

-- Partial unique index: at most one row with status = 'booked' may exist per
-- slot_id. A cancelled booking is outside the index, so it releases the slot
-- for re-booking without deleting any history.
create unique index one_active_booking_per_slot
  on public.bookings (slot_id)
  where (status = 'booked');

alter table public.bookings enable row level security;

-- SELECT: customers see only their own rows.
create policy "users can read own bookings"
  on public.bookings
  for select
  to authenticated
  using (user_id = auth.uid());

-- INSERT: customers can only create bookings attributed to themselves.
-- with check prevents a client from forging a different user_id on insert.
create policy "users can insert own bookings"
  on public.bookings
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- UPDATE (cancellation only):
--   USING      — target row must belong to the caller AND currently be 'booked'.
--                A cancelled row is invisible to this policy; updates are silently
--                ignored rather than erroring, which is the correct idempotent UX.
--   WITH CHECK — the resulting row must still belong to the caller AND have
--                status = 'cancelled'. Repeating user_id here closes a gap:
--                WITH CHECK (status = 'cancelled') alone would not prevent a
--                malicious client from also changing user_id while setting status.
create policy "users can cancel own bookings"
  on public.bookings
  for update
  to authenticated
  using  (user_id = auth.uid() and status = 'booked')
  with check (user_id = auth.uid() and status = 'cancelled');


-- ── available_slots view ──────────────────────────────────────────────────────
-- Returns future slots that have no active (status = 'booked') booking.
-- Left-joining only on status = 'booked' means a cancellation puts the slot
-- back in the list without any row deletion.
--
-- security_invoker = true: the view executes with the permissions of the
-- querying user, not the view owner. Without this, the view owner's elevated
-- privileges could bypass RLS on the underlying tables. With it, the policies
-- on public.slots and public.services are evaluated as the authenticated caller.

create view public.available_slots
  with (security_invoker = true)
as
  select
    s.id,
    s.starts_at,
    sv.id           as service_id,
    sv.name         as service_name,
    sv.duration_min
  from  public.slots s
  join  public.services sv on sv.id = s.service_id
  left  join public.bookings b
          on b.slot_id = s.id
         and b.status  = 'booked'
  where b.id        is null
  and   s.starts_at  > now()
  order by s.starts_at;

-- GRANT is required independently of RLS.
-- RLS controls row-level access; this controls whether the role can reference
-- the view object at all. Without it, authenticated users get permission-denied
-- before Postgres even evaluates the underlying table policies.
grant select on public.available_slots to authenticated;


-- ── seed data ─────────────────────────────────────────────────────────────────
-- Only app data (services, slots) is seeded here.
-- Test user accounts must be created through Supabase Auth, not SQL.

insert into public.services (name, duration_min)
values ('Mobile Tire Installation', 60);

-- Weekday slots (Mon–Fri), 9 AM – 4 PM, for the next 7 calendar days.
-- generate_series produces one timestamptz per hour in the window;
-- the WHERE clause filters to weekdays only (dow 1 = Monday, 5 = Friday).
-- The last slot of each day starts at 16:00 and runs for 60 minutes (ends 17:00).
insert into public.slots (service_id, starts_at)
select
  (select id from public.services where name = 'Mobile Tire Installation'),
  slot_time
from generate_series(
  date_trunc('day', now() + interval '1 day') + interval '9 hours',
  date_trunc('day', now() + interval '7 days') + interval '16 hours',
  interval '1 hour'
) as slot_time
where extract(dow from slot_time) between 1 and 5;
