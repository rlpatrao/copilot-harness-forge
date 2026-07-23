---
description: Export the current session as HTML (default) or Markdown for review.
argument-hint: [html | md]
# generated-from: commands/export.md
---

# /export

Renders the tree-structured session (BRD §4.5) as a reviewable document.

## Formats

- `html` (default) — single-file HTML with the tree visualized inline. Suitable for sharing with a reviewer.
- `md` — Markdown rendering. Suitable for committing into the repo as a session record.

## Output

Writes to `sessions/<project>/<session_id>.export.{html,md}`.

## Runtime

`node scripts/tree-sessions.js export <session_id> [html|md]`.

## When to use

- After a long debugging session you want to attach to a PR.
- When archiving a session before letting it age out.
- For team review of a complex feature implementation.
