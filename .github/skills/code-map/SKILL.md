---
name: code-map
description: Living code index — code-graph.json (files, imports, top-level definitions) + symbol-map.md (human-readable). Kept fresh by hooks/graph-refresh.js (Stop) draining a dirty-file ledger from hooks/verify-on-save.js. Grounds seam-finding, modularity review, and drift detection with file:line citations.
brd_ref: v3.1 §4 (v3.1.9)
---

# code-map — Living code index

Adapted from [`cwijayasundara/claude_harness_eng_v5/.claude/skills/code-map/SKILL.md`](https://github.com/cwijayasundara/claude_harness_eng_v5/blob/main/.claude/skills/code-map/SKILL.md) per BRD v3.1 §4 (v3.1.9).

## Artifacts produced

| File | Format | Purpose |
|---|---|---|
| `state/code-graph.json` | JSON | Machine-readable. One record per file: `path`, `language`, `defines[]`, `imports[]`, `exports[]`, `size_bytes`, `line_count`, `sha`, `indexed_at`. |
| `state/symbol-map.md` | Markdown | Human-readable. Grouped by directory. Cross-links `path#L<line>`. |
| `state/dirty-files.jsonl` | JSONL | Append-only ledger of files changed since last graph refresh. Drained by [`hooks/graph-refresh.js`](../../hooks/graph-refresh.js) on Stop. |

## When it fires

- **Full build** (this skill invoked directly): scans the whole tree, writes graph + map.
- **Incremental** ([`hooks/verify-on-save.js`](../../hooks/verify-on-save.js) → [`hooks/graph-refresh.js`](../../hooks/graph-refresh.js)): re-indexes only the files in `state/dirty-files.jsonl`.

## Languages supported (v3.1.9)

Minimum viable — regex/AST-lite parsers, not real compilers:

| Language | Extensions | Detects |
|---|---|---|
| JavaScript/TypeScript | `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs` | `import`, `require`, `export`, `function`, `class`, `const/let/var` (top-level), arrow functions assigned to names |
| Python | `.py` | `import`, `from ... import`, `def`, `class`, top-level assignments |
| Markdown | `.md` | Top-level headings (`# …`) treated as "exports" for cross-referencing |
| JSON | `.json` | File is indexed by presence; no defines extracted |

Anything else is indexed with `language: "unknown"` and only size/line-count.

Deferred: real AST via tree-sitter (v3.2), Go, Rust, Java, C++.

## Invocation

### Full rebuild

```bash
node .claude/scripts/build-code-graph.js
```

Scans project root (respects `.gitignore`), writes `state/code-graph.json` + `state/symbol-map.md`. Slow on cold start (seconds for medium repo).

### Incremental (agent doesn't invoke directly)

Handled by [`hooks/graph-refresh.js`](../../hooks/graph-refresh.js) on Stop event. Reads `state/dirty-files.jsonl`, re-runs `build-code-graph.js --files <list>`, truncates the ledger.

### Query

For "where is X defined" or "who imports Y", use [`/context`](../../commands/context.md) — it consumes `state/code-graph.json` when present to enrich its citations. Or read `state/symbol-map.md` directly.

## Guarantees + non-guarantees

**Guaranteed:**
- Every top-level `function`/`class`/`def` in a supported language is indexed with its line number.
- Imports are reference-only strings (not resolved to actual files). Downstream consumers may resolve.
- Files >2MB are skipped (recorded as `oversize: true` in the graph).

**NOT guaranteed:**
- Cross-file symbol resolution — this is a static index, not a semantic type-checker.
- Correctness on syntactically-broken files — parsers fall back to "unknown".
- Live sync with in-flight edits — the graph reflects the last saved state at the last Stop event.

## What consumes it

| Consumer | What it uses |
|---|---|
| [`/context`](../../commands/context.md) (v3.1.6) | Enriches citations with "N callers" hints when graph is present |
| `hooks/harness-coverage.js` (v3.2) | Would compute per-axis coverage against `code-graph.json`; not yet built |
| `codebase-explorer` agent | Reads `symbol-map.md` before proposing explorations |
| `modularity-reviewer` (v3.2) | Would flag hubs, cycles, misplaced files |
| `spec-auditor` | Cross-references BRD requirements with defined symbols |

## Gate (before returning success)

- [ ] `state/code-graph.json` is well-formed JSON, wraps every scanned file in a record
- [ ] `state/symbol-map.md` was regenerated (its mtime is newer than the graph's mtime)
- [ ] `state/dirty-files.jsonl` was truncated (if incremental mode)
- [ ] Report the number of files indexed, imports found, definitions found

## Not covered in v3.1.9

- Semantic search (needs vector store, deferred to v3.1.11 memory-OS archival tier)
- Real AST via tree-sitter (deferred to v3.2)
- Import resolution (currently returns raw import strings)
- Language servers for cross-file symbol lookup (deferred; codebase-explorer's LSP grant is for direct queries, not for graph building)
