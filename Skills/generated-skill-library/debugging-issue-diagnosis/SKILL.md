---
name: debugging-issue-diagnosis
description: Use this skill when performing debugging, issue diagnosis, bug reproduction, root-cause analysis, and troubleshooting across the web stack.
---

# Goal
Find the real cause of a bug efficiently and fix it with enough confidence that the issue is unlikely to recur.

# Instructions
1. Reproduce the issue or reconstruct the failing conditions as precisely as possible.
2. Narrow the problem space by isolating inputs, layers, recent changes, and observable symptoms.
3. Collect evidence from code paths, logs, state transitions, and assumptions before deciding on a fix.
4. Implement the smallest fix that addresses the root cause rather than the nearest symptom.
5. Review whether tests, guards, or diagnostics should be added to prevent regressions.

# Input
A request to debug a failure, investigate unexpected behavior, diagnose an issue, or explain a bug.

# Output
A root-cause explanation, code fix, and any relevant verification or follow-up hardening changes.

# Best Practices
- Do not guess when the system can be observed.
- Keep hypotheses explicit and discard them quickly when evidence disagrees.
- Prefer fixes that explain the bug mechanically, not cosmetically.
- Capture learnings in tests or checks when the bug was subtle.
