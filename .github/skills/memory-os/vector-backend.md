# Memory OS — Vector backend (BRD v3.1 §4, v3.1.12)

**Status:** Design specification only. No vendor SDK code shipped in v3.1.12. Decision deferred until v3.1.11 (filesystem tier) has been in use for ≥2 dogfood projects.

## Why not vendor now

1. **We don't yet know the query shape.** The filesystem tier lets us observe: what queries agents actually issue, how large archival grows, whether BM25 is enough. Premature vendor lock without that data is expensive to reverse.
2. **The vendor landscape is unsettled.** Letta, Mem0, Zep, and LangMem all launched Series A rounds within the last 12 months (per [agentmarketcap.ai 2026 vendor landscape](https://agentmarketcap.ai/blog/2026/04/10/agent-memory-vendor-landscape-2026-letta-zep-mem0-langmem)). Winners aren't clear yet.
3. **MCP-first is our stance.** BRD §3.4 mandates per-workflow LLM routing and vendor-agnostic tool discovery. A vector backend should be an MCP server we point at, not code baked in.

## Contract

When v3.1.12 lands, [`scripts/archival-search.js`](../../scripts/archival-search.js) will grow a `--backend` flag:

```bash
node scripts/archival-search.js --backend fs      "<query>"    # current v3.1.11
node scripts/archival-search.js --backend mem0    "<query>"    # via Mem0 MCP
node scripts/archival-search.js --backend letta   "<query>"    # via Letta MCP
node scripts/archival-search.js --backend zep     "<query>"    # via Zep MCP
```

Default backend: `fs` (unchanged). Vendor backends require MCP config in `.mcp.json`.

## Shared response schema

All backends return the same shape (already what fs returns):

```json
{
  "hits": [
    {
      "id": "state/memory/archival/2026-06-11-brd-v31-origin.md",
      "score": 4.72,
      "title": "BRD v3.1 origin story",
      "snippet_line_num": 6,
      "snippet": "The forge uses BRD v3.0 as the standing spec; v3.1 is a retrofit…",
      "tags": ["brd", "v3.1", "forge"],
      "backend": "mem0",
      "vendor_id": "mem0-note-abc123"
    }
  ],
  "backend": "mem0",
  "elapsed_ms": 42,
  "query": "how did v3.1 start"
}
```

For vendor backends, `id` is the local canonical path when a corresponding fs file exists; else `vendor_id` is the primary key.

## Sync semantics

When a vendor backend is active, `archival-write.js` writes to BOTH:
1. `state/memory/archival/<slug>.md` — canonical, source-of-truth, in git
2. The vendor backend — via MCP `memory.add` or equivalent

Read path: vendor first (if backend != fs), fall back to fs on error.

Delete path: only via a new `scripts/archival-delete.js` (not in v3.1.11). Deletes both.

## MCP servers (as of 2026-06)

| Vendor | MCP server package | Notes |
|---|---|---|
| Mem0 | `@mem0/mcp-server` (npm) | Community-favored, $24M Series A, 48k stars. Simplest MCP shape. |
| Letta | `letta-mcp` (pypi) or Docker `letta/letta-mcp` | Full memory runtime; includes core/recall/archival semantics itself, so overlaps our tier structure. When wiring, disable Letta's core layer and use ours. |
| Zep | `zep-mcp-server` (npm) | Temporal knowledge graph (Graphiti). Best when time-ordering matters. |
| LangMem | LangChain-native, no MCP | Skip until MCP server ships. |

## Migration path (when we adopt a backend)

1. Choose backend based on dogfood observation (v3.1.13 output).
2. Register MCP server in `.mcp.json` (per-project) or `~/.claude/settings.json` (per-user).
3. Wire `--backend <vendor>` into `archival-search.js` — one adapter file per vendor, following the shared response schema.
4. Modify `archival-write.js` to fan out to both fs and vendor.
5. Add a rehydration script for existing fs archives: `scripts/archival-sync-to-vendor.js` walks all `state/memory/archival/*.md` and pushes to vendor.
6. Document the tradeoff (cost, latency, vendor lock) in [`SKILL.md`](SKILL.md).

## Open decisions (blocking implementation)

1. **Do we want core/recall to have vendor backends too, or only archival?** Recommend: archival only. Core is per-turn and needs to be dead-fast (grep-in-memory beats network RTT). Recall is compactor output — small enough that fs grep suffices.
2. **How do we handle deletes / edits under vendor?** Recommend: source-of-truth stays fs; deletes/edits sync via cron on `state/memory/archival/*.md` mtime.
3. **Do we accept vendor telemetry?** Depends on the project's threat model. Default to opt-in per the same pattern as `findings-collector`.

## Not covered here

- Concrete backend adapter code — that's v3.1.12 or later.
- Cross-vendor migration — one vendor at a time.
- Vector search on core/recall — see open decision 1.
- Cross-project sharing via a shared vendor account — that would collapse the "learnings vs memory-OS" boundary; deferred.
