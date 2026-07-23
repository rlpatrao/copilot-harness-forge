---
name: extended-react
description: Six-phase ReAct loop (pre-check, thinking, self-critique, action, tool, post). Activates per-workflow via the thinking_level knob in config/workflows.yaml. Replaces standard ReAct for workflows where independent verification of the reasoning improves outcomes.
when_to_use:
  - workflow has thinking_level >= med in config/workflows.yaml
  - workflow handles a feature in feature_list.json with `category: agent | infrastructure | hook`
  - prior iterations on this feature failed; opt up the thinking_level for the retry
brd_ref: §3.6
---

# Extended ReAct loop

Standard ReAct: reason → act → observe. Extended ReAct (BRD §3.6) inserts two phases:

```
1. pre-check + compaction       drain message queue, compact if >70% budget
2. thinking (optional)          chain-of-thought trace at configured depth
3. self-critique (optional)     independent pass on the thinking output, Opus-grade
4. action                       LLM call with full tool schema
5. tool execution               registry dispatch through five safety layers
6. post-processing              decide iterate vs return
```

## When the phases activate

| `thinking_level` | Phase 2 thinking | Phase 3 self-critique |
|---|---|---|
| `off` | skipped | skipped |
| `min` | shallow trace | skipped |
| `low` | shallow trace | skipped |
| `med` | full CoT | skipped |
| `high` | full CoT | full Opus-grade critique |

Configured per-workflow in `config/workflows.yaml`. The default is `low`.

## Why this matters

- Phase 2 (thinking) externalizes the reasoning so it's auditable in telemetry.
- Phase 3 (self-critique) catches a category of error where the action pass commits early without consulting the BRD or the existing code — Opus-grade critique on the thinking output identifies the gap before tool calls fire.
- Phase 1 (pre-check) drains any queued message from the user (Pi pattern, BRD §11 alignment) and compacts if budget is tight — preventing context exhaustion mid-action.

## Anti-patterns

- **Setting `thinking_level: high` on every workflow.** Self-critique is expensive (Opus). Reserve for spec-auditor, planner, critic — workflows where independence is the load-bearing primitive.
- **Skipping phase 1 to "save tokens".** A 70%+ context window with stale tool outputs hurts more than it helps.
- **Treating phase 3 verdict as final on the *feature*.** Self-critique is for the *reasoning*. Feature acceptance is the Critic's job (BRD §5.1) and the E2E gate's job (BRD §3.8).

## Source

Read-and-reimplement of the OPENDEV §2.2.6 pattern (Python reference at `opendev-to/opendev-py/opendev/runtime/react_loop.py`, MIT). Our Durable Functions topology required a different control flow. See BRD §10.2 §3.6.
