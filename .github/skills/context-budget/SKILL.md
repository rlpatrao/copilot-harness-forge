---
name: context-budget
description: Analyze and optimize token usage — cost summary, cost per agent, per story, per gate, cache hit rates, and recommendations for context reduction. Use --summary for a quick cost overview.
---

# Context Budget Skill

Analyze token consumption across the build and recommend optimizations to reduce cost and improve efficiency.

## Usage

```
/context-budget                # full analysis + recommendations
/context-budget --summary      # quick cost summary only (replaces former /cost)
```

Run anytime during or after a build.

---

## Prerequisites

- `cost-log.json` exists with token usage entries from the build.

---

## Step 1 — Read Cost Log

Read `cost-log.json`. Parse entries for:
- Token counts (input, output, cache_read, cache_write) per interaction
- Agent type (architect, generator, evaluator, reviewer, etc.)
- Story/task identifier
- Gate stage (test, lint, coverage, architecture, evaluator, reviewer, ui-standards, security)
- Timestamp and duration

---

## Step 2 — Calculate Usage by Agent Type

Aggregate tokens per agent:
- Total input tokens, output tokens, cache tokens
- Average tokens per invocation
- Number of invocations
- Most expensive single invocation

---

## Step 3 — Calculate Usage by Story

Aggregate tokens per story/task:
- Total cost per story
- Breakdown by gate stage
- Number of GAN iterations (generator-evaluator cycles)
- Identify stories with unusually high token consumption

---

## Step 4 — Calculate Usage by Gate

Aggregate tokens per gate stage:
- Total cost per gate across all stories
- Average cost per gate invocation
- Pass/fail rate per gate (failed gates cost extra due to rework)

---

## Step 5 — Check Prompt Caching Opportunities

Analyze cache performance:
- Cache hit rate (cache_read / total_input)
- Identify large uncached prompts that repeat across invocations
- Estimate savings from improved caching

---

## Step 6 — Recommend Context Reduction Strategies

Based on analysis, recommend:
- Reducing file loading scope (e.g., "load only owned files instead of full component map")
- Splitting large stories to reduce per-invocation context
- Improving cache hit rate via prompt structure changes
- Reducing GAN iterations via better generator prompts
- Skipping unnecessary gate stages for trivial changes

---

## Step 7 — Generate Cost Projection

For remaining work:
- Estimate tokens needed based on remaining stories
- Project total build cost
- Compare against budget if configured in manifest

---

## Output Format

Print report to console (not saved to file):

```
=== Context Budget Report ===

## Current Usage
- Total tokens: X (input: X, output: X, cached: X)
- Cache hit rate: X%
- Total cost estimate: $X.XX

## By Agent
| Agent       | Tokens   | Invocations | Avg/Call |
|-------------|----------|-------------|----------|
| generator   | X        | X           | X        |
| evaluator   | X        | X           | X        |
| ...         | ...      | ...         | ...      |

## By Story (top 5 most expensive)
| Story       | Tokens   | GAN Cycles  | Gate Fails |
|-------------|----------|-------------|------------|
| ...         | ...      | ...         | ...        |

## Recommendations
- [specific, actionable recommendations]

## Projection
- Remaining stories: X
- Estimated remaining tokens: X
- Projected total cost: $X.XX
```

---

## Quick Summary Mode (`--summary`)

When invoked with `--summary`, skip Steps 3-7 and print only a compact cost overview:

```
Mode: {mode} (budget: ${low}-${high})
Model routing: {strategy} ({local_model_name if applicable})
Agent spawns: {count}
Estimated total: ${amount} ({pct}% of budget ceiling)
Breakdown: Opus {n} spawns (${amount}), Sonnet {n} spawns (${amount}), Local {n} spawns ($0.00)
Top consumers: {agent1} (${amount}), {agent2} (${amount}), {agent3} (${amount})
```

Also read `execution.model_routing` from `project-manifest.json` and display the routing strategy. When `strategy` is `local-only`, show:
```
Model routing: local-only (Qwen3-Coder-480B-A35B-Instruct via vLLM)
Estimated API cost: $0.00 (all local)
Note: Local inference has compute cost (GPU time) not tracked here.
```

### Estimation Method

| Model | Input $/1M tokens | Output $/1M tokens | Avg input | Avg output |
|-------|-------------------|--------------------|-----------|-----------  |
| Opus | $15 | $75 | 15K tokens | 5K tokens |
| Sonnet | $3 | $15 | 10K tokens | 3K tokens |
| Local | $0 | $0 | N/A | N/A |

**Caveat:** These are rough directional estimates, not actual billing. Token counts are approximated. Actual costs depend on prompt caching, system prompt sharing, and output length variation.

### Budget Ranges by Mode

| Mode | Low | High |
|------|-----|------|
| Full | $100 | $300 |
| Lean | $30 | $80 |
| Solo | $5 | $15 |
| Turbo | $30 | $50 |

---

## Gotchas

- **Report only, no file output.** This skill prints to console for immediate review. Recommendations are for manifest tuning, not automated changes.
- **Cache hit rate depends on prompt structure.** Small changes to system prompts can invalidate the entire cache.
- **GAN iterations are the biggest cost driver.** Focus optimization on reducing evaluator failures, not on trimming individual prompts.
