# ADHDice Verification Standard

## Purpose

Verification must provide evidence that the changed production path is correct.

Passing many indirect tests is not sufficient when the actual rendered component, event handler, prop chain, data authority, or persistence path remains unverified.

Prefer relevant evidence over verification volume.

## General Rules

After any edit:

* inspect the final diff
* run `git diff --check`
* verify newly introduced identifiers and props
* rerun affected checks after the final production edit
* report what was and was not tested

Do not claim visible browser behavior passed unless it was actually tested through an authorized browser workflow.

Normal browser QA belongs to Andrew.

## Verification Classes

### Class 0: Documentation or Mechanical Work

Examples:

* Markdown changes
* copy changes
* version synchronization
* exact import correction
* obvious constant replacement

Required:

* inspect changed lines
* search renamed or replaced references when applicable
* `git diff --check`

Optional:

* targeted syntax or formatting check when already available and fast

Not required by default:

* lint
* typecheck
* tests
* build
* browser

### Class 1: Localized UI or Component Change

Examples:

* styling correction
* one component condition
* one effect dependency
* one local event behavior
* narrow prop forwarding

Required:

* identify the active rendered component
* inspect the event or effect path
* declaration-to-consumer audit for changed props and identifiers
* one existing focused check when it meaningfully covers the seam
* targeted source or lint check when fast
* `git diff --check`

Browser result:

* report as unverified until Andrew tests it

### Class 2: Shared React or Multi-File Behavior

Examples:

* shared component behavior
* state coordination
* adapters or mappers
* callbacks passed through several layers
* loading or readiness transitions
* shared task UI behavior

Required:

* identify owner, callers, and consumers
* inspect alternate active surfaces using the shared path
* audit every new prop, callback, identifier, and import
* focused tests for the affected contract
* targeted lint or typecheck only when it provides useful signal
* repository search for all changed symbols
* `git diff --check`

A late production edit invalidates prior checks covering that seam. Rerun them.

### Class 3: Data Authority or Business Logic

Examples:

* Task State Engine
* recurrence
* Task History
* rewards
* archive or restore behavior
* caching
* synchronization
* persistence logic

Required:

* identify the authoritative input and output
* identify competing derived or projected representations
* verify mutation and persistence boundaries
* focused invariant and regression tests
* test both the corrected case and one protected neighboring case
* inspect idempotency where relevant
* targeted static checks
* `git diff --check`

When multiple authorities exist, document which one wins and why.

### Class 4: SQL, Schema, or Data Repair

Required:

* identify the exact table, function, constraint, or row scope
* use read-only diagnosis before repair
* provide a preview or dry-run path
* use fail-closed guards
* guard user, identity, lifecycle, expected current values, and concurrency where relevant
* constrain the fields that can change
* provide postcondition verification
* verify safe rerun or explicit one-time behavior
* do not execute live SQL unless explicitly authorized
* link any new SQL file in the final response
* `git diff --check`

## Production-Path Requirement

At least one verification step must directly cover or statically validate the changed production seam.

Examples:

* the actual component that renders the behavior
* the actual effect that runs in production
* the real adapter used by Table or List View
* the active mutation function
* the real Task State Engine action authority
* the current persistence function or RPC

A helper-only test is insufficient when production wiring can still fail.

A synthetic component is insufficient when it omits the effect or consumer responsible for the bug.

## Identifier and Prop Audit

For every new or changed identifier, prop, callback, import, export, or context value:

1. locate its declaration
2. locate all references
3. verify each reference is in scope
4. verify each component receives or destructures it
5. verify adapters forward it consistently
6. verify renamed symbols have no stale references

This audit is required even when focused tests pass.

## Custom Test Infrastructure

Do not create a new:

* DOM harness
* browser simulator
* generalized mock framework
* reconciliation harness
* test runner
* replacement environment

unless explicitly authorized.

When the existing test environment cannot reproduce the production failure:

* state the limitation
* use source-level production-path inspection
* add only a narrow existing-style contract test when useful
* leave browser behavior for Andrew's QA

Do not manufacture an indirect environment and present it as equivalent to production.

## Test Scope

Ordinary UI tickets should normally remain within:

* one to four production files
* one to three focused test files
* a small number of load-bearing cases
* one focused test command
* one targeted static command
* `git diff --check`

Broader testing is appropriate for state-engine, recurrence, persistence, schema, or data-integrity work when explicitly justified.

Test quantity is not a success metric.

## Command Selection

Check `package.json` before naming commands.

Use the smallest command that covers the changed seam.

Do not run by default:

* full lint
* full typecheck
* the complete test suite
* production build
* dev server
* browser automation

Run a broader command only when:

* the change affects compilation or exports broadly
* focused validation is unavailable
* the task explicitly authorizes it
* the risk class justifies it
* the command is known to provide usable signal

## Time Limit

Stop a command that hangs or approaches 90 seconds.

Report:

* the command
* whether it produced output
* why it was stopped
* what narrower evidence was completed instead

Do not repeatedly rerun a hanging command without a concrete reason.

## Baseline Failures

When a check reports an apparently pre-existing failure:

* confirm that it is unrelated to the current diff before classifying it as baseline
* do not investigate unrelated baseline debt during a narrow ticket
* report the exact failing check
* do not describe a red suite as passed

Preferred wording:

* `Focused assertions for the changed seam passed; the command still exits red because of [named unrelated baseline failure].`

Do not use:

* `Tests passed except...`

## Late-Edit Rule

Any production-code edit made after verification begins invalidates previous checks covering that path.

After the final production edit:

* rerun the focused tests
* rerun the relevant identifier and prop search
* rerun the targeted static check when applicable
* rerun `git diff --check`

Do not rely on checks completed against an earlier version of the code.

## Browser QA

Unless explicitly authorized, Codex must not:

* start the dev server
* use browser automation
* use Playwright
* take screenshots
* inspect localhost or LAN previews
* claim manual browser verification

The final report should say:

`Browser behavior was not tested and remains pending Andrew's QA.`

ChatGPT should generate only the QA checks relevant to the changed feature.

## Failed-Fix Diagnosis

After two failed fixes, verification changes from patch validation to diagnosis.

The diagnosis must inspect:

1. active rendered component
2. active event handler or effect
3. active state and data owner
4. mutation and persistence path
5. cache, hydration, or readiness path
6. build, service-worker, PWA, or stale-bundle possibility
7. alternate component or adapter that may overwrite behavior
8. whether the edited file is actually active

No third speculative patch should be made without this evidence.

## Final Verification Report

Every implementation result must state:

1. checks run
2. exact result of each check
3. checks stopped or failed
4. known baseline failures
5. checks intentionally not run
6. browser QA status
7. remaining uncertainty

Never imply that unperformed validation passed.
