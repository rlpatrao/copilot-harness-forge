---
name: compiled-rules
description: TRACE — Test-time Rule Acquisition + Compiled Enforcement (BRD v3.3). Two-store rule model — human fast-lane (state/learned-rules.md, advisory) + machine compiled rules (state/compiled-rules.json, with pattern rules that hard-block pre-tool and semantic rules the Critic enforces). Compiled Rules move from 55% to 70% preference compliance vs context-only injection.
when_to_use: When you notice the forge repeatedly rejects the same pattern at Critic/security-review/e2e-gate and want that pattern to become a hard block; when hand-authoring a deterministic rule (e.g. "never commit AKIA[0-9A-Z]{16}"); when a Critic block needs a machine-executable check.
brd_ref: v3.3 (TRACE)
---

# compiled-rules — TRACE compiled-rule enforcement

Adopts TRACE (arXiv 2606.13174) per BRD v3.3. Compiled Rules reach **70.1%** preference compliance vs **55.0%** for the same rule injected as context and **42.5%** for a memory-backend baseline; repeated violations drop from 100% → 2% out-of-distribution.

## The two rule stores

| Store | Location | Origin | Enforcement |
|---|---|---|---|
| Human fast-lane | [`state/learned-rules.md`](../../state/learned-rules.md) | Human-edited | Advisory — injected verbatim at SessionStart, applied as hard filters by every agent that reads context |
| Compiled rules | [`state/compiled-rules.json`](../../state/compiled-rules.json) | Mined by [`hooks/correction-detector.js`](../../hooks/correction-detector.js) from `state/rejections.jsonl`, or hand-authored | **Deterministic** — pattern rules are hard-blocked by [`hooks/rule-gate.js`](../../hooks/rule-gate.js) PreToolUse. Semantic rules are Critic-enforced. |

The split is by **how** a rule is enforced, not by **who** wrote it. A rule authored by hand and a rule mined from corrections live in the same file, both go through the same `candidate → tentative → confirmed` lifecycle.

## Pattern vs semantic

Every compiled rule has a `check` field:

```json
"check": { "kind": "pattern", "test": "regex", "value": "AKIA[0-9A-Z]{16}", "flags": "" }
```

or

```json
"check": { "kind": "semantic", "value": "Diff introduces a new exported symbol or widens an existing one without updating docstrings." }
```

- **Pattern rules** run inline in `hooks/rule-gate.js`. Fast, cheap, deterministic. Test kinds: `regex`, `substring`, `forbid-substring`.
- **Semantic rules** cannot be expressed as a pattern; they run in the Critic subagent (see [`agents/critic.md`](../../agents/critic.md) "What you receive" step). Slower, but keeps the PreToolUse hook synchronous.

**Deterministic rules block early; semantic rules block at Critic.** Both are strictly better than context-only injection (which is what advisory `learned-rules.md` already gives us).

## Lifecycle

```
candidate    — mined by correction-detector.js; lives in state/rule-candidates/
                Requires >= 2 recurrences in state/rejections.jsonl to emerge.

tentative    — /rules promote-candidates AFTER Critic validation per candidate.
                Enforced as WARN (non-blocking) by rule-gate.js. Recorded in
                compiled-rules.json.

confirmed    — /rules promote-tentative when sessions_seen >= 2 AND
                false_positive_overrides == 0. Enforced as BLOCK.

retired      — superseded; kept in compiled-rules.json with status:"retired"
                so the store is monotonic. Never deleted.
```

Escalation mirrors the instinct lifecycle (BRD §4.4) deliberately: **nothing hardens into hard enforcement without Critic validation + recurrence.**

## How to hand-author a compiled rule

1. Open `state/compiled-rules.json`.
2. Append a rule object to the `rules` array. Minimum shape:

```json
{
  "rule_id": "r-<short-slug>",
  "statement": "Human-readable one-sentence rule.",
  "why": "Why this exists (link to incident or spec section).",
  "applies_when": { "tools": ["Edit","Write"], "path_glob": "src/**" },
  "check": { "kind": "pattern", "test": "regex", "value": "<pattern>", "flags": "" },
  "status": "confirmed",
  "severity": "block",
  "origin": { "source": "hand-authored", "sessions_seen": 0 },
  "created_at": "2026-07-10T00:00:00Z",
  "confirmed_at": "2026-07-10T00:00:00Z",
  "false_positive_overrides": 0
}
```

3. Commit the file. `hooks/rule-gate.js` picks it up on the next tool call — no restart needed.

For a hand-authored rule you can skip the candidate → tentative pipeline; set `status:"confirmed"` and `severity:"block"` directly. That's the escape hatch when you know the rule is right.

## False-positive escape hatch

If a `confirmed` block rule is a false positive on a specific call:

```bash
RULE_GATE_OVERRIDE=<rule_id> <your original command>
```

This downgrades the block to an audit-only pass AND increments `false_positive_overrides` on the rule. A rule with `false_positive_overrides > 0` cannot auto-promote from tentative → confirmed until a Critic re-validates it.

Overriding a confirmed block does NOT demote it — that requires manual edit of `compiled-rules.json` (change `status` to `tentative` or `retired`) after Critic review.

## When to use compiled rules vs learned-rules

| Situation | Store |
|---|---|
| Human-edited quick preference ("always use pytest, never nose") | `state/learned-rules.md` |
| Pattern the Critic keeps catching ("hardcoded secrets") | Compiled rule, pattern check, block |
| Correctness rule that requires judgment ("widen API only with docstring") | Compiled rule, semantic check, Critic-enforced |
| Cross-project pattern | Not here — `learnings/` (v2.0) or `instincts/` (v3.0 §4.4) |
| Failure-derived rule mined from Critic BLOCKs | Compiled rule via correction-detector → /rules |

## Distinct from other rule-adjacent surfaces

- **`instincts/pending/tentative/confirmed`** (BRD §4.4) — clustered into advisory **skills** via `/evolve`. LLM-consumed suggestions. Distinct enforcement path.
- **`learnings/`** (v2.0 cross-project) — human-curated stack decisions + failure patterns. Reference-only.
- **`state/learned-rules.md`** (BRD v3.2.1) — human-edited, per-project, injected verbatim. Same enforcement latitude as advisory Critic rules.
- **`state/compiled-rules.json`** (BRD v3.3) — machine-executable check spec. Hard block possible.

## Not covered in v3.3 (deferred)

- Human-chat correction adapter — mining rules from the user's conversational corrections. The detector is adapter-shaped; adding a new source is additive.
- Running semantic rules inline in PreToolUse — would make the hook an LLM call. Latency and cost prohibitive; semantic rules stay Critic-enforced.
- AST-grep / structural checks — v3.3 patterns are regex / glob / substring only.
- Cross-project compiled-rule sharing — via the existing `/instinct-export` pattern, later.

## Gate

Before returning success:
- [ ] `state/compiled-rules.json` parses as valid JSON
- [ ] Every rule has `rule_id`, `statement`, `check`, `status`, `severity`, `origin.source`
- [ ] For `check.kind:"pattern"`, `test` is one of `regex` / `substring` / `forbid-substring` and `value` is non-empty
- [ ] For `check.kind:"semantic"`, `value` is a natural-language test
- [ ] `status` ∈ {candidate, tentative, confirmed, retired}
- [ ] For status=`confirmed`, `severity` is `block` (pattern) or `critic` (semantic)
- [ ] For status=`tentative`, `severity` is `warn` (pattern) or `critic` (semantic)
