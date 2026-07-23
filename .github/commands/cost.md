---
description: Show per-session cost breakdown by workflow (BRD §6.1).
# generated-from: commands/cost.md
---

# /cost

Renders the cost ledger for the current session from `state/cost-log.json`, broken down by workflow and provider.

## Output

```
session: <id>
duration: <start> → <now>

by workflow:
  initializer     <tokens>  $<usd>   (n=<calls>)
  coding-agent    <tokens>  $<usd>   (n=<calls>)
  planner         <tokens>  $<usd>   (n=<calls>)
  critic          <tokens>  $<usd>   (n=<calls>)
  ...

by provider:
  anthropic/claude-opus-4-7      <tokens>  $<usd>
  anthropic/claude-sonnet-4-6    <tokens>  $<usd>
  anthropic/claude-haiku-4-5     <tokens>  $<usd>

total:  <tokens>  $<usd>
```

Pricing comes from a fallback table in `scripts/cost-render.js`. Per BRD §10.4 §6.1, the Pi-AI pricing table is the conceptual source; we maintain a local copy in the script.

## Runtime

This command runs `node scripts/cost-render.js` from the project root and surfaces its stdout.

## When to use

- During development to confirm cost-aware routing is doing its job.
- Before invoicing on consulting deliverables (per BRD §6.1 rationale).
- When debugging an unexpected cost spike.
