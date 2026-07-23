---
description: Branch the session from the current turn (or a named turn). Lets you try an alternative approach without losing the original.
argument-hint: [<turn-id>]
# generated-from: commands/fork.md
---

# /fork

Creates a branch in the tree-structured session (BRD §4.5). All subsequent turns go to the new branch until another `/fork` or `/tree <label>` switch.

## Usage

- `/fork` — branch from the current turn.
- `/fork <turn-id>` — branch from a specific earlier turn.

After forking, run `/branch <name>` to label the new path so you can come back to it. Unlabeled branches are addressable only by turn ID and become unreadable after a few forks.

## Worked example

```
1.  /plan implement auth
2.  ... attempt 1: bcrypt
3.  ... attempt 1 fails (timing-attack risk)
4.  /fork                       ← branch from turn 2
5.  /branch argon2-attempt
6.  ... attempt 2: argon2
7.  ... attempt 2 passes
```

The first branch remains in the tree under turn 3. Run `/tree` to see both. Run `/export` for a reviewable HTML rendering.

## Runtime

`node scripts/tree-sessions.js fork <session_id> [<turn_id>]`.
