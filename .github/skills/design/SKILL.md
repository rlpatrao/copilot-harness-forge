---
name: design
description: Generate system architecture and UI mockups. Spawns architect (if not already run) and ui-designer concurrently.
---

# Design Skill

Orchestrates the design phase by running the architect and ui-designer concurrently. If the architect has already been run (via `/architect` or `/build` Phase 2), this skill only spawns the ui-designer for mockups.

## Usage

```
/design
```

## Behavior

1. Check if `specs/design/architecture.md` exists and `project-manifest.json` has populated stack fields.
   - **If yes:** Architecture already done. Skip to step 3.
   - **If no:** Run `/architect` (full interactive flow). Wait for human approval.

2. After architecture approval, check project type:
   - **If `api-only`:** Skip UI mockups. Design phase complete.
   - **Otherwise:** Proceed to step 3.

3. Spawn `ui-designer` agent to create interactive mockups in `specs/design/mockups/`.

4. Present design summary to human for approval.

## Output

- `specs/design/` — all architecture artifacts (from architect)
- `specs/design/mockups/` — React+Tailwind HTML mockups (from ui-designer)
