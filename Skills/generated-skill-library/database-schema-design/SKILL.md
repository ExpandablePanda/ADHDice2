---
name: database-schema-design
description: Use this skill when performing relational or document database schema design, table modeling, indexing, and data relationship planning.
---

# Goal
Design database schemas that reflect the product domain accurately and support performance, integrity, and future evolution.

# Instructions
1. Clarify the domain entities, relationships, ownership rules, and lifecycle of the data before writing schema code.
2. Choose data structures and normalization levels that balance correctness, query needs, and operational simplicity.
3. Define keys, constraints, indexes, and referential rules around real access patterns instead of guessing.
4. Model timestamps, soft deletes, audit needs, and multi-tenant boundaries where relevant.
5. Review for migration safety, query efficiency, and how the schema will evolve over time.

# Input
A request to design tables, collections, migrations, indexes, or persistence models for application data.

# Output
Schema definitions, migrations, indexes, and data model guidance aligned with the application's domain.

# Best Practices
- Protect data integrity with constraints rather than relying only on application code.
- Index for real query patterns, not every possible column.
- Name tables and fields clearly enough to survive product growth.
- Design migrations to be understandable and safe to run in sequence.
