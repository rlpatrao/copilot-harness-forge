---
name: dogfood
description: Run autonomous self-testing of the forge. Creates a test project, runs the full pipeline through all groups, self-heals, fixes forge bugs, and produces a report.
# generated-from: commands/dogfood.md
---

# /dogfood — Autonomous Forge Self-Testing

When the user runs this command, read and follow `.claude/skills/dogfood/SKILL.md` exactly.

**This command runs the forge's own pipeline against a real test project to find and fix bugs in the forge itself.**

Default test project: "Agentic fraud investigation system" with `--type agentic --mode full`.

## Quick Reference

```
/dogfood                                          # Default: agentic fraud detection, full mode
/dogfood "Build a task manager" --type crud        # Simple CRUD app test
/dogfood "Build an AI writing assistant" --type agentic  # Agentic app test
```

## What Happens

1. Creates `test-projects/{name}/` (gitignored)
2. Scaffolds with all 11 agents, 36 skills, 18 hooks
3. Runs 12-phase /build pipeline through ALL groups (A-F)
4. Classifies every failure as forge-level or project-level
5. Fixes forge bugs in real-time (commits to forge repo)
6. Self-heals project code failures via normal auto loop
7. Runs validation scripts (scaffold, evals, compliance)
8. Produces `dogfood-report.md` with full results

## Key Principle

**Do not stop to ask the human.** Run autonomously. Make decisions. Log everything. Fix the forge when it breaks.
