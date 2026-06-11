# AI Usage Log

This document records how the Anthropic Claude API is used within TreadSlot and the design decisions behind that usage.

---

## Feature: Booking Confirmation Message

**File:** `netlify/functions/confirm-booking.ts`

### What it does

After a booking is successfully created, the frontend calls this Netlify Function with the slot's `startsAt` timestamp and `serviceName`. The function calls the Claude API and returns a short, friendly confirmation sentence that is shown to the user immediately after booking.

### Model

`claude-haiku-4-5-20251001`

Haiku was chosen over Sonnet or Opus because this task is simple (generate one sentence) and latency is user-facing — Haiku's response time is significantly faster. The quality difference for a 25-word confirmation sentence is negligible.

### Prompt design

```
Write a single friendly sentence (max 25 words) confirming a {serviceName}
appointment on {slotDate}. Be warm but concise. No greeting, no sign-off.
```

**Constraints applied:**

| Constraint | Why |
|---|---|
| Single sentence | Keeps the confirmation message compact in the UI |
| Max 25 words | Matches `max_tokens: 150` budget; prevents runaway output |
| No greeting | The UI already provides context; "Hi there!" is redundant |
| No sign-off | Same — the card UI frames the message |
| Warm but concise | Calibrates tone without over-specifying |

The slot time is formatted with `Intl.DateTimeFormat` before being injected into the prompt, so Claude receives a human-readable string like "Wednesday, June 11 at 9:00 AM EDT" rather than an ISO timestamp.

### Token usage

- `max_tokens: 150` — ample for one sentence; prevents cost blowout if the model produces more than requested
- Typical output: 15–25 tokens
- Typical input: ~60 tokens (prompt + system overhead)

### Failure handling

The Claude API call is wrapped in a try/catch. On any error (network failure, API outage, rate limit, invalid response), the function returns:

```json
{ "message": null }
```

with HTTP 200. The `useCreateBooking` hook treats the Netlify Function call as non-fatal:

- If `message` is `null`, the booking success state renders without a confirmation sentence
- The booking INSERT has already committed before this function is called
- A Claude outage never prevents a user from completing a booking

This design separates the core booking transaction from the AI enhancement layer. The AI confirmation is a UX improvement, not a required step.

### Security

- `ANTHROPIC_API_KEY` is read from `process.env` automatically by `new Anthropic()`
- The key exists only as a server-side environment variable in the Netlify Functions runtime
- It is never included in the Vite browser bundle
- It is never committed to the repository (`.env.local` is git-ignored; only `.env.example` is committed)

### Text extraction

The Claude API response content is a typed union. Text is extracted with an explicit type guard:

```typescript
for (const block of response.content) {
  if (block.type === 'text') {
    message = block.text.trim()
    break
  }
}
```

This is required because the response may include non-text content blocks (e.g., tool use). Accessing `block.text` without narrowing `block.type === 'text'` first would be a TypeScript error and a runtime bug.

---

## Scope

The Claude API is used in exactly one place in this codebase. It is not used for:

- Slot availability logic (pure SQL)
- Auth or booking validation (Supabase + RLS)
- Any data that is persisted to the database

The confirmation message is ephemeral — displayed once after booking, stored only in React component state, and discarded on navigation.
