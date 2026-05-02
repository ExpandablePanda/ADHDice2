# ADHDice Build Brief

ADHDice is a gamified task and focus app for ADHD brains. The core promise is simple:

> Do real-life tasks and focus sessions, earn points and XP, then spend points on dice rolls that unlock rewards.

This document turns the current idea cloud into a build map so future implementation can move faster without re-explaining the whole app every time.

## Product Pillars

1. **Low-friction capture**
   - Adding a task should feel faster than opening a notes app.
   - Import pasted lists because people often collect tasks elsewhere first.
   - Default to "one next step" instead of complex project planning.

2. **Visible momentum**
   - Every completion should give immediate feedback.
   - Tasks track hot streaks: consecutive days completed.
   - Tasks track missed streaks: consecutive days the task was expected but missed.
   - History should be visual enough to understand at a glance.

3. **Reward loop**
   - Completing tasks grants XP and spendable points.
   - XP represents long-term growth/status.
   - Points are currency for Roll.
   - Roll uses a D20-style dice mechanic to turn points into rewards.

4. **Focus support**
   - Focus timers log real work time.
   - Focus logs feed category goals and progress graphs.
   - The app should answer: "How much have I worked, and how much is left?"

## Main Pages

### Tasks

The task page is the primary dashboard for all to-do work.

Current prototype:
- Magic-link auth
- User-owned tasks
- Active/done/archive states
- Priority, energy, due date
- Pasted-line import
- Realtime sync

Target features:
- Status filters: active, done, archived, missed, due today, overdue
- View picker:
  - List view: default fast scanning
  - Matrix view: Eisenhower matrix
  - Card view: richer task cards with metadata
- Task detail panel or route:
  - Title, notes, status, priority, energy, due date
  - Completion history button
  - Streak stats
  - Reward information for completing the task
- History calendar:
  - Grid of days with colored squares
  - Completed, missed, skipped, and neutral days should be visually distinct
  - Start with one task's history; later add category/project history

Important behavior:
- Completing a task should create a task event/history row, not only update the task.
- Undoing completion should either remove/reverse the latest completion event or mark it as voided.
- Streaks should be derived from history when possible, with cached columns only if needed for speed.

### Roll

Roll is the reward page. It is not called Store in the UI.

Purpose:
- Spend earned points.
- Roll a D20.
- Receive rewards based on roll result, rarity, or reward table.

MVP behavior:
- Show current point balance.
- Button to roll D20 for a fixed cost.
- Deduct points when rolling.
- Show roll result and reward.
- Save roll history.

Reward examples:
- Small break
- Treat
- Custom user reward
- Cosmetic title/badge
- Bonus XP
- Reroll token

Open design choice:
- Decide whether rewards are purely user-created, built-in, or a mix.
- Decide whether roll outcome maps directly to rarity:
  - 1: bad/blank/funny miss
  - 2-9: common
  - 10-16: uncommon
  - 17-19: rare
  - 20: jackpot

### Focus

The focus page is a timer and work-log dashboard.

Target features:
- Multiple timer presets or clocks
- Start, pause, complete, cancel
- Category assignment for each focus session
- Goal tracking by category
- Logged focus history
- Progress check-ins:
  - Time worked today
  - Time remaining today
  - Time worked this week
  - Time remaining this week
  - Category breakdown
- Graphs:
  - Daily focus minutes
  - Weekly totals
  - Category distribution
  - Goal progress

Important behavior:
- Completing a timer should create a focus session log.
- Focus sessions can grant XP/points too, but likely at a different rate from tasks.
- Interrupted/canceled sessions may be saved separately or ignored; decide during build.

## Suggested Data Model

The current database only has `tasks`. The reward loop needs event tables.

Likely next tables:

### `task_events`

Records what happened to a task on a date.

Fields:
- `id`
- `user_id`
- `task_id`
- `event_type`: completed, missed, skipped, reopened, archived
- `event_date`
- `points_awarded`
- `xp_awarded`
- `created_at`

### `user_profiles`

Stores user-level game state.

Fields:
- `user_id`
- `xp_total`
- `point_balance`
- `level`
- `created_at`
- `updated_at`

### `point_ledger`

Tracks every point gain/spend so balances are auditable.

Fields:
- `id`
- `user_id`
- `source_type`: task, focus, roll, adjustment
- `source_id`
- `amount`
- `balance_after`
- `created_at`

### `rewards`

Reward definitions.

Fields:
- `id`
- `user_id`
- `title`
- `description`
- `rarity`
- `active`
- `created_at`

### `rolls`

Roll history.

Fields:
- `id`
- `user_id`
- `d20_result`
- `point_cost`
- `reward_id`
- `created_at`

### `focus_categories`

User-created work categories.

Fields:
- `id`
- `user_id`
- `name`
- `color`
- `daily_goal_minutes`
- `weekly_goal_minutes`
- `created_at`

### `focus_sessions`

Completed or attempted timer sessions.

Fields:
- `id`
- `user_id`
- `category_id`
- `planned_minutes`
- `actual_minutes`
- `status`: completed, canceled, interrupted
- `started_at`
- `ended_at`
- `points_awarded`
- `xp_awarded`

## MVP Build Order

### Phase 1: Task Rewards

Goal: make completing a task feel rewarding.

Build:
- Add `user_profiles`
- Add `task_events`
- Add `point_ledger`
- Award points and XP when task is marked done
- Show point balance and XP total in the header
- Show simple streak count on task cards

### Phase 2: Task Views and History

Goal: make the task dashboard feel like the real app.

Build:
- Status filters
- List/card/matrix view picker
- Task detail panel
- Task history calendar
- Missed streak logic for dated/repeating tasks

### Phase 3: Roll

Goal: close the loop from work to reward.

Build:
- Roll page
- D20 roll animation/result
- Point cost
- Reward table
- Roll history

### Phase 4: Focus

Goal: support timed work and progress goals.

Build:
- Focus page
- Timer presets
- Category selection
- Focus session logging
- Today/week progress summaries
- Basic graphs

## UX Notes for ADHD

- Keep primary actions obvious and close to the task.
- Avoid making users configure too much before they can start.
- Prefer forgiving undo over confirmation dialogs.
- Use small numbers and simple language in the main UI.
- Put advanced stats behind details, not on every card.
- Celebrate completions without blocking the next action.
- Make empty states useful: suggest one tiny next step.

## Open Questions

- Are tasks one-off only at first, or do we need repeating tasks immediately?
- What is the default point value for a task?
- Should priority/energy affect reward value?
- Do missed streaks apply only to repeating tasks and dated tasks?
- Should focus sessions earn Roll points, XP, or both?
- Are rewards authored by the user, seeded by the app, or both?
- Does Roll ever produce penalties, or should every roll be emotionally safe?

## Current Implementation Snapshot

As of this brief, the app has:
- Next.js 16.2.4, React 19.2.4, Tailwind 4, Supabase
- Main UI in `src/components/task-app.tsx`
- Database schema in `supabase/schema.sql`
- Types in `src/lib/database.types.ts`

The next implementation step should probably be Phase 1: add reward state and event logging before building more views. That keeps the central game loop honest.
