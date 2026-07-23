---
name: architect
description: Stack interrogation (interview) OR synthesis from imported architecture. Single-doc review loop with approve/amend/restart. Handoff to /auto on approval. Runs after BRD approval, before spec decomposition.
argument-hint: [--from-import | --restart | --post-build]
# generated-from: commands/architect.md
---

# /architect — Stack & Design Architect

When the user runs this command, read and follow `.claude/skills/architect/SKILL.md` exactly.

Pass through any arguments:

- `--from-import` — force synthesis mode (requires `specs/design/.imported`). Skips 11-round interview; derives design artifacts from the imported architecture. See `.claude/skills/architect/synthesis-mode.md`.
- `--restart` — force interview mode even if `specs/design/.imported` exists. Archives any prior review docs. Used when the human explicitly wants to abandon a synthesized or previously-approved architecture.
- `--auto-approve` — (BRD v3.4) skip the review loop's A/M/R prompt in Step 6 and auto-approve v1. Only meaningful with `--from-import`: the imported architecture is treated as authoritative and re-approval is ceremonial. Explicitly refuses to auto-approve when in interview mode (that would skip the human decision on interview output, which is the wrong direction).
- `--post-build` — legacy: post-build learnings update only.

**Auto mode detection** (when no flag is passed): the skill's Step 0 checks for `specs/design/.imported` and prompts once. Default is synthesis when the sentinel exists.

**After Step 6 approval:** `state/architecture-approved.flag` is written and picked up by `hooks/session-start.js` on the next session, which surfaces a `/auto` suggestion.
