---
name: rules
description: TRACE compiled-rule curation (BRD v3.3). Inspect candidates, record Critic verdicts, promote through lifecycle (candidate → tentative(warn) → confirmed(block)), prune stale entries. Mirror of /evolve for instincts.
argument-hint: [status | promote-candidates | promote-tentative | compile | prune-candidates | set-critic-verdict <id> <verdict>]
# generated-from: commands/rules.md
---

# /rules — Compiled-rule curation

When the user runs this command, invoke `scripts/rule-compile.js` with the arguments they provided.

```bash
node .claude/scripts/rule-compile.js $ARGUMENTS
```

If `$ARGUMENTS` is empty, default to `status`.

## Subcommands

- `status` — counts by lifecycle stage; lists recent candidates with their Critic verdicts.
- `promote-candidates` — moves candidates with `critic_verdict:"pass"` into `compiled-rules.json` as `tentative` rules (severity `warn`). Add `--force` to bypass the Critic gate (discouraged).
- `promote-tentative` — moves tentative rules to `confirmed` (severity `block`) when they have `sessions_seen >= 2` AND `false_positive_overrides == 0`. Add `--force` to override.
- `compile` — convenience: runs both promote commands, then reminds the user to `git diff state/compiled-rules.json` before committing. Auto-commit is deliberately absent.
- `prune-candidates` — deletes candidates older than 30 days that were never promoted.
- `set-critic-verdict <candidate_id> <pass|block|needs-revision> [reason]` — records a Critic judgment on a candidate. Typically the Critic subagent runs this from within its own reasoning turn after evaluating the candidate.

## The Critic validation flow

Per BRD v3.3 §3.4, a candidate cannot become a `tentative` rule without an explicit Critic verdict of `pass`. Typical flow:

1. `correction-detector.js` writes a candidate to `state/rule-candidates/<hash>.json` (on Stop after >= 2 recurrences).
2. `/rules status` surfaces the candidate.
3. Spawn the Critic subagent (via the SDK Agent tool) with the candidate JSON as input. Ask it: "Does this describe a real, non-coincidental preference? Does the proposed pattern check have obvious false positives against a sample of the codebase?"
4. Critic returns `pass`, `needs-revision`, or `block`. Record it via `/rules set-critic-verdict <id> <verdict> [reason]`.
5. `/rules promote-candidates` moves passed candidates into `compiled-rules.json` as `tentative` (warn).
6. On next scaffolded-project session, if a `warn` fires and the model/user honors it (i.e. doesn't set `RULE_GATE_OVERRIDE`), the rule accumulates recurrence.
7. After `sessions_seen >= 2` AND `false_positive_overrides == 0`, `/rules promote-tentative` moves it to `confirmed` (block).
8. Human commits `state/compiled-rules.json` — that's the human-approval step.

## Distinct from `/evolve`

- `/evolve` (BRD §4.4) promotes **instincts** — natural-language patterns that become advisory **skills**. Advisory only, LLM-consumed.
- `/rules` (BRD §3.3) promotes **compiled rules** — with a machine-executable `check` spec that `hooks/rule-gate.js` runs to hard-block violations before the tool call lands. Enforcement, not advice.

## Gate

Before returning success:
- [ ] Subcommand recognized
- [ ] For `promote-*`: the specific lifecycle transition rules honored (Critic pass, sessions threshold, no FP overrides)
- [ ] For `compile`: user reminded to review the diff before committing
- [ ] Never auto-commits `state/compiled-rules.json`
