# ADHDice Build Brief

Last reviewed: 2026-06-04

ADHDice is a gamified task, focus, and personal-support app for ADHD brains. The core promise is still simple:

> Do real-life tasks and focus sessions, build momentum, and turn that progress into meaningful rewards.

This is an active working spec. It captures current product direction and roadmap priorities, not frozen implemented behavior; use the TaskApp contract docs for current behavior truth.

## Product Pillars

1. **Low-friction capture**
   - Adding a task should feel faster than opening a notes app.
   - Import pasted lists because people often collect tasks elsewhere first.
   - Default to "one next step" instead of complex project planning.

2. **Visible momentum**
   - Every completion should give immediate feedback.
   - Tasks track streaks, misses, and history in a way that is easy to scan.
   - The app should help users see what is moving and what is getting stuck.

3. **Reward loop**
   - Completing work grants points and XP.
   - Roll turns progress into game-like rewards without becoming punishing.
   - Achievements and dice-face language should reinforce progress without feeling childish or noisy.

4. **Gentle support**
   - Focus tools should make real work easier to start and sustain.
   - Health tools should feel encouraging, not judgment-heavy.
   - Empty and low-energy states should still suggest one clear next action.

## Current App Shape

Current as of this review, ADHDice already includes:

- authenticated task management with realtime sync
- task history, actual-time tracking, list routing, and multiple task views
- focus categories, timers, manual entries, and focus history
- a live Roll surface with reward boards, prize baskets, history, and point spending
- achievements with dice-face progression and celebration overlays
- a Health surface for check-ins, meals, weight, imported metrics, and Apple Health import groundwork
- notes, stats, settings, games, and isolated Test-page prototypes

## Major Product Surfaces

### Tasks

Tasks remains the primary dashboard.

Current direction:
- keep capture fast and forgiving
- keep list routing and filters powerful without making the page feel heavy
- strengthen history, streaks, and reward visibility where they help the user take action
- continue using Test-page prototypes before promoting large UI changes into the live Tasks surface

Important product truth:
- completing a task should feel like logging meaningful progress, not just toggling a checkbox
- history should remain central to streaks, misses, and stats
- task rewards should support motivation without punishing imperfect days

### Focus

Focus is the work-log and timer surface.

Current direction:
- keep timer flows simple enough to start quickly
- make category progress and history visible without turning the page into a dense analytics dashboard
- keep task handoff between Tasks and Focus smooth

### Roll

Roll is the reward page. It is not called Store in the UI.

Current direction:
- keep the roll loop emotionally safe and satisfying
- support meaningful reward variety through boards, pool prizes, and prize baskets
- keep the point economy understandable at a glance

Known current behavior:
- the app already supports roll history, free-roll banking, and managed reward pools
- the remaining product work is about balance, clarity, and reward quality more than simply making Roll exist

### Achievements

Achievements is now a real app surface, not just a future idea.

Current direction:
- use dice-face language and charged-set progress to make milestones feel native to ADHDice
- keep achievements motivational and readable
- align achievement rewards and presentation with the broader economy and Health systems

### Health

Health is now a real app surface, not just a future idea.

Current direction:
- keep care tracking gentle, local, and low-shame
- support easy daily check-ins, meal logging, weight trends, and imported metrics
- let Health connect to reminders and achievement language without turning it into a punitive compliance tool

## Current Data Model Areas

The app is no longer operating on a tasks-only schema.

Current major data areas include:
- tasks, task lists, manual memberships, subtasks, grid layouts, history, and actual-time entries
- user profiles and point ledger / reward infrastructure
- task reward rolls and reward claims
- roll history and reward-pool prize data
- focus categories, focus sessions, active sessions, and focus-day selections
- health profiles, check-ins, meals, weight entries, imported metrics, import audits, and health achievement awards

This means the roadmap should prioritize coherence and polish across existing systems, not pretend those systems still need to be invented from scratch.

## Current Roadmap Priorities

### 1. Tighten the core task-to-reward loop

Goal: make completions, history, streaks, and rewards feel clearly connected.

Focus:
- clearer reward visibility on task completion
- sharper economy messaging
- less ambiguity around streak/miss logic

### 2. Keep the main surfaces cohesive

Goal: make Tasks, Focus, Roll, Health, and Achievements feel like one product instead of adjacent experiments.

Focus:
- shared language and visual consistency
- clear handoff between pages
- aligned progress cues across work, rewards, and care

### 3. Continue safe TaskApp extraction

Goal: keep reducing `task-app.tsx` complexity without changing behavior.

Focus:
- preserve current routing and persistence semantics
- continue moving pure logic and standalone UI out of the orchestrator
- keep verification wave-based instead of drifting into abandoned long checks

### 4. Use the Test page intentionally

Goal: keep experimentation fast without destabilizing production surfaces.

Focus:
- prototype larger UI ideas on `Test`
- promote only the ideas that prove clearer and more cohesive
- avoid silent drift between prototype and live behavior

## UX Notes for ADHD

- Keep primary actions obvious and close to the task.
- Avoid making users configure too much before they can start.
- Prefer forgiving undo over confirmation dialogs.
- Use small numbers and simple language in the main UI.
- Put advanced stats behind details, not on every card.
- Celebrate completions without blocking the next action.
- Make empty states useful: suggest one tiny next step.
- Keep health and reward systems supportive rather than punitive.

## Current Open Product Questions

- How generous should the default task reward economy feel across easy vs hard tasks?
- How much should priority, urgency, energy, or repetition influence reward value?
- Which rewards should be system-authored, user-authored, or mixed?
- How should Roll balance surprise and emotional safety over time?
- How tightly should Health and Achievements feed into the shared economy versus staying mostly parallel?

## Current Implementation Snapshot

As of this brief, the repo includes:
- Next.js 16.2.4, React 19.2.4, Tailwind 4, and Supabase
- a large `src/components/task-app.tsx` orchestrator with extracted page adapters and helpers around it
- schema and type coverage for tasks, focus, roll/economy, achievements, health, and notes-related flows
- active documentation contracts for current behavior, orchestration boundaries, verification protocol, and UI system guidance

## Guidance For Future Work

- Treat this brief as roadmap and product-direction context.
- Treat the TaskApp contract docs as the source of truth for current implemented behavior.
- When a product decision is clearly resolved in code and UI, remove it from open questions and reflect it as current direction instead of leaving stale uncertainty in place.
