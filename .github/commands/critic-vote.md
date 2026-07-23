---
name: critic-vote
description: Run a 3-instance majority-vote re-verification against the current diff for a feature about to flip passes:false→true. Writes verification/<id>.votes.json. Required by hooks/e2e-gate.js before the flip is accepted.
argument-hint: <feature-id>
# generated-from: commands/critic-vote.md
---

# /critic-vote — 3-instance majority vote at merge boundary

When the user runs this command, read and follow `.claude/skills/critic-vote/SKILL.md` exactly.

Pass the feature id through as `$ARGUMENTS`.

Exit 0 on APPROVED, exit 2 on BLOCKED. Writes `verification/<id>.votes.json` in both cases.
