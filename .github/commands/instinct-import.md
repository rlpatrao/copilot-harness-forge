---
description: Import instincts exported from another project.
argument-hint: <input-file>
# generated-from: commands/instinct-import.md
---

# /instinct-import

Imports a file produced by `/instinct-export`. The imported instincts land in **this project's `instincts/pending/`** — not `confirmed/`. They must hold up in this codebase's `/evolve` cycle before promoting further.

## Rationale

An instinct that fires reliably in project A may not fire at all in project B. We deliberately downgrade imported instincts to `pending` so they re-prove themselves on the new codebase before being trusted.

## Hard rules

- **Imports never auto-promote to `confirmed`.** Always start at `pending`.
- **Duplicate hashes are skipped.** If the imported instinct's hash matches one already in this project's `instincts/.seen-hashes.txt`, it is dropped.
- **The import is read-only on the source file.** The source file is not modified.
