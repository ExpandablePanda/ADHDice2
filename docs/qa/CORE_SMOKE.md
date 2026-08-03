# Core Smoke

Last reviewed: 2026-08-03
Role: active working

## When to use this checklist

Use after an implementation pass or when a ticket changes shared startup, authentication, navigation, or an unspecified surface. Add the relevant subsystem checklist for feature-specific coverage.

## Checklist

- [ ] Sign in succeeds and lands on the expected authenticated surface.
- [ ] Sign out succeeds and returns to the expected signed-out state.
- [ ] Refreshing the page preserves the correct signed-in or signed-out state.
- [ ] Main navigation reaches the expected major surfaces without missing sections or broken links.
- [ ] HUD and navigation controls render and respond without obvious layout breakage.
- [ ] The changed surface opens successfully.
- [ ] The app does not show a blank screen, immediate crash, obvious duplicate data, or obviously stale data.
- [ ] When relevant, a basic create/edit/save path works and the visible result updates.
- [ ] When relevant, the reported browser or console-level failure is absent.
