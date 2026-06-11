# Architecture Decision Records

Key design choices made during the build, with context and trade-offs.

---

## ADR-001: Partial Unique Index for Double-Booking Prevention

**Decision:** Use a partial unique index on `bookings(slot_id) WHERE status = 'booked'` instead of application-level checks.

**Context:** Two users can open the slot list simultaneously and both attempt to book the same slot. An application-level SELECT-then-INSERT has a race window — both reads can see the slot as available before either write commits.

**Alternatives considered:**

| Option | Problem |
|---|---|
| SELECT availability, then INSERT | Race condition: two concurrent transactions both see the slot free |
| Advisory locks | Requires lock management; complex to hold across a network boundary |
| Transactions with SERIALIZABLE isolation | Works but heavy; requires retry logic |
| Partial unique index | Atomic at the DB level; zero application logic needed |

**Why this choice:** The partial index enforces the invariant atomically at the database level. The application only needs to catch Postgres error `23505` (unique violation) and surface it as a user-friendly "slot taken" message. Cancelled bookings don't count toward uniqueness — a cancelled slot can be re-booked — because the WHERE clause scopes the constraint to `status = 'booked'` only.

**Trade-off:** The index is slightly non-obvious to developers who don't know PostgreSQL partial indexes. The database layer documentation (`docs/database.md`) explains it explicitly.

---

## ADR-002: Status Model for Cancellation (Not DELETE)

**Decision:** Cancellation sets `status = 'cancelled'` on the booking row. Rows are never deleted.

**Context:** The original schema had no cancellation. Adding it required choosing between a soft-delete (status field) and a hard-delete (DELETE the row).

**Why soft delete:**

- **Audit trail:** Cancelled bookings are retained for customer history and potential dispute resolution.
- **Re-booking support:** The partial unique index (ADR-001) keys on `status = 'booked'`, so a cancelled slot naturally becomes available again without any extra code.
- **RLS simplicity:** The cancellation UPDATE policy can be expressed as a single `WITH CHECK (status = 'cancelled')` — no special delete policy needed.

**Trade-off:** Queries that show "available slots" must filter out `status = 'booked'` rather than relying on row existence. The `available_slots` view handles this consistently.

---

## ADR-003: `available_slots` View Without `security_invoker`

**Decision:** The `available_slots` view runs with owner-level permissions (the default) rather than `security_invoker = true`.

**Context:** During design, adding `security_invoker = true` was considered to make the view's RLS posture explicit. It was removed after identifying a critical correctness bug.

**The bug:** With `security_invoker = true`, the view runs as the authenticated user. The bookings RLS policy restricts rows to `auth.uid() = user_id` — so the view can only see the calling user's own bookings. This means a slot booked by another user appears to have no active booking, so it shows up as available in the slot list. Double-bookings become possible.

**Correct behavior:** The view must see *all* active bookings (regardless of who made them) to correctly mark slots as unavailable. Running as the owner (postgres), which bypasses RLS, achieves this. The `GRANT SELECT ON available_slots TO authenticated` ensures only authenticated users can query the view at the role level.

**Trade-off:** The view runs with elevated privilege. This is intentional and safe here because the view only exposes aggregated availability (is the slot booked — true/false), not PII from other users' bookings. No other user's personal data is exposed.

---

## ADR-004: Confirmation Message Stored in React State Only

**Decision:** The AI-generated booking confirmation message is stored in component state after the booking mutation succeeds. It is not persisted to the database.

**Context:** The booking flow calls the Netlify Function after a successful INSERT, receives a confirmation message, and shows it to the user. The natural instinct is to store this back in the `bookings` table. This would require:

- A `confirmation_message` column on `bookings`
- An UPDATE after the booking is created
- An RLS UPDATE policy permissive enough to allow this field to be written

**The conflict:** The RLS UPDATE policy for cancellation is:

```sql
with check (status = 'cancelled')
```

This means the authenticated user can only UPDATE a booking if the result has `status = 'cancelled'`. A subsequent UPDATE to set `confirmation_message` would be rejected by this check because the row's status would remain `'booked'`.

Relaxing the `WITH CHECK` would open up a privilege escalation path where a user could manipulate other fields during a cancellation UPDATE.

**Why React state:** The confirmation message is ephemeral — it's shown once after booking and then discarded. Storing it client-side avoids DB complexity with no meaningful user-facing loss. If the user refreshes the page, the message is gone, which is acceptable behavior for a transient notification.

---

## ADR-005: Netlify Functions for the Claude API Call

**Decision:** The Anthropic API is called from a Netlify Function (`netlify/functions/confirm-booking.ts`), not from the browser.

**Context:** The API key `ANTHROPIC_API_KEY` must never be exposed to the browser. Calling the Anthropic API directly from frontend code would require embedding the key in the client bundle.

**Why Netlify Functions:**

- The function runs server-side; the key is only available as a server environment variable
- Co-located with the frontend in the same repo and deployment
- No separate backend service to operate
- TypeScript-native via esbuild bundler

**Failure handling:** The function returns HTTP 200 with `{ message: null }` if the Claude API call fails, rather than a 5xx. The `useCreateBooking` hook treats the function call as non-fatal — the booking INSERT has already succeeded by the time the function is called. A Claude outage should never break the booking UX.

---

## ADR-006: TanStack Query for Server State

**Decision:** All Supabase data fetching and mutations use TanStack Query (`useQuery`, `useMutation`), not `useState` + `useEffect`.

**Alternatives considered:**

| Option | Problem |
|---|---|
| `useState` + `useEffect` + manual fetch | Boilerplate per hook; no deduplication; manual cache invalidation |
| SWR | Less mutation support; smaller ecosystem for our use case |
| TanStack Query v5 | Handles loading/error states, deduplication, cache invalidation |

**Why TanStack Query:** The slot list and bookings list need to stay coherent after mutations (book a slot → slot should disappear from the available list; cancel a booking → slot should reappear). TanStack Query's `invalidateQueries` handles this cleanly. The `isPending` state on mutations drives button disabled states without manual boolean tracking.

---

## ADR-007: Auth Flash Prevention via `loading` Initial State

**Decision:** `AuthContext` initializes `loading` as `true` and sets it to `false` only after `getSession()` resolves (or immediately on `onAuthStateChange` for subsequent events).

**Context:** On first render, the auth state is unknown — the Supabase client needs an async `getSession()` call to read the stored session. If `ProtectedRoute` redirected to `/sign-in` before that check completed, signed-in users would see a redirect flash on every page load.

**Implementation:** `ProtectedRoute` renders a loading spinner when `loading === true`. Once `loading` is false, it either renders the protected content (if `user` is set) or redirects to `/sign-in`. This adds one async round-trip on app load but eliminates the flash entirely.
