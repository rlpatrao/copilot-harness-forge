---
name: stack-learnings
description: Cross-project knowledge base. Read by architect before stack interrogation. Written by architect after design approval and post-build.
---

# Stack Learnings

The learnings folder (`.claude/learnings/`) is the harness's cross-project memory. It persists in the forge repo (not the target project) so knowledge transfers across all projects built with this harness.

## Folder Structure

```
.claude/learnings/
├── stack-decisions/                # One file per project
│   ├── _index.md                   # Summary table of all projects
│   ├── project-alpha-stack.md      # Full decision record
│   └── project-beta-stack.md
├── failure-patterns/
│   └── common-failures.md          # Recurring patterns across projects
└── integration-notes/              # Per-API/service notes
    ├── _template.md                # Template for new notes
    ├── stripe-integration.md
    └── sendgrid-integration.md
```

## Stack Decision Record Format

See `agents/architect.md` Phase 5 for the full template. Key sections:

- **Decisions** — each stack choice with rationale and alternatives considered
- **Verdict after build** — filled post-build by architect
- **Patterns That Worked** — extracted from learned-rules.md
- **Patterns to Avoid** — extracted from failures.md
- **Recommendations** — synthesis for similar future projects

## _index.md Format

```markdown
# Stack Decisions Index

| Project | Type | Stack | Date | Key Learning |
|---------|------|-------|------|-------------|
| Alpha | SaaS | FastAPI + React + PostgreSQL | 2026-03-15 | Async SQLAlchemy needs sync session for Alembic |
| Beta | Enterprise | Django + HTMX + PostgreSQL | 2026-03-20 | Django admin saved 2 weeks of UI work |
```

## Integration Notes Format

See `_template.md`. Key sections:

- **API Overview** — what it does, auth method
- **SDK/Client** — which library, version
- **Gotchas** — what went wrong during integration
- **Patterns** — what worked well
- **Test Fixtures** — how to mock/stub for testing

## Read Rules (for architect)

1. Read `_index.md` first to find relevant projects
2. Read full records for projects with similar type/stack
3. Read integration notes for any APIs mentioned in the BRD
4. Reference specific past experiences in recommendations

## Write Rules (for architect)

1. Write stack decision record immediately after design approval
2. Update _index.md with one-line summary
3. Post-build: fill in verdict, patterns, and recommendations
4. Post-build: create/update integration notes for external APIs used
5. Never delete existing records — the learnings folder is append-only
