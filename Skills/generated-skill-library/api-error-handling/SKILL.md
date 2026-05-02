---
name: api-error-handling
description: Use this skill when performing API error handling, failure response design, exception mapping, resilience improvements, and observability-friendly backend behavior.
---

# Goal
Handle API failures consistently so clients receive useful responses and developers can diagnose problems quickly and safely.

# Instructions
1. Catalog the error types first: validation, authentication, authorization, not found, conflict, rate limit, dependency failure, and unexpected server error.
2. Map each error type to consistent HTTP status codes and response payloads.
3. Centralize error translation where possible so endpoints do not each invent their own failure shape.
4. Include enough context for debugging through structured logging, tracing, or error IDs without exposing secrets to clients.
5. Review retry behavior, user-facing messages, and how downstream failures are surfaced.

# Input
A request to improve API errors, exception handling, failure contracts, or backend resilience behavior.

# Output
Error-handling middleware, response schemas, exception mapping, and logging patterns for backend services.

# Best Practices
- Keep client-facing errors consistent and predictable.
- Separate operational details for logs from safe user-visible messages.
- Avoid swallowing exceptions without recording enough debugging context.
- Preserve correct status codes so clients can react intelligently.
