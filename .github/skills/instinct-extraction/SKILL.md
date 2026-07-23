---
name: instinct-extraction
description: Mines completed sessions for repeating {tool sequence → outcome} tuples. Scores by frequency × success_rate × novelty. High-scoring tuples become "instincts" — candidate skill seeds — in instincts/pending/.
when_to_use:
  - run automatically by hooks/instinct-extractor.js on every Stop event
  - run manually via /instinct-status to inspect what was mined recently
  - run as part of /evolve to cluster confirmed instincts into a new skill
brd_ref: §4.4
---

# Continuous learning: instinct extraction

The harness has many turns. Most are noise; some encode skill — a recurring sequence of tool calls that, in this codebase, in this project, reliably produces a desired outcome.

The instinct-extractor mines these patterns at session end:

```
score = frequency × 0.4 + success_rate × 0.4 + novelty × 0.2
```

with initial weights to be tuned from telemetry per BRD §9 open question 3.

## Lifecycle

```
pending     -- auto-extracted; lives 30 days max unless promoted
tentative   -- /evolve promoted after Critic validation; tracked over N sessions
confirmed   -- held up over N sessions; ready to cluster into a skill
skill       -- clustered instincts merged into skills/ by /evolve
```

## Hard rules

- **Pending instincts are local to a project's `instincts/pending/`.** Cross-project sharing is via `/instinct-export` + `/instinct-import`, which require explicit user action.
- **Promotion always goes through the Critic.** No auto-promotion past `pending`. The risk of a bad instinct hardening into a skill is too high.
- **Auto-prune is mechanical.** Pending instincts older than 30 days are deleted by a periodic CI job (not by this hook directly).
- **The extractor never writes to `skills/` or `learnings/`.** Those are downstream of `/evolve`.

## What makes a good instinct candidate

- Recurs in >= 2 turns of the same session.
- Has high success_rate (the sequence consistently led to a non-error outcome).
- Is novel (not already in `instincts/.seen-hashes.txt`).
- Is short enough to be reusable (length 2-4 tool calls). Longer sequences are usually project-specific scripts, not instincts.

## Source

Pattern from `affaan-m/everything-claude-code/skills/continuous-learning-v2/` (MIT). See `hooks/instinct-extractor.js` for the implementation, `commands/evolve.md` for the promotion path, and BRD §10.3 §4.4.
