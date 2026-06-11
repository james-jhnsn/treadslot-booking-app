# TreadSlot — Mobile Tire Service Booking

**Live app:** https://your-site-name.netlify.app
**Repository:** https://github.com/james-jhnsn/treadslot-booking-app

A mobile-first booking app for same-day tire installation. Customers pick an available time slot, confirm a booking, and receive an AI-generated confirmation message. Technicians visit the customer's location.

## Test Credentials

A test account is pre-created on the live app:

| Field | Value |
|---|---|
| Email | `test@treadslot.dev` |
| Password | `test123456` |

Sign in at the live URL above — no sign-up needed. Feel free to create your own account too; email confirmation is disabled.

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Vite + React 18 + TypeScript (strict) |
| Auth & Database | Supabase (email/password auth, PostgreSQL + RLS) |
| Server Functions | Netlify Functions (TypeScript, esbuild) |
| AI Confirmation | Anthropic Claude API (`claude-haiku-4-5-20251001`) |
| Deployment | Netlify (frontend + functions) |

## Project Structure

```
treadslot-booking-app/
├── netlify/
│   └── functions/
│       └── confirm-booking.ts   # Claude API call — server-side only
├── src/
│   ├── components/              # NavBar, SlotCard, BookingCard, ProtectedRoute
│   ├── contexts/                # AuthContext (session management)
│   ├── hooks/                   # TanStack Query hooks per domain
│   ├── lib/                     # Supabase singleton client
│   ├── pages/                   # SignIn, SlotsPage, MyBookingsPage
│   └── types/                   # TypeScript interfaces for DB rows
├── supabase/
│   └── schema.sql               # Full schema: tables, RLS, view, seed data
├── docs/
│   ├── architecture.md
│   ├── database.md
│   ├── decisions.md
│   └── ai-log.md
├── .env.example                 # Commit this. Never commit .env.local.
└── netlify.toml
```

