---
description: Label the current path in the session tree (BRD §4.5) so it can be retrieved later via /tree <label>.
argument-hint: <label>
# generated-from: commands/branch.md
---

# /branch

Labels the current active path. Use after `/fork` to make the new branch retrievable.

## Usage

- `/branch <label>` — assign `<label>` to the current path's head turn.

## Conventions

- Labels are short (1-3 words) and descriptive: `argon2-attempt`, `bcrypt-rejected`, `cleanup-pass`.
- One label per branch (latest wins if you re-label).
- Don't use spaces; use hyphens.

See `commands/tree.md` and `skills/tree-sessions/SKILL.md`.

## Runtime

`node scripts/tree-sessions.js branch <session_id> <label>`.
