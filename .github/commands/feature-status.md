---
description: Print feature_list.json pass/fail counts plus the next unblocked failing feature.
# generated-from: commands/feature-status.md
---

# /feature-status

Renders a summary of `feature_list.json` for the current project:

- Total entries.
- `passes: true` count and `passes: false` count.
- Highest-priority failing entry whose `depends_on[]` are all satisfied.
- Recent flips (last 5, from git log on `feature_list.json`).
- Stalled entries (failing for >7 days without progress).

## When to use

- After resuming a project; quicker than reading the file manually.
- Before opening `/plan` — confirms the right feature is queued.
- Before a release decision; the count tells you if you're feature-complete.

## Runtime

This command runs `node scripts/feature-status.js` from the project root and surfaces its stdout.

## Output format

```
feature_list.json — <project>
  passing: <n> / <total>  (<pct>%)
  failing: <n>
  next:    <id> — <description>
  stalled: <n> (oldest: <id> — failing since <date>)
  recent flips:
    <date>  <id>  →  pass
    <date>  <id>  →  pass
```
