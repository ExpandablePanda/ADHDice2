ADHDice is a gamified task, todo list, and personal planner prototype for ADHD minds. This clean prototype uses Next.js, TypeScript, Tailwind, and Supabase for auth, Postgres storage, and realtime task syncing.

For deeper project documentation, see `docs/INDEX.md`.

Last reviewed: 2026-06-04

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

Current app surfaces include task planning, focus tracking, reward rolls, achievements, health logging, notes, stats, and isolated Test-page prototypes, with realtime task syncing across signed-in browsers.

## Project Notes

This repository is intentionally separate from the older `adhdice-obsidian` prototype. Do not copy the old design system into this clean prototype.
