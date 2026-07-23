---
description: Execute a YAML recipe (BRD §6.5) — deterministic, parameterized, repeatable workflow.
argument-hint: <recipe-file.yaml>
# generated-from: commands/recipe-run.md
---

# /recipe-run

Executes a recipe from `recipes/<name>.yaml`. Recipes are deterministic and parameterized — same inputs always produce the same step sequence.

## Workflow

1. Validate the recipe against `recipes/schema.json`.
2. Resolve `inputs:` from the command-line arguments or prompt the user for missing values.
3. For each step in `steps[]`, invoke the named skill with the given parameters.
4. Capture each step's output; pass to the next step if `pipe: true`.
5. Emit a final summary.

## Example invocation

```
/recipe-run recipes/example-weekly-consulting.yaml client="EngCo" week_ending="2026-05-19"
```

## Hard rules

- **No mutable state between recipe runs.** Each run starts from the inputs only.
- **No user prompts inside steps unless declared.** Recipes are unattended by default.
- **Skill failures abort the recipe.** No partial-execution mode.

See `recipes/README.md` for the schema and `recipes/example-weekly-consulting.yaml` for a worked example.

## Runtime

1. `node scripts/recipe-runner.js <recipe.yaml> key=value ...` emits a JSON execution plan to stdout (exit 2 if any step's skill is missing).
2. The orchestrator iterates the plan and invokes each `skill` via the Skill tool with the resolved `params`.
