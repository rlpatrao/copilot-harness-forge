---
description: Navigate the session tree (BRD §4.5). With no argument, render the current tree. With a label, switch the active path.
argument-hint: [<branch-label>]
# generated-from: commands/tree.md
---

# /tree

Renders or navigates the tree-structured session per BRD §4.5.

## Modes

- `/tree` — render the current session graph; highlight the active path.
- `/tree <label>` — switch the active path to the labeled branch (must have been created by `/branch <label>` first).

## Output

```
session: <id>
active: <branch-label or "(unlabeled)">

  ● turn-001  (user)    "implement feature X"
  ● turn-002  (asst)    plan
  ┣ ● turn-003  (asst)    code attempt 1                 [branch: "first-try"]
  ┃   ● turn-004  (asst)    failed — backed out
  ┗ ● turn-005  (asst)    code attempt 2  ← active        [branch: "second-try"]
      ● turn-006  (asst)    passing tests
      ● turn-007  (user)    review
```

## Runtime

`node scripts/tree-sessions.js tree <session_id>` (or `switch <session_id> <label>` for the labeled form). See `skills/tree-sessions/SKILL.md` for the on-disk format.
