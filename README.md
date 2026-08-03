# ADHDice

Last reviewed: 2026-08-03
Role: canonical project entry point

## Overview

ADHDice is a gamified task, todo-list, focus, and personal-support app for ADHD brains. It uses Next.js, TypeScript, Tailwind, and Supabase for authenticated data, Postgres-backed storage, and workspace synchronization.

This repository is intentionally separate from the older `adhdice-obsidian` prototype.

## Current Status

- Current app version: `7.6.35`.
- Current surfaces include Tasks, Focus, Roll, Achievements, Health, Notes, Stats, Settings, Games, and isolated Test-page prototypes.
- Current behavior authority is mapped in [`docs/INDEX.md`](docs/INDEX.md).
- Browser, live deployment, Supabase RPC, Realtime, and cross-tab behavior require separate verification; this README does not claim those are proven.

Tasks is the primary planning surface. Focus supports timers and work logs; Roll and Achievements support the reward loop; Health and Notes provide adjacent personal-support tools. The product brief describes direction, while the active architecture and decision documents describe current boundaries.

## Product Orientation

- Tasks handles capture, planning, hierarchy, recurrence, and History.
- Focus handles timers, work logs, and focus categories.
- Roll and Achievements connect progress to the reward loop.
- Health and Notes provide supportive personal-management surfaces.
- Test-page prototypes remain separate from the main production surfaces.

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the repository environment template:

   ```bash
   cp .env.example .env.local
   ```

3. Create or select a Supabase project, run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor, and set the required values in `.env.local`:

   ```text
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   ```

The environment template also contains optional development variables. Use only variables confirmed by the current `.env.example`; no Google deployment values are assumed here.

## Environment

Keep secrets server-side where the source requires it. Do not move server-only credentials into `NEXT_PUBLIC_*` variables. Local configuration is read from `.env.local`, which should not be committed.

## Run Locally

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Documentation

Start with [`docs/INDEX.md`](docs/INDEX.md), then load only the subsystem documents relevant to the work. Useful current references include [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md), [`docs/TASKAPP_ARCHITECTURE.md`](docs/TASKAPP_ARCHITECTURE.md), [`docs/TASK_STATE_ENGINE.md`](docs/TASK_STATE_ENGINE.md), [`docs/UI_SYSTEM.md`](docs/UI_SYSTEM.md), and the focused [QA checklists](docs/qa/).

## Deployment Status

The repository contains Supabase schema/setup material and source for the `on-time-route` Edge Function, but live deployment state is unverified. Optional Google integration configuration exists in source; public Pages variables, Edge deployment, and user-facing Google activation were not verified. Do not use the [archived Google setup material](docs/archive/2026-08-retired/google-deployment-setup.md) as current deployment authority without a fresh source and deployment review.

## Related Projects

The older `adhdice-obsidian` prototype is a separate project. Do not copy its design system, setup assumptions, or implementation history into this repository.
