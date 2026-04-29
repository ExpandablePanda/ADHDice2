ADHDice is a gamified task, todo list, and personal planner prototype for ADHD minds. This clean prototype uses Next.js, TypeScript, Tailwind, and Supabase for auth, Postgres storage, and realtime task syncing.

## Getting Started

Install dependencies, then run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in Safari or another browser.

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local`.
4. Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. Restart `npm run dev`.

The first app pass supports magic-link sign-in, user-owned tasks, basic task capture, pasted-line imports, archive/done states, and realtime refreshes across browsers logged into the same account.

## Project Notes

This repository is intentionally separate from the older `adhdice-obsidian` prototype. Do not copy the old design system into this clean prototype.
