---
name: memory-os
description: Three-tier memory (core / recall / archival) backed by the filesystem. Adopts the MemGPT/Letta pattern using ripgrep + structured markdown — no vector DB in v3.1.11 (that's v3.1.12). Use for cross-session facts, prior-session recall, and self-managed archival notes.
brd_ref: v3.1 §4 (v3.1.11)
---

# memory-os — Three-tier filesystem memory

Adopts the MemGPT/Letta "memory OS" pattern (core / recall / archival) per BRD v3.1 §4 (v3.1.11). Backed by structured Markdown + ripgrep — no vector DB yet. Vector backend interface at [`vector-backend.md`](vector-backend.md) (v3.1.12).

## The three tiers

| Tier | Purpose | Behavior | Storage |
|---|---|---|---|
| **Core** | Always-in-context — like RAM. Agent-writable working blocks. | Read + Write per turn. Merged into system reminder by `hooks/session-start.js`. | `state/memory/core-blocks/*.md` |
| **Recall** | Searchable prior-session summaries. | Read (on demand). Written by compactor. | `state/memory/sessions/*.jsonl` |
| **Archival** | Long-term notes the agent writes to itself. Searchable. | Read + Write. Grepped via ripgrep + BM25-ish ranking. | `state/memory/archival/*.md` |

## Distinct from what already exists

- **`learnings/`** (v2, cross-project) = human-curated stack decisions, failure patterns. Different scope: **cross-project**. Memory-OS is **within-project**.
- **`instincts/`** (v3.0, 3-tier promotion) = *derived* rules extracted from failures. Memory-OS is **raw** — the agent's own notes, not distilled patterns.
- **`harness-progress.txt`** = append-only cross-session bridge. Memory-OS **augments** this with block-structured RAM + searchable archives.

## Tools (invoked via Bash)

### Core memory

```bash
# List all core blocks
node .claude/scripts/core-memory-read.js --list

# Read one block
node .claude/scripts/core-memory-read.js <block-name>

# Write / replace a block
node .claude/scripts/core-memory-write.js <block-name> < input.md

# Append to a block (creates if missing)
node .claude/scripts/core-memory-write.js --append <block-name> < input.md
```

Block names: `[a-z][a-z0-9-]*`. Common blocks: `current-goal`, `open-questions`, `known-users`, `decisions-this-week`, `never-forget-this`.

Core-memory content is loaded into every SessionStart system reminder (via [`hooks/session-start.js`](../../hooks/session-start.js)) up to a size cap — anything past 4KB per block is truncated with a `[…]` marker.

### Recall memory

```bash
# Search prior-session summaries for a query
node .claude/scripts/recall-search.js "<query>" [--limit 5]

# List recent session summaries
node .claude/scripts/recall-search.js --list [--limit 10]
```

`recall-search.js` greps `state/memory/sessions/*.jsonl` (post-compaction summaries written by `agents/compactor.md` — v3.0 §4.3). Each JSONL line is a summarized turn or session-end note. Ranking is TF-IDF-ish over term overlap.

### Archival memory

```bash
# Write a new archival note
node .claude/scripts/archival-write.js <note-title> < input.md

# Search archival notes
node .claude/scripts/archival-search.js "<query>" [--limit 5]

# List all archival notes
node .claude/scripts/archival-search.js --list
```

Archival notes are written by the agent (proactively — "I'll remember this for later") or by hooks. They persist across sessions and land under `state/memory/archival/<slug>.md`.

## When to use each

| Situation | Use |
|---|---|
| Fact you'll need next turn | Core memory (`current-goal` block) |
| "What did we decide 3 sessions ago?" | Recall memory (search prior sessions) |
| "Remind me why we chose X" (weeks-old) | Archival memory (write it once, search later) |
| Cross-project pattern | `learnings/` (not memory-OS) |
| Failure-derived rule | `instincts/pending/` (not memory-OS) |

## SessionStart integration

`hooks/session-start.js` (extended for v3.1.11) reads `state/memory/core-blocks/*.md` and appends a "Core memory" section to the SessionStart system reminder — so the agent starts every session with its working blocks already in context.

## Gate

- [ ] All three tier directories exist under `state/memory/`
- [ ] Any core block referenced by another block exists
- [ ] Archival slug follows `YYYY-MM-DD-<kebab-title>` convention (script enforces this)
- [ ] recall/archival search never returns raw content — always digest with `path#Ln` citations

## Not covered in v3.1.11

- **Vector search** — deferred to v3.1.12 (`archival_search` backend swap to Mem0/Letta MCP)
- **Automatic promotion of archival → instinct** — deferred
- **Cross-project memory** — memory-OS is per-project; `learnings/` covers cross-project
- **Session-history exported as recall** — this depends on the compactor writing `state/memory/sessions/*.jsonl`, which is a v3.0 flow not yet wired to memory-OS. v3.1.11 provides the SEARCH interface; the WRITE path from compactor is a separate task (added to feature_list.json)

## Ownership

- Core memory: **agent + human**. Both can read/write.
- Recall memory: **compactor writes, agent reads**.
- Archival memory: **agent writes for itself, agent reads**.

## References

- Letta (formerly MemGPT) walkthrough: https://sureprompts.com/blog/letta-memgpt-walkthrough
- Mem0 architecture: https://vectorize.io/articles/mem0-vs-letta
- 2026 vendor landscape: https://agentmarketcap.ai/blog/2026/04/10/agent-memory-vendor-landscape-2026-letta-zep-mem0-langmem
