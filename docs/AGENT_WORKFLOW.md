# ADHDice Agent Workflow

## Purpose

This document defines how Andrew, ChatGPT, and Codex divide ADHDice development work.

The objective is controlled speed:

- fewer speculative patch loops
- less repeated context
- clearer product decisions
- narrower implementation tickets
- stronger production-path verification
- efficient use of Luna, Terra, and Sol

Codex is the implementation agent. It is not the product owner or default product designer.

## Roles

### Andrew

Andrew is the product owner and final decision-maker.

Andrew provides:

- ideas
- priorities
- screenshots
- bug reports
- logs
- Codex results
- browser QA
- final product approval

### ChatGPT

ChatGPT owns:

- product planning
- feature grouping
- scope control
- UX and system-design collaboration
- model selection
- Codex prompt design
- QA interpretation
- follow-up strategy
- documentation and workflow governance

ChatGPT should resolve known context before asking Andrew to repeat it.

### Codex

Codex owns:

- targeted repository inspection
- local dirty-tree inspection
- implementation
- focused verification
- concise reporting

Codex should not make unapproved product decisions or redesign adjacent systems.

## Standard Development Cycle

### 1. Intake

Andrew provides one or more ideas, bugs, or desired changes.

ChatGPT classifies each item as:

- bug
- feature
- UI polish
- design-system work
- data-model work
- performance work
- diagnostic-only work
- deferred idea

### 2. Roadmap

When several ideas are provided, ChatGPT first determines:

- which ideas belong together
- which must be split
- which need diagnosis
- likely authority boundaries
- regression risks
- recommended implementation order
- required product decisions

Do not immediately produce several long Codex prompts.

### 3. Select the Work Mode

Choose exactly one:

- Diagnose
- Implement
- Correct QA Failure
- Review
- Mechanical

A ticket should not switch modes halfway through unless the agent stops and reports why.

### 4. Diagnose When Necessary

Use a diagnosis-only ticket when:

- the active production path is uncertain
- multiple data authorities may conflict
- the issue survived one or more attempted fixes
- browser behavior contradicts passing tests
- the edited file may not be the live path
- recurrence, History, caching, synchronization, or persistence is involved
- the dirty tree contains interacting architectural work

Diagnosis returns evidence and a proposed boundary. It does not edit or bump the version.

### 5. Implement the Approved Outcome

Once the behavior and likely path are established, implementation should be direct.

The ticket specifies:

- desired outcome
- established evidence
- acceptance criteria
- allowed scope
- forbidden scope
- verification class
- version expectation

The implementation agent should not repeat the entire project history.

### 6. Andrew Performs Browser QA

ChatGPT converts the implementation result into a short, relevant QA set.

QA results are classified as:

- confirmed pass
- confirmed defect
- likely regression
- unclear and diagnostic
- unrelated observation

Do not treat source tests as a substitute for this step.

### 7. Correct One Observed Failure

A QA correction ticket addresses only the failed behavior.

It must begin with:

- observed result
- expected result
- affected surface
- relevant log, screenshot, or error when available

Do not add adjacent polish or deferred ideas.

### 8. Stop After Two Failed Fixes

After two unsuccessful fixes for the same issue:

- do not write a third patch prompt
- create a diagnosis-only ticket
- verify the real component, event, state, persistence, cache, and build paths

### 9. Checkpoint Stable Work

After QA passes:

1. inspect the worktree
2. confirm the intended diff
3. run `git diff --check`
4. create a local checkpoint commit after Andrew authorizes it
5. begin the next substantial ticket from a clearer baseline

Avoid stacking several architectural releases in one dirty worktree.

## Model Selection

Choose the least expensive model and reasoning strength that can safely complete the work.

### Luna Light

Use for:

- exact copy changes
- version synchronization
- documentation mechanics
- obvious missing imports
- precise one-file edits
- repository searches with a known target

### Luna Medium

Use for:

- small known bug fixes
- prop or callback threading
- effect dependency corrections
- narrow component behavior
- focused test updates
- clearly specified one-to-three-file implementations

