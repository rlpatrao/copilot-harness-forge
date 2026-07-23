# Scaffold-import checklist

This template is what the scaffold-import skill uses to communicate accepted formats and requirements to the user. Copy/paste this when asking the user for file paths.

---

## What you can provide

| Purpose | Accepted formats (v3.1.1) | Required? |
|---|---|---|
| Business Requirements Document | Markdown (`.md`) named any of: `BRD.md`, `brd.md`, `requirements.md`, `prd.md`, `PRD.md` | Yes (Branch B and C) |
| Architecture document | Markdown (`.md`) named any of: `architecture.md`, `Architecture.md`, `design.md`, `system-design.md` | Yes for Branch B; No for Branch C |

## What each file should contain

### BRD / requirements

- Problem statement or user story
- Success criteria or acceptance criteria
- Scope boundaries (in / out of scope)
- Any constraints (timeline, tech stack lock-ins, compliance)

Format is free — the architect and spec-writer will consume this document. Structure it however your organization does.

### Architecture

- High-level system components
- Data flow or request flow
- Data model (entities and relationships)
- Deployment topology
- External dependencies and integrations

If your architecture doc references diagrams stored elsewhere (Confluence, Miro, Excalidraw), inline or link them — the architect cannot follow off-repo links.

## What's not yet supported

- **Structurizr DSL** (`*.dsl`) — deferred to v3.1.10
- **PlantUML C4** (`*.puml`) — deferred to v3.1.10
- **Mermaid C4** (`*.mmd` with `C4Context` blocks) — deferred to v3.1.10

If you have one of these, please provide a Markdown equivalent for v3.1.1. AAC parsers land in a future increment.

## What happens after import

1. Your BRD is copied to `specs/brd/app_spec.md`
2. Your architecture is copied to `specs/design/architecture.md` (if provided)
3. Sentinel files (`.imported`) are written so downstream agents skip the interview
4. The architect runs in synthesis mode (Branch B) or interview mode (Branch C)
5. `/spec`, `/design`, `/build`, `/auto` proceed as normal

## To override an import later

```bash
rm specs/brd/.imported specs/design/.imported
/brd            # to redo BRD interview
/architect --restart   # to redo architect interview
```
