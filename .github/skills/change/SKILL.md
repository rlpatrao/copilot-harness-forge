---
name: change
description: Log a requirement change to the BRD changelog, run impact analysis, and cascade updates through affected specs, design, and implementation.
argument-hint: "[change description]"
---

# /change

Log a requirement change, trace its impact across the project, and cascade updates through affected specs, design, and implementation. Every change is versioned in the BRD changelog so agents can detect staleness.

## Steps

### Step 1 — Capture the change

If a change description was provided as an argument, use it. Otherwise, ask the user:

> What changed? Describe the requirement change in one or two sentences.

Also ask:

> Is this an **addition**, **modification**, or **removal**?

Record the change type for the changelog entry.

### Step 2 — Identify affected BRD section

Read `specs/brd/brd.md` and identify which section(s) the change affects. Present the mapping to the user:

> This change appears to affect:
> - Section 3.2 — Fraud Detection Rules
> - Section 5.1 — Alert Notifications
>
> Correct? (yes / adjust)

### Step 3 — Log to changelog

Append an entry to `specs/brd/changelog.md` (create from `state/changelog-template.md` if it does not exist).

**Changelog format:**

```markdown
## v{N} — {YYYY-MM-DD}
- **{addition|modification|removal}:** {change description}
- **Affected sections:** {section list}
- **Requested by:** user
- **Impact:** {pending — filled in Step 5}
```

Increment the version number from the last entry. The version is a simple integer (v1, v2, v3...).

### Step 4 — Update the BRD feature file

Apply the change to the relevant section(s) of `specs/brd/brd.md`. Mark the updated section with a comment:

```markdown
<!-- Updated in v{N} — {change description} -->
```

### Step 5 — Impact analysis

Trace the change through the project artifacts. Check each of these and report whether it is affected:

| Artifact | Location | How to check |
|----------|----------|--------------|
| Epics & stories | `specs/features.json` | Search for stories referencing affected BRD sections |
| Design docs | `specs/design/` | Search for references to changed requirements |
| UI mockups | `specs/design/mockups/` | Check if mockup covers affected feature |
| Test plans | `specs/tests/` | Search for test cases covering affected behavior |
| Test code | `tests/` | Search for test files testing affected stories |
| Implementation | `src/` | Search for code implementing affected stories |
| Playwright E2E | `tests/e2e/` | Search for E2E tests covering affected flows |

Present the impact summary:

```
Impact Analysis for v{N}:
  Stories affected:    3 (S-012, S-015, S-022)
  Design docs:         1 (fraud-rules-arch.md)
  Mockups:             1 (alert-dashboard.html)
  Test plans:          2
  Test files:          4
  Source files:        6
  E2E tests:          1

  Estimated rework:    Medium
```

Update the changelog entry's `**Impact:**` line with the summary.

### Step 6 — Execute cascade

Only re-run the phases that are actually affected. Do not re-run the entire pipeline.

**Cascade scope rules:**

| Change type | What gets re-run |
|-------------|-----------------|
| New requirement (addition) | spec-writer (new stories), architect --amendment, ui-mockup (if UI), test-engineer (new cases), mark new stories `pending` in features.json |
| Modified requirement | spec-writer (update stories), architect --amendment (if arch impact), ui-mockup (if UI change), test-engineer (update cases), mark affected stories `pending` |
| Removed requirement | spec-writer (remove/archive stories), test-engineer (remove cases), mark affected stories `removed` |

For each phase in the cascade:

1. Print what will be re-run and why
2. Ask the user: **"Proceed with cascade? (yes / skip {phase} / stop)"**
3. Execute the phase
4. Report outcome before moving to the next phase

### Step 7 — Staleness detection convention

All agents check `specs/brd/changelog.md` at the start of their run. If the changelog version is newer than the version recorded in their last output, they print a warning:

> WARNING: BRD has changed (v{N}) since this artifact was last generated (v{M}). Run `/change` to cascade updates or acknowledge the delta.

This convention is documented here so agents can implement it consistently.

**Version tracking:** Each agent output file includes a frontmatter or header comment with `brd-version: v{N}`. When the agent runs, it compares this against the latest changelog version.

## Changelog Format Example

```markdown
# BRD Changelog

## v3 — 2026-04-11
- **modification:** Fraud score threshold changed from 0.7 to 0.85
- **Affected sections:** 3.2, 3.4
- **Requested by:** user
- **Impact:** 2 stories, 1 design doc, 3 test files, 4 source files

## v2 — 2026-04-09
- **addition:** Add real-time webhook notifications for high-risk transactions
- **Affected sections:** 5.1
- **Requested by:** user
- **Impact:** 3 new stories, 1 mockup, 2 test plans

## v1 — 2026-04-07
- **Initial BRD approved**
```

## Gotchas

- The changelog is append-only. Never edit or remove previous entries.
- If `specs/brd/changelog.md` does not exist, create it from `state/changelog-template.md` and set the initial version to v1.
- Version numbers are simple integers, not semver. They represent the number of BRD changes, not releases.
- The cascade is interactive by default. Each phase requires user confirmation. This prevents runaway re-generation.
- If a change affects no downstream artifacts (e.g., a wording-only clarification), the cascade will report "No affected artifacts" and skip re-runs.
- The `/change` skill does NOT re-run code generation automatically. It marks stories as `pending` so the next `/implement` or `/build` run picks them up.
- Multiple changes can be batched: run `/change` multiple times, and the cascade will accumulate. Run the cascade once when ready.
