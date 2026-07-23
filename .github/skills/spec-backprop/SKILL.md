---
name: spec-backprop
description: Walk-back algorithm for the Spec-Auditor subagent. Given a failure at phase N, identifies the earliest phase whose spec, if tightened, would have prevented the failure. Proposes a surgical amendment.
when_to_use:
  - eval ratchet failed at phase >= 5
  - the same feature has failed >= 2 retries on the same phase
  - a /spec-audit slash command was invoked manually
brd_ref: §4.7
---

# Spec-gap backpropagation

The harness's tendency on a phase-N failure is to re-run phase N. But the root cause is usually upstream — the spec at phase K (K<N) was loose enough that the failure could occur. Without backprop, the harness grinds on symptoms.

## Algorithm

```
let gap = describe failure at phase N
for K in (N-1, N-2, ..., 1):
  let spec_K = read the spec / contract / step list for phase K
  if spec_K, if tightened, could prevent gap:
    return amendment for phase K
return "no upstream spec gap — failure is genuinely at phase N"
```

## What "tightened spec prevents the failure" means

The amendment must be:

- **Local** — one paragraph or 2-3 step additions.
- **Specific** — names concrete files, fields, or invariants.
- **Mechanically checkable** — a follow-up phase can verify the spec was met without re-interpreting the prose.

If you can only describe the tightening abstractly ("the spec should be clearer"), keep walking back; you haven't found the gap.

## What does NOT trigger backprop

- A failing test caused by a bug in the production code. That's a phase-N failure with a code fix — no spec amendment needed.
- A failing test caused by a missing dependency. That's a phase-1 environmental fix — `init.sh` is the artifact to amend, not the BRD.
- A flake. Re-run before backpropagating.

## Anti-patterns

- **Walking all the way to phase 1.** If the failure could only have been prevented by amending phase 1, the architecture is wrong — escalate to HITL, don't propose a BRD §1 amendment.
- **Proposing rewrites.** Surgical diffs only. Replacing whole paragraphs hides the gap; the diff should make the gap visible in 1-3 added lines.
- **Cascading amendments in one audit.** One gap per audit. If two exist, the second audit runs after the first amendment lands.

## Source

Pattern from `kingofevil/forge` (MIT). See `agents/spec-auditor.md` for the subagent definition and BRD §10.3 §4.7.
