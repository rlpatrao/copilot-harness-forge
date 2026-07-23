---
name: cross-provider-handoff
description: Switch model mid-session preserving thinking blocks. Used by /model command and by BRD §6.2 failover when the primary provider rate-limits or fails.
when_to_use:
  - user invoked /model to switch providers
  - primary provider returned 429 / 503 / network error
  - workflow declared failover[] in config/workflows.yaml and the primary is unavailable
brd_ref: §6.2
---

# Cross-provider handoff

Pi (`@mariozechner/pi-ai`) supports mid-session model switching across Anthropic, OpenAI, Google, Bedrock, Vertex, Azure, Ollama, vLLM, LM Studio. Thinking blocks are auto-converted between provider formats. Cost-per-token is tracked per provider against Pi's pricing table.

## Conversion semantics

| From → To | Thinking block handling |
|---|---|
| Anthropic → OpenAI | `thinking` content blocks → `reasoning` content (where supported) or omitted |
| OpenAI → Anthropic | `reasoning_content` → `thinking` blocks |
| Anthropic → Google | `thinking` → comment headers in the next user message |
| Anthropic → Bedrock | passes through (same Claude model family) |

The conversion is **lossy in one direction**: thinking content tagged for redaction by Anthropic policy cannot be passed verbatim to a third-party provider. The handoff logic drops these blocks; the agent may briefly lose reasoning continuity, but the conversation continues.

## When NOT to use

- The primary is healthy. Switching providers mid-session is not free — there's a cold-start cost in latency and a cache miss.
- The workflow is `compactor` and Haiku is up. Don't fail over compaction; it's cheap to retry on the primary.

## Hard rules

- **Failover is at most one hop per turn.** If `primary → failover[0]` fails, surface the error to the orchestrator rather than continuing to `failover[1]` in the same turn.
- **Cost is logged at the destination provider's rate.** The cost-tracker hook reads the active provider from the session metadata, not from the workflow's config.
- **Don't fail over reads.** Anthropic's prompt cache stores reads; failing over to GPT-5 invalidates the cache and is more expensive than retrying.

## Source

Wraps `earendil-works/pi/packages/pi-ai/src/providers/` (MIT). See BRD §6.2 and §10.4 §6.2.
