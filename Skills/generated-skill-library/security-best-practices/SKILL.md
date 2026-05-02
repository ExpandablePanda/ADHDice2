---
name: security-best-practices
description: Use this skill when performing application security hardening, secure coding review, vulnerability reduction, and safety-focused web development work.
---

# Goal
Reduce security risk by applying secure design and implementation practices across frontend, backend, and infrastructure-touching code.

# Instructions
1. Identify the trust boundaries, sensitive data, privileged actions, and attacker-controlled inputs first.
2. Review the code path for common web risks such as injection, broken access control, XSS, CSRF, secrets exposure, and unsafe deserialization.
3. Implement layered mitigations using framework-safe defaults, validation, escaping, authorization, and secure storage practices.
4. Limit error leakage, logging exposure, and overly broad permissions throughout the flow.
5. Review the final design for least privilege, safe defaults, and operational follow-through.

# Input
A request to improve security, review risky code, harden authentication or authorization, or apply secure coding practices.

# Output
Security-focused code changes, risk analysis, and safer implementation patterns for the target system.

# Best Practices
- Prefer deny-by-default authorization and least-privilege access.
- Sanitize, validate, and escape at the correct boundaries.
- Never expose secrets, tokens, or internal stack details unnecessarily.
- Treat security findings as product issues that deserve verification, not only style concerns.
