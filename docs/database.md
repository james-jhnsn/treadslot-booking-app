# Database Design

## Tables

| Table | Purpose |
|---|---|
| `services` | Catalogue of bookable services (seeded, not customer-writable) |
| `slots` | Pre-scheduled appointment windows, each tied to a service |
| `bookings` | Customer reservations; the central write surface |

---

## Schema

```sql
-- ── services ──────────────────────────────────────────────────────────────────
create table services (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  duration_min int  not null,
  unique (name)
);

-- ── slots ─────────────────────────────────────────────────────────────────────
create table slots (
  id         uuid primary key default gen_random_uuid(),
  service_id uuid not null references services (id),
  starts_at  timestamptz not null,
  unique (starts_at)   -- single-technician model: one slot per start time
);

-- ── bookings ──────────────────────────────────────────────────────────────────
create table bookings (
  id                   uuid primary key default gen_random_uuid(),
  slot_id              uuid not null references slots (id),
  user_id              uuid not null references auth.users (id),
  status               text not null default 'booked'
                         check (status in ('booked', 'cancelled')),
  created_at           timestamptz not null default now()
);

-- Partial unique index: only one *active* booking per slot.
-- A cancelled booking releases the slot for re-booking.
create unique index one_active_booking_per_slot
  on bookings (slot_id)
  where (status = 'booked');
```

### Why `status` uses a `check` constraint instead of a Postgres enum

Adding a value to a `check` constraint is one `alter table` statement with no downtime. Postgres enum types require a type migration (`alter type ... add value`) that cannot be rolled back inside a transaction. For a two-value set, the check constraint is simpler and safer to evolve.

### Why `unique (starts_at)` stays on `slots` rather than the index

The slot table represents scheduled windows. Two slots at the same time would mean two technicians — a model this app does not support. The constraint belongs on `slots`, not on `bookings`. The booking-level index only prevents two customers from grabbing the same window.

---

## Seed Data

```sql
-- One service
insert into services (name, duration_min)
values ('Mobile Tire Installation', 60);

-- Weekday slots, 9 AM–4 PM (last slot starts 4 PM, ends 5 PM), next 7 days
insert into slots (service_id, starts_at)
select
  (select id from services where name = 'Mobile Tire Installation'),
  slot_time
from generate_series(
  date_trunc('day', now() + interval '1 day') + interval '9 hours',
  date_trunc('day', now() + interval '7 days') + interval '16 hours',
  interval '1 hour'
) as slot_time
where extract(dow from slot_time) between 1 and 5;  -- 1=Mon … 5=Fri
```

In production this seed would be replaced by an admin scheduling tool. For the assessment it gives the demo a realistic set of bookable windows without manual data entry.

---

## Convenience View

```sql
-- Slots that are in the future and not currently held by an active booking.
-- Left-joins only against status = 'booked' so a cancellation puts the
-- slot back in the list without deleting any rows.
-- security_invoker is NOT set — see explanation below.
create view available_slots as
  select
    s.id,
    s.starts_at,
    sv.id           as service_id,
    sv.name         as service_name,
    sv.duration_min
  from  slots s
  join  services sv on sv.id = s.service_id
  left  join bookings b on b.slot_id = s.id
                        and b.status = 'booked'
  where b.id is null
  and   s.starts_at > now()
  order by s.starts_at;

-- Without this grant, authenticated users cannot query the view even if
-- the underlying table policies allow it.
grant select on available_slots to authenticated;
```

### Why `security_invoker` is NOT used on this view

`security_invoker = true` (added in PostgreSQL 15) makes a view execute with the invoking user's permissions instead of the view owner's. For most views that expose per-user data this is the right call — but for `available_slots` it would be a correctness bug.

The view's LEFT JOIN on `bookings` needs to see **all** active bookings — not just the querying user's — to correctly identify which slots are taken. If `security_invoker = true` were set, the bookings RLS policy (`user_id = auth.uid()`) would apply inside the join, hiding every other customer's bookings. Slots booked by other users would appear falsely available, and the user would only discover the conflict when the insert hits the partial unique index and returns a `23505` error.

