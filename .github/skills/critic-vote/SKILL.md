---
name: critic-vote
description: Bounded 3-instance majority-vote re-verification at the E2E merge boundary. Spawns 3 independent Critic agents on the current diff, computes per-axis 2-of-3 majority, writes verification/<feature_id>.votes.json. Required by hooks/e2e-gate.js before passes:false→true flip is accepted.
brd_ref: v3.2.2
---

# critic-vote — 3-instance majority vote at merge boundary

Adapted from `cwijayasundara/claude_harness_eng_v5`'s Devin-parity item 1 (commit `b647a917`, 2026-07-09) per BRD v3.2 §3.2.

## When it runs

**ONLY at the merge boundary.** Concretely: after the coding-agent has written a verification artifact under `verification/<feature_id>.{png,json}` and is about to flip the `feature_list.json` entry's `passes` field from `false` to `true`.

NOT at every generator/critic round in `/auto`. Running 3 votes per round would triple cost with no marginal safety benefit — the merge boundary is where variance actually matters.

## Why 3 instances

A single Critic can rubber-stamp (rarely) or reject (rarely) a diff the diff doesn't actually deserve. Three fresh-context spawns turn single-verifier variance into 2-of-3 majority — a bounded, low-cost defense against the failure mode Anthropic's generator-verifier writeup calls out (see the Devin-parity design at `cwijayasundara/claude_harness_eng_v5` `f3b6f65e`).

Fresh context is structural: each spawn uses the SDK `Agent` tool with no shared conversation, no shared reasoning trace. The Generator's diff is the only shared input.

## Axes

Each Critic returns a per-axis verdict. Axes:

1. **correctness** — does the diff implement the entry's `steps[]`?
2. **spec-scope** — does the diff stay inside the entry's declared scope? (out-of-scope changes → `spec-audit` follow-up)
3. **e2e-artifact** — is `verification/<id>.{png,json}` present, sane, and referenced by the diff?

A 4th axis, **security**, is included only when the diff touches auth / secrets / uploads / migrations / network / payments — matching the deterministic trigger set from `hooks/pre-bash-gate.js`.

Per-axis vote is `PASS` or `BLOCK`. Simple 2-of-3 majority on each axis. Non-returning voter (crash, timeout, error) fails safe to `BLOCK` for that axis.

Overall verdict: `APPROVED` if every axis's majority is `PASS`. Else `BLOCKED`.

## Usage

```bash
# Invoked by the coding-agent right before the flip:
node .claude/scripts/critic-vote.js <feature-id>

# Writes verification/<feature-id>.votes.json.
# Exit 0 on APPROVED, exit 2 on BLOCKED (fail-safe convention).
```

## Verification file shape

`verification/<feature-id>.votes.json`:

```json
{
  "feature_id": "v3.1.1-scaffold-import-mode",
  "verdict": "APPROVED",
  "voted_at": "2026-07-10T12:34:56Z",
  "git_sha": "cff9ac3",
  "axes": {
    "correctness":     { "majority": "PASS",  "votes": ["PASS", "PASS", "PASS"] },
    "spec-scope":      { "majority": "PASS",  "votes": ["PASS", "PASS", "BLOCK"] },
    "e2e-artifact":    { "majority": "PASS",  "votes": ["PASS", "PASS", "PASS"] }
  },
  "voter_failures": [],
  "elapsed_ms": 14382
}
```

If any axis's `majority` is `BLOCK`, `verdict` is `BLOCKED` and the flip is rejected by `hooks/e2e-gate.js` (which now consumes this file).

## Enforcement

`hooks/e2e-gate.js` (BRD §3.8) is extended in v3.2.2:

1. Existing check: `verification/<id>.{png,json}` exists and is git-tracked (unchanged).
2. **New check:** `verification/<id>.votes.json` exists, `verdict == "APPROVED"`, and `voted_at` is within the current git session (not stale from a prior commit).

If either check fails, exit 2 rejects the `passes:false→true` edit.

## Cost

Each vote is a full Critic invocation. 3 votes ≈ 3× the current single-Critic cost per feature merge. In practice, this is ~1 vote per feature, not per session — the amortized overhead is small compared to the whole auto-loop cost.

## Gate (before returning success)

- [ ] All 3 spawns completed (or their failures logged in `voter_failures`)
- [ ] Per-axis 2-of-3 majority computed correctly
- [ ] `verification/<feature-id>.votes.json` written with the shape above
- [ ] Overall verdict is `APPROVED` OR `BLOCKED` (never `INDETERMINATE`)
- [ ] Exit 0 on APPROVED, exit 2 on BLOCKED

## Not covered in v3.2.2

- **Vote at intermediate iterations.** Only merge-boundary. If you want to reduce iteration cost, that's a different work item.
- **Human tiebreaker.** No escalation path for 3-way split — fails safe to BLOCK.
- **Cross-feature aware voting.** v3.2.4 (cross-feature regression sensor) handles the "this diff breaks feature X" case. Vote is single-feature scoped.
- **Non-Critic axes.** `security-reviewer` and `evaluator` continue as separate agents; they run OUTSIDE the vote. This vote is Critic-only.
