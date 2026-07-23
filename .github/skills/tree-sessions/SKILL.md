---
name: tree-sessions
description: Sessions stored as trees (not lists). /fork creates a branch from any point; /tree navigates; /branch labels a path; /export produces HTML for review. All branches live in one session file under sessions/<project>/<session_id>.json.
when_to_use:
  - hard task where the first approach often fails — explore alternatives without losing the original
  - long debugging session — annotate the search tree with /branch
  - presenting a session to a reviewer — /export to HTML
brd_ref: §4.5
---

# Tree-structured sessions

Pi-mono (BRD §10.3 §4.5) treats sessions as trees: each turn is a node, and you can fork the tree at any point to try an alternative without abandoning the original. This is essential for hard tasks where the first approach fails.

## File layout

```
sessions/<project>/<session_id>.json
  {
    "session_id": "<uuid>",
    "root_turn_id": "<uuid>",
    "turns": [ {turn_id, parent_turn_id?, branch?, role, content, timestamp}, ... ],
    "active_path": ["<turn_id>", ...],
    "branches": { "<label>": "<turn_id>" }
  }

sessions/archive/<session_id>/transcript.json
  -- pre-compaction transcript snapshot (BRD §4.3)
```

## Commands

| Command | Action |
|---|---|
| `/tree` | Render the session graph in-place with active path highlighted. |
| `/fork [<turn_id>]` | Create a new branch from `turn_id` (default: current). All subsequent turns go to the new branch until another `/fork` or `/tree` switch. |
| `/branch <name>` | Label the current path so it's retrievable later. |
| `/tree <label>` | Switch the active path to a labeled branch. |
| `/export [<format>]` | Render the session as HTML (default) or Markdown for review. |

## Auto-save

Every turn is saved. The orchestrator maintains the file as JSONL-internally-but-JSON-on-disk: each turn appended atomically; the file is re-canonicalized periodically. Concurrent reads tolerate the in-progress state.

## Anti-patterns

- **Forking without labeling.** After 5 forks an unlabeled tree is unreadable. Use `/branch <name>` to keep your bearings.
- **Using `/fork` to undo.** `git revert` is the better tool for undoing. Forks are for *exploring* — you want both branches to remain visible.
- **Long-lived branches.** A fork that survives across days/sessions tends to drift. Either merge the learnings back to main or label the branch as abandoned.

## Source

Read-and-reimplement of `earendil-works/pi/packages/pi-coding-agent/src/session/` (MIT). The implementation lives at `scripts/tree-sessions.js`. See BRD §10.3 §4.5.
