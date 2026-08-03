# Deploy

Last reviewed: 2026-08-03
Role: active working

## When to use this checklist

Use after a public deployment or when a ticket changes deployment configuration, authentication boot, routing, or a public-facing surface. Pair with the relevant subsystem checklist for feature-specific behavior.

## Checklist

- [ ] The public deployed app loads without a blank screen or immediate authentication loop.
- [ ] Public sign-in, navigation, and the main changed surface behave consistently with local expectations.
- [ ] Browser console or visible network failures do not reveal an obvious deploy-only regression.
