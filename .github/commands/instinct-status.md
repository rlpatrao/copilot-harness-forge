---
description: Show pending, tentative, and confirmed instincts mined by hooks/instinct-extractor.js.
# generated-from: commands/instinct-status.md
---

# /instinct-status

Renders the contents of `instincts/{pending,tentative,confirmed}/` with scores and lifecycle stage.

## Output

```
instincts/
  pending/    <n> instincts (oldest: <date>)
    <hash>  score=<s>  freq=<f>  success=<sr>  sequence=[a,b,c]
    ...
  tentative/  <n> instincts (in N sessions)
  confirmed/  <n> instincts (eligible for /evolve clustering)
```

## Runtime

`node scripts/instinct-evolve.js status` emits JSON counts.

## Lifecycle reminder (BRD §4.4)

```
pending     30-day TTL unless promoted via /evolve
tentative   tracked over N sessions
confirmed   ready to cluster into a new skill
skill       merged into skills/
```
