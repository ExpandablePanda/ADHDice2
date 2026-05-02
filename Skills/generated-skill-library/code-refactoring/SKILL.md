---
name: code-refactoring
description: Use this skill when performing code refactoring, structural cleanup, duplication reduction, readability improvements, and maintainability-focused code changes.
---

# Goal
Improve code structure without changing intended behavior so the system becomes easier to understand, modify, and test.

# Instructions
1. Understand the current behavior and risks before moving code around.
2. Identify the main source of complexity: duplication, naming, long functions, mixed responsibilities, or tangled dependencies.
3. Refactor in small, behavior-preserving steps that keep the system runnable.
4. Rename and reorganize code toward clearer boundaries and more direct intent.
5. Review for regressions, test gaps, and whether the result is materially easier to work with.

# Input
A request to clean up code, reduce duplication, improve architecture, or make existing logic easier to maintain.

# Output
Refactored code with clearer structure, simpler responsibilities, and preserved behavior.

# Best Practices
- Prefer incremental safe changes over sweeping rewrites without verification.
- Keep naming specific and intention-revealing.
- Add or update tests when refactoring changes risk surface.
- Do not hide complexity by merely moving it to another file.