The view owner in Supabase is `postgres` (BYPASSRLS), so the default (owner's permissions) evaluates the LEFT JOIN against all bookings correctly. The view exposes no booking details — only slot metadata — so the bypass is safe.

The `GRANT SELECT ON available_slots TO authenticated` is still required. RLS controls row-level access; the grant controls whether the role can reference the view object at all. Without the grant, an authenticated user receives a permission-denied error before Postgres evaluates anything.

---

## Row-Level Security Policies

RLS is enabled on every table. Supabase's anon/authenticated roles are used — no custom roles.

```sql
-- services: read-only for signed-in users
alter table services enable row level security;

create policy "authenticated users can read services"
  on services for select to authenticated
  using (true);

-- slots: read-only for signed-in users
alter table slots enable row level security;

create policy "authenticated users can read slots"
  on slots for select to authenticated
  using (true);

-- bookings: each customer sees and manages only their own rows
alter table bookings enable row level security;

create policy "users can read own bookings"
  on bookings for select to authenticated
  using (user_id = auth.uid());

create policy "users can insert own bookings"
  on bookings for insert to authenticated
  with check (user_id = auth.uid());

-- Cancellation: USING filters the target row (must be owned + currently booked);
-- WITH CHECK validates the resulting row (must still be owned + must become cancelled).
create policy "users can cancel own bookings"
  on bookings for update to authenticated
  using  (user_id = auth.uid() and status = 'booked')
  with check (user_id = auth.uid() and status = 'cancelled');
```

### Why `with check` repeats `user_id = auth.uid()`

`USING` controls which existing rows can be targeted. `WITH CHECK` controls what the row is allowed to look like after the update. These are evaluated independently.

`WITH CHECK (status = 'cancelled')` alone does not mean "only the status column can change." A malicious client could craft an update that changes other columns — including `user_id` — while also setting `status = 'cancelled'`, satisfying that single condition. Keeping `user_id = auth.uid()` in `WITH CHECK` ensures the resulting row still belongs to the authenticated user, regardless of what other columns the client attempts to change.

---

## How Double-Booking Is Prevented

**The mechanism:** `create unique index one_active_booking_per_slot on bookings (slot_id) where (status = 'booked')`.

When a customer clicks "Book", the app calls `supabase.from('bookings').insert(...)`. Postgres evaluates the partial unique index before committing. If another row already exists with the same `slot_id` and `status = 'booked'`, the insert is rejected with error code `23505` (unique violation). The rejection happens inside the database transaction — it is atomic.

**Why a frontend check is not enough:**

A "check before insert" pattern — query available slots, confirm the slot is free, then insert — has a race condition. Between the check and the insert, another user's request can land and claim the slot. The window is milliseconds wide but real under any concurrent load.

Frontend checks also fail entirely when a user bypasses the UI — through browser devtools, a REST client, or a script hitting the Supabase API directly. RLS prevents them from reading other users' bookings, but without the database-level uniqueness constraint there is nothing stopping a direct insert.

The database constraint is the only correct place to enforce this invariant. The frontend check (re-fetching available slots on `23505`) is a UX improvement only — it refreshes the slot list so the customer sees the true current state.

**How cancellation interacts:**

A cancelled booking has `status = 'cancelled'`, so it is excluded from the partial index. When the last active booking for a slot is cancelled, no row with `status = 'booked'` remains in the index, and the slot becomes bookable again. No rows are deleted; the history is preserved.

---

## How RLS Prevents Cross-Customer Data Leaks

Every query to the `bookings` table is automatically filtered by the database before any rows are returned. The `using (user_id = auth.uid())` clause on the SELECT policy is evaluated by Postgres on every row, not by the application.

`auth.uid()` is injected by Supabase from the signed-in user's JWT, which is signed with a secret only Supabase holds. A customer cannot forge another customer's `auth.uid()` — not through the API, not through the client library, not by editing their JWT. If they send a tampered token, Supabase rejects the request before it reaches Postgres.

The practical result: a customer can call `select * from bookings` without any `where` clause and will only ever receive their own rows. They cannot enumerate other customers' bookings by trying different IDs.

---

## Schema Tradeoffs

| Tradeoff | What we chose | What we gave up |
|---|---|---|
| Single technician | `unique (starts_at)` on slots | Support for multiple technicians at the same time |
| Status as text + check | Simple to extend, no migration risk | Compile-time type safety inside the DB |
| No soft-delete on slots | Simpler model | Ability to retire a slot without breaking FK references |
| No audit log on cancellations | Fewer tables, simpler RLS | Record of who cancelled and when |
| No rebooking guard | A customer can re-book a slot they just cancelled | Prevents potential abuse of cancel-rebook cycling |
| Seed via `generate_series` | Realistic demo data, zero manual entry | Data expires; re-seeding required after 7 days |
