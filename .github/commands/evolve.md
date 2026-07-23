---
description: Cluster confirmed instincts into a new skill. Critic-validated.
# generated-from: commands/evolve.md
---

# /evolve

Promotes instincts through the BRD §4.4 lifecycle and clusters confirmed instincts into a new skill in `skills/`.

## Workflow

1. List `instincts/pending/` and `instincts/tentative/`. For each, run the Critic subagent to validate (does the instinct correspond to a real pattern, not coincidence?).
2. Promote validated pending → tentative.
3. For tentative instincts that have been seen in N sessions (default N=3), promote to confirmed.
4. For confirmed instincts that cluster (>= 3 related instincts), draft a new skill:
   - `skills/<auto-named>/SKILL.md`
   - Description, when-to-use, hard rules — synthesized from the instinct sequences.
5. Stage the skill draft; the user reviews before commit.

## Hard rules

- **No auto-merge to `skills/`.** Every new skill requires explicit user approval (the orchestrator stages the draft; the user runs `git add` + `git commit` after review).
- **Pending → tentative only via Critic.** Skip Critic validation only with `--force` (not recommended).
- **Tentative → confirmed only via session-count.** Time-based promotion alone is not enough; the instinct must have recurred.

## Runtime

The orchestrator runs the lifecycle steps via `scripts/instinct-evolve.js`:

```
node scripts/instinct-evolve.js status              # current counts
node scripts/instinct-evolve.js promote-pending     # score>=0.6 → tentative
node scripts/instinct-evolve.js promote-tentative   # sessions_seen>=3 → confirmed
node scripts/instinct-evolve.js cluster             # propose skill clusters
node scripts/instinct-evolve.js prune-pending       # delete pending older than 30 days
```

Between `promote-pending` and `promote-tentative`, the Critic subagent validates each candidate (BRD §4.4 hard rule: no auto-promotion past `pending` without Critic).

## Anti-patterns

- **Running /evolve too often.** It's a curation pass, not a hot path. Once per week of active development is plenty.
- **Clustering by name similarity instead of behavior.** Two instincts that look similar in their tool sequences but have different success conditions are not the same skill.
