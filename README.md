# TreadSlot — Mobile Tire Service Booking

A mobile-first booking app for same-day tire installation. Customers pick an available time slot, confirm a booking, and receive an AI-generated confirmation message. Technicians visit the customer's location.

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

## Manual Test Checklist

### Auth

- [ ] Sign up with a new email → lands on /slots
- [ ] Sign out → redirected to /sign-in
- [ ] Sign in with existing account → lands on /slots
- [ ] Navigate directly to /slots or /my-bookings when signed out → redirected to /sign-in
- [ ] Auth state persists on page refresh

### Booking

- [ ] Available slots list loads and shows upcoming weekday times
- [ ] Clicking "Book" on a slot creates a booking
- [ ] Success state shows "Booking confirmed!" and the AI-generated message (or silently omits the message if the Claude API is unavailable)
- [ ] The booked slot disappears from the available list after booking
- [ ] Booking the same slot from two browser sessions simultaneously → second attempt shows "That slot was just taken" error and the list refreshes

### My Bookings

- [ ] /my-bookings shows only the signed-in user's own bookings
- [ ] Booked bookings show a "Cancel" button; cancelled ones show a "Cancelled" badge
- [ ] Clicking "Cancel" changes the status to cancelled
- [ ] Cancelling a booking makes the slot available again on /slots

### Edge Cases

- [ ] Empty state shown when no slots are available
- [ ] Empty state shown when user has no bookings
- [ ] Error messages are user-friendly (no raw Postgres errors)
