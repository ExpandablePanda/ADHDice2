---
name: rest-api-development
description: Use this skill when performing REST API endpoint design, request and response modeling, routing, resource handling, and web service implementation.
---

# Goal
Build clear, predictable REST APIs that expose resources consistently and are straightforward for clients to consume.

# Instructions
1. Model the resource and its lifecycle before writing routes, handlers, or response shapes.
2. Choose HTTP methods, status codes, and URI patterns that match the operation semantics.
3. Validate input, authorize access, and normalize error handling at the boundary of each endpoint.
4. Return consistent response shapes with clear success and failure contracts for clients.
5. Review for idempotency, pagination, filtering, and versioning needs where relevant.

# Input
A request to create or modify REST endpoints, controllers, handlers, or API route structures.

# Output
API route code, request and response contracts, and related server logic for RESTful services.

# Best Practices
- Keep endpoint behavior consistent across the API surface.
- Separate transport concerns from domain logic where the architecture allows.
- Avoid leaking internal implementation details in responses.
- Log and observe server behavior without exposing sensitive information.
