---
name: iterative-retrieval
description: Progressive context refinement for subagents. Don't dump everything; retrieve in passes. Start with a list of file paths and one-line abstracts; load full content only when the abstract proves insufficient.
when_to_use:
  - any subagent spawn where the relevant code spans >20 files
  - read-only subagents (Planner, Critic, Spec-Auditor) — they benefit most because they cannot edit, so re-reading is cheap
  - sessions in CONSERVE or HIGH regime per BRD §3.7
brd_ref: §5.2
---

# Iterative retrieval

A 50-file dump is a bad context. A grep with file paths + line numbers is a useful index. The agent decides what to read in full.

## Pattern

```
Pass 1: Grep / Glob → list of candidate file paths + one-line abstract.
Pass 2: Read 3-5 most relevant files in full.
Pass 3: If gap remains, refine: grep within those files, or expand to 2-hop dependencies.
Pass 4+: Stop. If you couldn't answer in 4 passes, the question is wrong — clarify or split.
```

## When NOT to use

- Implementation tasks where the file is already known. Skip the index; read the file.
- Refactors touching 1-3 files. The index pass is overhead.
- Already-loaded files. Don't re-grep what you have.

## Cost rationale

Subagent context windows are paid for in tokens AND in the model's attention. A 50-file dump degrades both. Iterative retrieval keeps the subagent's reasoning sharp by feeding it only what it needs to answer the current sub-question.

## Anti-patterns

- **Loading the index, then ignoring it and reading 20 files.** The index is the budget cap; respect it.
- **Calling Grep with overly-general patterns.** `Grep "function"` returns garbage. `Grep "function handleStop"` is useful.
- **Passing Pass 1 results to the subagent verbatim.** Filter to the top-K relevant entries before handoff.

## Implementation note

This skill is documentation, not code. The actual progressive-retrieval logic lives in `agents/planner.md`, `agents/critic.md`, `agents/spec-auditor.md` prompts — each instructs the model to follow this pattern.
