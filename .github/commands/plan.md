---
description: Spawn the read-only Planner subagent (BRD §3.5) to design an implementation approach. Returns a plan path under scratch/plans/.
argument-hint: <feature_id or short topic>
# generated-from: commands/plan.md
---

# /plan

Spawn the **Planner** subagent (`agents/planner.md`) to design an implementation plan for `$ARGUMENTS`.

The Planner runs with a tool schema reduced to `Read, Glob, Grep, WebFetch, WebSearch` — it cannot write, edit, or mutate. This is enforced at the SDK schema level (BRD §3.5), not by convention.

## Workflow

1. The Planner reads the relevant code, BRD sections, and existing files.
2. It produces a plan in the format documented in `agents/planner.md`.
3. The orchestrator persists the plan to `scratch/plans/<topic>.md`.
4. The user reviews; on approval, the main coding agent executes the plan in normal mode.

## When to use

- Before a feature with >3 file touches or >100 LoC of change.
- Before any change that crosses architecture boundaries (e.g., new agent + new hook + settings update).
- When the requirement is under-specified and the path forward is unclear.

## When NOT to use

- Trivial edits (typo fix, single-line change, simple rename).
- When the BRD or implementation plan already specifies file-level steps (e.g., the §1b / §1c sections of `brd/v3.0-implementation-plan.md`).
