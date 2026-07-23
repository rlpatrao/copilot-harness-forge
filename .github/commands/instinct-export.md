---
description: Export confirmed instincts for sharing across projects.
argument-hint: [<output-file>]
# generated-from: commands/instinct-export.md
---

# /instinct-export

Exports `instincts/confirmed/` to a portable file (default: `instincts/export-<date>.json`) for cross-project sharing per BRD §4.4.

## What gets exported

- Only `confirmed/` instincts (pending and tentative are project-local for a reason — they're noisier).
- Tool-sequence + success_rate + score. **No project-specific paths, file contents, or transcripts.** The export is structural.

## What does NOT get exported

- Anything from `instincts/pending/` or `instincts/tentative/`.
- Anything from the session transcripts.
- Project identifiers (the export is anonymous by default).

## Import path

The receiving project runs `/instinct-import <file>`, which writes to its own `instincts/pending/` (not `confirmed/`) — the new project's `/evolve` cycle decides if the imported pattern holds in this codebase.
