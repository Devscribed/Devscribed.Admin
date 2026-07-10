# Devscribed Booking

Candidate-facing interview booking pages — step 1 of the hiring process
(`specs/hiring-process`). A self-contained Next.js (App Router) app that owns
the UI, API routes, Microsoft Graph integration, persistence, and CV storage.

## Requirements

- Node 20+
- A Microsoft Graph app registration (app-only / client-credentials) with
  admin-consented **application** permissions:
  - `Calendars.ReadWrite`
  - `MailboxSettings.Read`
  - `User.Read.All`

## Setup

```bash
cd apps/booking
npm install
cp .env.local.example .env.local   # then fill in the values
```

Fill `.env.local` with the Graph tenant/client/secret and the hiring
manager's mailbox address. See `.env.local.example` for the full list.

## Scripts

| Command            | What it does                          |
| ------------------ | ------------------------------------- |
| `npm run dev`      | Start the dev server (http://localhost:3000) |
| `npm run build`    | Production build                      |
| `npm run typecheck`| `tsc --noEmit`                        |
| `npm run lint`     | ESLint (Next config)                  |
| `npm test`         | Unit tests (Vitest)                   |

## Phase 1: Graph spike

Confirms credentials work and that we can read the two availability inputs
(working hours + busy blocks). With `.env.local` filled and `npm run dev`
running:

```
GET http://localhost:3000/api/dev/graph-spike?date=2026-07-09
```

Returns the hiring manager's working hours and busy intervals for the day.
This route is dev-only (404 in production) and will be removed once the real
availability engine (Phase 2) is in place.

## Structure

```
app/                     # routes (pages + API handlers)
  api/dev/graph-spike/   # Phase 1 spike (temporary)
src/lib/
  config.ts              # env-backed configuration
  interview-types.ts     # the three booking links (15/30/60 min)
  graph/                 # Microsoft Graph client + availability reads
```