## Local Development

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)
- A [Netlify](https://netlify.com) account (for `netlify dev`)
- An [Anthropic API key](https://console.anthropic.com)

### 1. Clone and install

```bash
git clone <repo-url>
cd treadslot-booking-app
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with your real values:

| Variable | Where to find it | Used by |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | Browser (Vite) |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon / public key | Browser (Vite) |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys | Netlify Function only |

> **Security:** `ANTHROPIC_API_KEY` is never included in the browser bundle. It is read only inside `netlify/functions/confirm-booking.ts` via `process.env`. The Supabase service-role key is never used — all data access goes through the anon key + Row Level Security.

### 3. Apply the database schema

In the Supabase dashboard, open **SQL Editor** and paste the contents of `supabase/schema.sql`. Run it. This creates:

- `services` table (tire installation service)
- `slots` table (30 pre-seeded time slots over the next 7 weekdays)
- `bookings` table (with status model and partial unique index)
- `available_slots` view (slots with booking status)
- RLS policies for all tables

### 4. Enable email auth

In the Supabase dashboard: **Authentication → Providers → Email** — ensure it is enabled. For local testing, disable email confirmation under **Authentication → Settings → Disable email confirmations** (optional, speeds up dev).

### 5. Start the dev server

**With Netlify CLI** (recommended — runs the Netlify Function locally):

```bash
npm run dev:netlify
```

This starts both the Vite dev server and the Netlify Functions runtime. The confirm-booking function is available at `http://localhost:8888/.netlify/functions/confirm-booking`.

**Without Netlify CLI** (frontend only — AI confirmation will silently fail):

```bash
npm run dev
```

## Netlify Deployment

1. Push the repo to GitHub.
2. In Netlify: **Add new site → Import from Git** → select the repo.
3. Build settings are auto-detected from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Add environment variables in **Site → Environment variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `ANTHROPIC_API_KEY`
5. Deploy.

The `[[redirects]]` rule in `netlify.toml` handles SPA client-side routing — all 404s are rewritten to `index.html`.

## Architecture & Key Tradeoffs

The app is a Vite + React SPA deployed on Netlify, backed by Supabase for auth and data. There is no custom backend — all data access goes through the Supabase JS client using the anon key, protected entirely by Row Level Security. The only server-side code is a single Netlify Function that proxies the Claude API call so the API key never reaches the browser.

**Key tradeoffs:**

- **No service-role key in the frontend.** All queries run as the authenticated user under RLS. This means the `available_slots` view must run as the database owner (not `security_invoker`) so it can see all active bookings — not just the current user's — when determining which slots are taken. See `docs/decisions.md` ADR-003.
- **Cancellation uses a status field, not DELETE.** Cancelled bookings are retained for history. The partial unique index only counts `status = 'booked'` rows, so a cancelled slot automatically becomes available again without any extra logic.
- **AI confirmation is non-fatal.** The Claude API call happens after the booking INSERT succeeds. If it fails, the booking still goes through — the user just doesn't see a confirmation message. A Claude outage never breaks the booking flow.
- **Confirmation message is not persisted.** Storing it in the DB would conflict with the cancellation RLS policy (`WITH CHECK (status = 'cancelled')`). It lives in React state only, shown once after booking.

Full decision log: [`docs/decisions.md`](docs/decisions.md)
Full architecture diagrams: [`docs/architecture.md`](docs/architecture.md)

## How Double-Booking is Prevented

A **partial unique index** on the `bookings` table:

```sql
create unique index one_active_booking_per_slot
  on bookings(slot_id)
  where (status = 'booked');
```

This enforces at the database level that only one `booked` row can exist per slot. Two concurrent requests that both pass the application-level availability check will race to INSERT — one succeeds, the other hits a Postgres `23505` unique violation. The app catches that error code and surfaces it as a user-friendly "that slot was just taken" message, then refreshes the slot list. No advisory locks, no SELECT-then-INSERT race window.

## What I'd Do Next

Given more time, in priority order:

1. **Unit tests + CI** — Vitest unit tests for all hooks (especially `useCreateBooking` covering the `23505` error path) and a Playwright end-to-end suite for the booking and double-booking flows, running automatically on every push via GitHub Actions.
2. **Supabase Realtime** — subscribe to the `available_slots` view so the slot list updates live across all connected browsers when a booking is made or cancelled. The infrastructure is already in place; it's a `supabase.channel()` subscription away.
2. **Scheduled reminder function** — a Netlify scheduled function that queries for bookings starting in the next 24 hours and logs (or sends) a reminder. The Supabase service-role key would live server-side only in the function.
3. **Admin view** — a separate route (gated by a role claim in Supabase) showing all bookings and allowing slot management.
4. **Natural-language booking** — a Claude tool-use flow where a customer types "book me a tire install next Tuesday morning" and Claude resolves it to an available slot. The tool definitions would map to the existing `available_slots` view.

## What I Knowingly Skipped

- **Email sending** — reminders and confirmation emails are logged only. A real deployment would wire up Resend or SendGrid.
- **Rescheduling** — cancellation is implemented; rescheduling (cancel + re-book in one transaction) is not. It's straightforward to add as a Postgres function to keep it atomic.
- **Slot management UI** — slots are seeded via SQL. A real app needs an admin interface for the business owner to add, remove, or block slots.
- **Tests** — no automated tests in this submission. Vitest unit tests for the hooks and a Playwright e2e suite are the first thing I'd add; see "What I'd Do Next".

---

## Manual Test Checklist

### Auth

- [x] Sign up with a new email → lands on /slots
- [x] Sign out → redirected to /sign-in
- [x] Sign in with existing account → lands on /slots
- [x] Navigate directly to /slots or /my-bookings when signed out → redirected to /sign-in
- [x] Auth state persists on page refresh

### Booking

- [x] Available slots list loads and shows upcoming weekday times
- [x] Clicking "Book" on a slot creates a booking
- [x] Success state shows "Booking confirmed!" and the AI-generated message (or silently omits the message if the Claude API is unavailable)
- [x] The booked slot disappears from the available list after booking
- [x] Booking the same slot from two browser sessions simultaneously → second attempt shows "That slot was just taken" error and the list refreshes

### My Bookings

- [x] /my-bookings shows only the signed-in user's own bookings
- [x] Booked bookings show a "Cancel" button; cancelled ones show a "Cancelled" badge
- [x] Clicking "Cancel" changes the status to cancelled
- [x] Cancelling a booking makes the slot available again on /slots

### Edge Cases

- [x] Empty state shown when no slots are available
- [x] Empty state shown when user has no bookings
- [x] Error messages are user-friendly (no raw Postgres errors)
