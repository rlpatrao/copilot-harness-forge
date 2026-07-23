---
name: spec
description: Decompose a BRD into epics, user stories, acceptance criteria, and a dependency graph with parallel groups for agent team execution.
disable-model-invocation: true
argument-hint: "[path-to-BRD]"
---

# /spec — Spec Writing

## Usage

```
/spec [path-to-BRD]
```

## Steps

1. Read `.claude/skills/spec-patterns/SKILL.md` for decomposition patterns.
2. Spawn `spec-writer` agent with the BRD as input.
   - Pass the current BRD version (from `specs/brd/changelog.md` or `specs/brd/app_spec.md` frontmatter) to the agent. Stories must include `BRD Version: v{N}` in their frontmatter.
3. Agent writes output to `specs/stories/`:
   - `epics.md` — epic summaries with story lists
   - `E{n}-S{n}.md` — individual story files with acceptance criteria
   - `dependency-graph.md` — hard dependencies + parallel groups
4. **Generate `features.json`** in the project root. **CRITICAL FORMAT:** Must be a JSON **array** (not a dict/object). One entry per story. The `/auto` loop reads this file with `json.load()` and iterates it as a list. Wrong format = auto loop breaks.

   **Story file naming:** Use `E{n}-S{n}.md` format (e.g., `E1-S1.md`, `E3-S4.md`). Alternative: `{GROUP}-{NN}-{slug}.md` (e.g., `A-01-types.md`). The `id` field in features.json must match the filename stem.

   Schema per entry (all 10 fields required):
   ```json
   [
     {
       "id": "E1-S1",
       "category": "foundation",
       "story": "Define shared types and enums",
       "group": "A",
       "description": "One-line summary",
       "steps": ["AC1: Given...", "AC2: Given..."],
       "passes": null,
       "last_evaluated": null,
       "failure_reason": null,
       "failure_layer": null
     }
   ]
   ```

   **Validation:** After writing, verify: `python3 -c "import json; d=json.load(open('features.json')); assert isinstance(d, list), 'Must be array'; print(f'{len(d)} features')"`
5. Verify gate: every story has acceptance criteria, layer assignment, and group.
6. Present epic summary and dependency graph for user review.

## Gate

- All stories have acceptance criteria (testable, specific)
- Every story has a layer assignment (Types, Config, Repository, Service, API, UI)
- Dependency graph has no circular dependencies
- Parallel groups assigned for agent team execution

## Gotchas

- **Vague acceptance criteria.** "Works properly" is not testable. Each criterion must be verifiable with a specific test case.
- **Missing layer assignments.** Without layers, the architect can't assign files and the implementer can't enforce dependency rules.
- **Circular dependencies in graph.** If A depends on B depends on A, the agent team can't parallelize. Break the cycle by extracting shared types.
- **Too many stories per epic.** Keep epics to 3-5 stories. Larger epics should be split — they're hard to parallelize and review.
- **Skipping the user review.** Always present the dependency graph before moving to architecture. Catching spec issues here is 10x cheaper than in implementation.
