# Manual QA Checklist

Last reviewed: 2026-06-07

Role: active working

Use this as a repeatable browser smoke test after a Codex implementation pass. Keep it fast, focused, and scoped to the surfaces most likely to regress.

## When to use this checklist

- After implementation prompts.
- Before deploy.
- After fixes touching TaskApp, the task table, auth, Supabase, rewards, or routing.

## Auth

- [ ] Sign in succeeds and lands on the expected authenticated surface.
- [ ] Sign out succeeds and returns to the expected signed-out state.
- [ ] Refreshing the page keeps the correct signed-in or signed-out state.

## HUD / Navigation

- [ ] Main navigation loads without obvious missing sections or broken links.
- [ ] HUD controls render and respond without layout breakage.
- [ ] Switching between major surfaces does not show stale or incorrect data.

## Tasks

- [ ] Task list loads without blank states, console-visible crashes, or duplicate rows.
- [ ] Create, edit, complete, and reopen a task all work on the expected row.
- [ ] Task counts, badges, or visible status indicators update after task changes.

## Search

- [ ] Searching returns expected matching tasks or items.
- [ ] Clearing search restores the unfiltered state.
- [ ] Search does not trap the UI in an empty or stale results view.

## Trash

- [ ] Sending an item to trash removes it from the main active view.
- [ ] Trash view shows the trashed item.
- [ ] Restore or permanent-delete actions produce the expected result.

## Smart Lists

- [ ] Smart list filters load and show the expected subset of items.
- [ ] Switching between smart lists updates results without needing a refresh.
- [ ] Counts or empty states look correct for the selected smart list.

## Rewards / Roll

- [ ] Reward or roll controls are visible where expected.
- [ ] Triggering a reward or roll updates the UI without freezing or duplicate results.
- [ ] Any visible reward balance, result, or history indicator updates correctly.

## Focus

- [ ] Focus entry points open the expected surface or control state.
- [ ] Starting and stopping a focus session behaves as expected.
- [ ] Refreshing during or after focus does not leave the UI in an obviously broken state.

## Health

- [ ] Health page loads without obvious missing cards, blank panels, or crashes.
- [ ] Key health summaries or widgets display plausible values.
- [ ] Health actions or imports, if touched by the change, still respond as expected.

## Notes

- [ ] Notes surface loads the expected content.
- [ ] Create or edit flows save the expected note content.
- [ ] Returning to the notes surface shows the saved state instead of stale data.

## Stats

- [ ] Stats page loads without obvious calculation or rendering failures.
- [ ] Headline metrics look plausible after recent task or reward changes.
- [ ] Navigation away from and back to Stats keeps the page stable.

## Settings

- [ ] Settings page loads without missing controls or broken sections.
- [ ] Changing a safe setting persists or visibly updates as expected.
- [ ] Returning to Settings shows the updated value instead of stale state.

## Public Deploy Smoke Test

- [ ] Public deployed app loads without a blank screen or immediate auth loop.
- [ ] Sign-in, navigation, and the main changed surface behave the same as local expectations.
- [ ] Browser console or visible network failures do not reveal obvious deploy-only regressions.

## How to report failures back to Codex

- Observed behavior.
- Expected behavior.
- Page or surface where it happened.
- Browser and device used.
- Screenshot, console output, or logs if available.
