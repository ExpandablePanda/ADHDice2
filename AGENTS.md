<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This repository uses Next.js 16.2.4. APIs, conventions, and file structure may differ from older versions. When editing Next-specific behavior, read the relevant guide under `node_modules/next/dist/docs/` before relying on prior knowledge.

<!-- END:nextjs-agent-rules -->

# ADHDice Agent Rules

## Purpose

Work safely, efficiently, and with the smallest context and code surface that can correctly complete the requested ADHDice task.

Optimize for:

* production-path correctness
* low regression risk
* preservation of existing work
* compact context
* consistent product behavior and design
* clear reporting of uncertainty

Do not optimize for the number of files inspected, tests written, or checks passed.

## Documentation Read Order

Use documentation selectively.

1. Read this file.
2. Read `docs/INDEX.md` to locate the relevant source of truth.
3. Read `docs/CURRENT_STATE.md` only when current version, fragile areas, active work, or recent architecture matters.
4. Read only the subsystem documents relevant to the task.
5. Read archived or generated documentation only when explicitly requested or directly necessary.

Do not load the entire documentation directory by default.

Canonical documents describe implemented truth.

Active working documents describe current plans, unresolved decisions, and future direction.

Archived documents are historical reference and are not current product authority.

## Declare the Work Mode

Every task must operate in one primary mode.

### Diagnose

Inspect and report only.

* Do not edit files.
* Do not bump the version.
* Identify the active production render, event, data, and persistence paths.
* Return the most likely root cause and smallest safe implementation boundary.

### Implement

The behavior and implementation direction are already approved.

* Implement only the approved outcome.
* Do not reopen settled product decisions.
* Do not broaden the architecture without reporting the need first.

### Correct QA Failure

Fix one observed QA failure.

* Begin from the exact reported behavior, screenshot, error, or log.
* Confirm the active failing path before editing.
* Do not turn the correction into a feature or redesign pass.

### Review

Inspect an existing change without implementing new behavior.

* Check scope adherence.
* Look for production-path defects, missing bindings, incomplete prop forwarding, stale assumptions, and insufficient verification.
* Distinguish confirmed defects from unverified risks.

### Mechanical

Perform an exact, low-judgment edit.

Examples include copy changes, version synchronization, a known missing import, or a precisely identified one-file correction.

Do not introduce new abstractions during mechanical work.

## Preserve the Worktree

Before editing:

* inspect `git status`
* inspect relevant existing diffs
* identify files already modified
* treat unrelated uncommitted work as protected

Do not:

* reset, stash, clean, or otherwise discard changes without approval
* revert unrelated work
* reformat unrelated code
* stage unrelated files or commit or push unrelated changes
* claim pre-existing changes as part of the current task

When a required file already contains uncommitted work, make the smallest compatible change and report that the file had protected baseline edits.

## Commit and Push Policy

For every completed code-changing implementation or Correct QA Failure ticket:

* patch-bump the app version unless the ticket is explicitly exempted
* complete the required verification
* commit only ticket-related changes
* push the specified active branch to `origin`
* report the commit SHA, push result, and final `git status --short`

Exceptions are Diagnose, Review, planning, explicitly incomplete or unsafe work, and explicit `do not commit` or `do not push` instructions.

Documentation-only changes do not bump the app version by default, but the documentation update is still committed and pushed. Dirty-worktree protection always applies: do not stage unrelated files or include unrelated changes in a commit.

## Exploration

Start from the narrowest likely production seam.

Prefer:

* targeted repository searches
* small file ranges
* direct callers and consumers
* current production components
* existing focused tests

Avoid:

* scanning the entire repository
* loading several large files speculatively
* building generalized test infrastructure
* reading every related historical document
* investigating unrelated baseline failures

Before editing a UI behavior, confirm:

1. the active rendered component
2. the active event handler
3. the state or data owner
4. the mutation or persistence path, when applicable
5. whether another effect or adapter can overwrite the result

## Scope Discipline

One implementation task should normally target:

* one bug
* one feature slice
* one component family
* one data authority boundary
* one performance bottleneck

Do not combine product design, architecture, debugging, styling, refactoring, and performance work unless the ticket explicitly approves the combination.

Do not create new documentation, abstractions, schema, infrastructure, or shared primitives unless the task requires them.

When a schema change, new architectural layer, or additional subsystem becomes necessary but was not approved, stop and report the requirement before editing it.

## Editing

Before substantial edits, state the intended files or code paths.

During implementation:

* preserve existing behavior outside the approved seam
* reuse existing helpers and primitives
* avoid duplicate logic and constants
* keep feature, presentation, and persistence responsibilities distinct
* prefer a small local correction over opportunistic cleanup
* remove only dead code directly made obsolete by the current change

For every new identifier, prop, callback, or exported value:

* confirm where it is declared
* confirm every required caller supplies it
* confirm every consumer receives or destructures it
* confirm every reference is in scope
* search all repository references before finalizing

## Frontend Work

Follow:

* `docs/UI_SYSTEM.md`
* `docs/UI_SOURCE_MAP.md`

Reuse approved ADHDice primitives and live source surfaces.

Do not invent a new chip, card, menu, panel, typography, or interaction family when an approved pattern already fits.

Do not migrate deferred legacy surfaces during unrelated work.

When asked to match an existing UI element, compare and reuse its actual rendered structure, not only approximate CSS values.

## Verification

Follow `docs/VERIFICATION.md`.

Core requirements:

* validate the exact production seam that changed
* prefer relevant evidence over test volume
* rerun affected checks after the final production edit
* stop checks that hang or approach 90 seconds
* run `git diff --check` after code or documentation edits
* report browser behavior as unverified unless the user explicitly requested and authorized browser testing

Do not create a custom DOM harness, browser simulator, generalized mock framework, or replacement test environment unless explicitly authorized.

Do not run the dev server, browser automation, Playwright, screenshots, full lint, full typecheck, full tests, or production build by default.

Use those only when the task or `docs/VERIFICATION.md` specifically justifies them.

## Browser QA

Andrew performs normal browser QA.

Source checks and automated tests do not prove that visible UI behavior works.

The final response must distinguish:

* statically verified behavior
* test-covered behavior
* browser-unverified behavior

Do not use browser automation or local site inspection unless explicitly requested.

## Failed-Fix Stop Rule

After two unsuccessful implementation attempts on the same issue:

* stop patching
* switch to Diagnose mode
* verify the active component, event path, state/data path, persistence path, build/cache path, and possible overwrite path

Do not attempt a third speculative fix.

## Versioning

Use `MAJOR.MINOR.PATCH`.

For code-changing implementation work:

* bump to the next patch within the current release group
* keep all required version surfaces aligned
* use the current release group documented in `docs/CURRENT_STATE.md`

Do not bump the app version for:

* planning
* diagnosis-only work
* review-only work
* documentation-only changes

unless Andrew explicitly requests a tracked release.

Report existing version drift before changing it unless version synchronization is part of the task.

## Checkpoints

After the ticket's required verification passes, do not automatically begin another architectural ticket in the same dirty worktree.

Before the next substantial ticket, inspect:

* `git status`
* `git diff --stat`
* `git diff --check`

For completed work that is not covered by a Commit and Push Policy exception, commit only the intended ticket-related changes and push the specified active branch to `origin`. Then report the commit SHA, push result, and final worktree status before beginning another substantial ticket.

## Final Response

Keep implementation reports concise, normally under 200 words.

Report:

1. root cause or implementation summary
2. files changed
3. verification run
4. verification not run
5. remaining uncertainty
6. version result

Do not imply that unperformed browser, build, typecheck, lint, or full-suite validation passed.
