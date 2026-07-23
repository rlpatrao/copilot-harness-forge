---
description: Manually trigger spec-gap backpropagation (BRD §4.7) on the current failure.
argument-hint: [<phase-number-that-failed>]
# generated-from: commands/spec-audit.md
---

# /spec-audit

Spawns the Spec-Auditor subagent (`agents/spec-auditor.md`) on the current failure. Without an argument, the auditor reads `state/eval-scores.json` to determine the most recent failing phase.

## Workflow

1. Spec-Auditor walks back from phase N to find the earliest upstream spec gap.
2. Returns a proposed amendment as a unified diff against `brd/v3.0.md` or the relevant `feature_list.json` entry.
3. The Critic subagent validates the amendment.
4. On `pass`, the orchestrator applies the diff. All phases from the amended one through N are re-run.

## When to use

- Same feature has failed >= 2 retries on the same phase.
- Eval score regressed on a dimension that's not directly tied to the most recent code change.
- You suspect the spec, not the implementation, is the problem.

## When NOT to use

- A single failure. Re-run first; flakes are common.
- A bug in production code. Fix the code; don't amend the spec.
- An environment-only failure (missing dep, wrong Node version). Fix `init.sh` instead.

See `skills/spec-backprop/SKILL.md` for the walk-back algorithm.

## Runtime

1. `node scripts/spec-backprop.js packet <N> [<feature_id>]` emits a JSON packet on stdout: failing phase, feature entry, walked phases with artifact samples.
2. The orchestrator passes the packet to the Spec-Auditor subagent (`agents/spec-auditor.md`).
3. The Critic validates the returned amendment before apply.
