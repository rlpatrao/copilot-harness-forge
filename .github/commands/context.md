---
name: context
description: Bounded file:line citations for a natural-language question before broad Reads. Backed by hash-cached raw output under state/context-cache/. Use this BEFORE reading many files; often replaces the read entirely.
argument-hint: <question>
# generated-from: commands/context.md
---

# /context — Token Governor bounded citations (BRD v3.1 §4, v3.1.6)

Instead of reading many files to answer a question, invoke `/context "<question>"` first. The command:

1. Runs a grep/glob-based scout across the repo scoped to the question
2. Extracts up to N `file:line` citations with 3-line context per hit
3. Caches raw output by hash under `state/context-cache/<hash>/`
4. Returns a compact digest with failures-first ordering

**When to use:**
- Before reading 3+ files to answer "how does X work" / "where is Y defined" / "what handles Z"
- Before large Bash searches (`find`, wide `grep`, `rg` on a big tree)
- When you're about to Read something you've probably already looked at (the cache will short-circuit)

**When NOT to use:**
- You already know the exact file path — just Read it
- You need actually-loaded content for editing, not citations

Adapted from [`cwijayasundara/claude_harness_eng_v5/docs/token-governor.md`](https://github.com/cwijayasundara/claude_harness_eng_v5/blob/main/docs/token-governor.md) per BRD v3.1 §4 (v3.1.6).

## Usage

```
/context "where do we validate feature_list.json edits?"
/context "how does the ralph loop decide when to block?"
/context "what does the compactor agent read as input?"
```

## Steps

When the user invokes this command:

1. Read `.claude/scripts/context-pack.js` and follow its interface.
2. Invoke it via Bash:

   ```bash
   node .claude/scripts/context-pack.js "<question>"
   ```

3. The script:
   - Hashes the question + repo HEAD SHA
   - Checks `state/context-cache/<hash>/digest.md` — if present and <30 min old, print it and exit
   - Otherwise runs `rg` (or `grep -r`) with question-derived patterns
   - Ranks hits by relevance (definition sites > usages > comments)
   - Writes `state/context-cache/<hash>/{raw.txt,digest.md,manifest.json}`
   - Prints the digest

4. The digest format:
   ```
   ### Answer sketch (2-4 sentences based on top hits)

   ### Citations (top 15)
   1. path/to/file.js:42 — <one-line snippet>
   2. path/to/file.js:118 — <one-line snippet>
   ...

   ### If you need to read one whole file, start with:
   - path/to/file.js  (7 citations, definition site at line 42)
   ```

5. If the answer sketch is insufficient, THEN read the top-cited file.

## Cache behavior

- Keyed by `sha256(question + git rev-parse HEAD)`, truncated to 12 chars
- TTL: 30 minutes (soft — override with `--fresh`)
- Automatic eviction when `state/context-cache/` exceeds 50MB (LRU)
- `manifest.json` records: question, HEAD SHA, timestamp, hits count, files touched

## Gate

- [ ] Question given as $ARGUMENTS
- [ ] context-pack.js exit code checked
- [ ] Digest printed to the model
- [ ] If digest included citations, do NOT immediately Read the same files without new intent

## Not covered in v3.1.6

- Semantic search (embeddings) — deferred to v3.1.11 (memory-OS archival tier)
- Cross-file dependency graph awareness — depends on v3.1.9 code-graph
- Automatic Read replacement — the model must decide; the hook `hooks/token-advisor.js` only advises