### Luna High

Use for:

- diagnosed multi-file implementation
- moderate React state coordination
- shared mapper or adapter corrections
- changes spanning several known consumers
- implementation requiring repository inspection but not new architecture

### Luna XHigh

Reserve for:

- ambiguous cross-file diagnosis
- several competing state or data authorities
- recurrence or Task History semantics
- caching, readiness, or synchronization architecture
- complex dirty-tree reconciliation
- difficult performance ownership
- high-risk implementation where the architecture remains part of the task

Do not choose XHigh solely because many files may be touched.

### Terra Medium

Use as a fallback when:

- Luna repeatedly misreads the production path
- the implementation is established but requires steadier broad reasoning
- a complex multi-file correction does not justify Sol-level architecture work

### Sol Medium

Use for:

- SQL or schema work
- data repair
- concurrency
- realtime races
- serious persistence or data-integrity risk
- difficult architecture diagnosis where Luna is insufficient

### Sol High or Extra High

Use rarely for unresolved, high-risk problems where Medium reasoning has not produced a trustworthy plan.

## Reasoning Selection

- Light: mechanical and exact
- Medium: normal implementation baseline
- High: difficult multi-file reasoning
- Extra High: exceptional ambiguity or risk

Start lower when the root cause is already established.

Increase reasoning only when the task contains real unresolved complexity, not merely a long history.

## Fresh Thread Rules

Start a fresh Codex thread when:

- the next ticket is unrelated to the current one
- the thread contains several large completed tickets
- two fixes have failed
- the model repeatedly rereads old context
- stale assumptions are influencing the next task
- the dirty-tree baseline has materially changed
- a diagnosis is complete and implementation would benefit from a clean handoff

A fresh thread should receive a compact handoff containing only:

- current version
- current dirty-tree warning
- established diagnosis
- approved behavior
- relevant files or authorities
- explicit exclusions

Do not paste an entire historical conversation.

## Ticket Size

A larger integrated ticket is appropriate when:

- the changes share one behavioral authority
- diagnosis is complete
- acceptance criteria are coherent
- regression risks are understood
- the result can be QA'd as one feature group

Split the work when it mixes unrelated combinations such as:

- schema plus visual redesign
- recurrence plus table virtualization
- reward logic plus menu styling
- performance refactor plus new feature behavior
- History semantics plus unrelated Health work

## Prompt Design

Normal implementation prompts should contain:

1. Mode
2. Outcome
3. Established evidence
4. Acceptance criteria
5. Allowed scope
6. Forbidden scope
7. Verification
8. Version
9. Final response requirements

Do not include:

- motivational prose
- repeated project history
- copied UI policy blocks already stored in the repo
- full manual QA checklists
- broad permission to improve adjacent systems
- instructions to use the strongest available model
- speculative implementation details when Codex can inspect the established seam

## Standard Implementation Prompt Shape

```md
Mode: Implement

Outcome:
[Approved result.]

Established evidence:
[Known active path or diagnosis.]

Acceptance criteria:
1. [Criterion]
2. [Criterion]

Allowed scope:
- [Relevant systems or files.]

Do not touch:
- [Protected systems.]
- Unrelated UI, data behavior, or architecture.

Verification:
- Follow the applicable class in `docs/VERIFICATION.md`.
- Validate the exact production seam.
- Run `git diff --check`.
- Do not use browser automation.
- Browser behavior remains unverified until Andrew tests it.

Version:
- Bump to the next patch version for code changes.

Final response:
1. Changes
2. Files
3. Checks
4. Not tested
5. Remaining uncertainty
6. Version
```

## Usage Tracking

When Andrew supplies before-and-after five-hour usage percentages, record:

- model
- reasoning strength
- task mode
- elapsed usage change
- ticket size
- whether first-pass QA succeeded
- whether follow-up correction was required

Model recommendations should be adjusted based on ADHDice results, not community reputation alone.

The key efficiency metric is not lowest usage per ticket. It is useful completed work per unit of usage, including correction tickets.
