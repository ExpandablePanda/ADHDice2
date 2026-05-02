---
name: authentication-systems
description: Use this skill when performing authentication flow implementation, session handling, token strategies, login systems, and identity-related backend work.
---

# Goal
Implement authentication flows that are secure, understandable, and well integrated with the surrounding application architecture.

# Instructions
1. Identify the authentication model first: session-based, token-based, federated, passwordless, or a hybrid.
2. Map the full user journey including sign-up, login, logout, reset, refresh, verification, and failure states.
3. Store secrets and credentials safely, hash passwords with modern algorithms, and protect transport and cookies appropriately.
4. Enforce authorization boundaries separately from authentication so permissions stay explicit.
5. Review for replay risks, token leakage, brute-force mitigation, and account recovery safety.

# Input
A request to build or improve login, signup, session management, tokens, account security, or authorization-adjacent flows.

# Output
Authentication and session code, middleware, handlers, or supporting data structures for secure user identity flows.

# Best Practices
- Never store plaintext secrets or passwords.
- Use secure cookie settings, expiration policies, and rotation strategies where relevant.
- Keep error messages informative without revealing account enumeration details.
- Design the recovery path with the same care as the happy path.
