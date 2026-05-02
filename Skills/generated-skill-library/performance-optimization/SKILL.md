---
name: performance-optimization
description: Use this skill when performing frontend or backend performance optimization, bottleneck reduction, rendering improvements, and efficiency-focused code changes.
---

# Goal
Improve performance in ways that measurably reduce wasted work, latency, or resource consumption without sacrificing correctness.

# Instructions
1. Identify the likely bottleneck first instead of applying random optimizations.
2. Focus on the hottest path: rendering, network, database, bundle size, serialization, or repeated computation.
3. Implement the smallest change that removes meaningful waste, then reassess the new bottleneck.
4. Protect correctness, readability, and user experience while optimizing.
5. Review the result with metrics, edge cases, and fallback behavior in mind.

# Input
A request to speed up pages, APIs, rendering, queries, bundle size, or runtime efficiency.

# Output
Performance-oriented code changes, configuration updates, or structural improvements that target a clear bottleneck.

# Best Practices
- Measure or reason from evidence before optimizing.
- Optimize critical paths before micro-optimizing cold code.
- Avoid tradeoffs that make the system opaque for negligible gains.
- Preserve security and accessibility while chasing speed.
