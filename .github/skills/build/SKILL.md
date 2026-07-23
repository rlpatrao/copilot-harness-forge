---
name: build
description: Full 12-phase SDLC pipeline. BRD → Architect (up to 11 rounds) → Spec → Design → Observe → Comply → Initialize → Auto (11 gates) → Post-build. Human gates on phases 1-4. Conditional phases 6-7 for AI-native projects.
argument-hint: "[path-to-BRD] [--mode full|lean|solo|turbo]"
---

# Build Skill

Full software development lifecycle pipeline. Orchestrates BRD creation, stack interrogation, story specification, UI mockups, state initialization, and autonomous build execution across 9 sequential phases plus a post-build learnings phase.

---

## Usage

```
/build path/to/requirements.md
/build path/to/requirements.md --mode lean
/build                              # Start from /brd interview
```

The `--mode` flag controls which ratchet gates `/auto` enforces. Default: `full`.

---

## 9-Phase Pipeline

### Phase 1 — Business Requirements [HUMAN APPROVAL]

Run `/brd` with the provided requirements document (or start the Socratic interview if no document provided). Outputs are written to `specs/brd/`.

**Stop and wait for explicit human approval.** Present a summary of the BRD and ask: "Approve BRD to proceed to Phase 2 (Architecture)?"

Do NOT proceed without a clear "yes" or "approved" from the user.

Run `/status` to display current project progress.

### Phase 2 — Architecture & Stack [HUMAN APPROVAL]

Run `/architect`. The architect agent reads the approved BRD, conducts an interactive 5-round stack interrogation with the human, generates design artifacts, and verifies completeness.

Outputs: `specs/design/architecture.md`, `api-contracts.md`, `api-contracts.schema.json`, `data-models.md`, `data-models.schema.json`, `component-map.md`, `folder-structure.md`, `deployment.md`, `project-manifest.json`, `calibration-profile.json`.

**Stop and wait for explicit human approval.** Present the architect's verification summary and any concerns. Ask: "Approve architecture to proceed to Phase 3 (Stories)?"

Run `/status` to display current project progress.

### Phase 3 — Story Specification [HUMAN APPROVAL]

Run `/spec` using the approved BRD and architecture. Outputs are written to `specs/stories/` and `features.json`.

**Stop and wait for explicit human approval.** Present story count, dependency groups, and feature list. Ask: "Approve stories to proceed to Phase 4 (UI Design)?"

Run `/status` to display current project progress.

### Phase 3.5 — Test Planning [AUTO]

Run `/test --plan-only` to generate test artifacts from the approved BRD and stories. The test-engineer agent reads every acceptance criterion and produces:

- `specs/test_artefacts/test-plan.md` — test strategy (pyramid, environments, tools, coverage targets, risk areas)
- `specs/test_artefacts/test-cases.md` — every test case mapped to a BRD requirement with steps and expected results
- `specs/test_artefacts/test-data/fixtures.json` — realistic test data for seeding and edge cases
- `specs/test_artefacts/traceability-matrix.md` — BRD requirement → story → test case → test file mapping

**Verification:** Every BRD requirement must have at least one test case. Every story's acceptance criteria must map to test cases. If the traceability matrix has gaps, the test-engineer must fill them before proceeding.

This phase is NOT optional. Tests without BRD traceability are ad-hoc — they might cover features by accident but nobody can answer "which test verifies requirement X?"

### Phase 4 — UI Mockups [HUMAN APPROVAL]

Spawn `ui-designer` agent to create interactive React+Tailwind HTML mockups in `specs/design/mockups/`. Architecture artifacts from Phase 2 are already complete — this phase only adds visual mockups.

Skip this phase entirely for API-only projects (project_type = "api-only" in calibration-profile.json).

**Stop and wait for explicit human approval.** Present mockup file list. Ask: "Approve mockups to proceed to autonomous build?"

Run `/status` to display current project progress.

### Phase 5 — Initialize State

Create state files before entering the autonomous loop:

1. `.claude/state/coverage-baseline.txt` — Write `0`
2. `.claude/state/mutation-baseline.txt` — Write `0`
3. `.claude/state/iteration-log.md` — Write header
4. `.claude/state/cost-log.json` — Write `[]`
5. `claude-progress.txt` — Write session 0 block:
   ```
   === Session 0 ===
   date: {ISO 8601}
   mode: {mode}
   model_routing: {from manifest}
   groups_completed: []
   groups_remaining: [all group IDs from dependency-graph.md]
   current_group: none
   features_passing: 0 / {total features}
   coverage: 0%
   learned_rules: 0
   next_action: Begin autonomous build with /auto
   ```

### Phase 5b — Initialize Changelog

Create `specs/brd/changelog.md` from `.claude/state/changelog-template.md` (replace `{date}` with today's date). This tracks all requirement changes throughout the project.

### Phase 5c — Findings Reporting Consent

Ask: "Would you like to help improve the forge? When enabled, the harness collects anonymized findings (no secrets, PII, or project code) and lets you review + submit them as GitHub issues. You always review everything before it's sent. Enable findings reporting?"

If yes: add `findings_reporting` block to `project-manifest.json` with `enabled: true`, `target_repo: "rlpatrao/claude-harness-forge"`, categories list, `last_reported: null`.
If no: add the block with `enabled: false`.

### Phase 5d — Check Unreported Findings

If `.claude/state/harness-findings-log.json` has unreported entries from a prior session, offer: "There are unreported findings from a previous build. Run `/report-findings` now?"

### Phase 6 — Observability Scaffolding [AUTO, conditional]

Read `project-manifest.json` → `observability.otel_enabled`. If true, run `/observe` to scaffold OpenTelemetry instrumentation, structured logging, and monitoring dashboards.

Skip if `otel_enabled` is false or not set. Most projects can add this later.

### Phase 7 — Compliance Setup [AUTO, conditional]

Read `project-manifest.json` → `compliance.regulations` and `ai_native.type`. If regulations are specified or the project is ML/agentic, run `/comply` in setup mode to generate compliance requirements document and model card template.

Skip for simple CRUD apps with no user data.

### Phases 8-11 — Autonomous Execution

Run `/auto --mode {mode}` to enter the autonomous build loop. The `/auto` skill handles: sprint contracts, agent teams, **11-gate ratchet** (including browser console capture, UI standards review, mutation testing, compliance review, and spec gaming detection), self-healing, and session chaining.

### Phase 12 — Post-Build

After `/auto` completes (all groups done or stopping criteria met):

1. Run `/architect --post-build` to fill in learnings (verdict, patterns, recommendations)
2. Run `/comply` final review (if ML/agentic project)
3. Run `/model-card` (if ML project)
4. **Update `README.md`** — refresh with actual build results: test count, coverage %, features completed, agent descriptions (if agentic). The README skeleton was created by the architect in Phase 2; this step fills in the runtime metrics.
5. **Verify `Makefile`** — run `make test` and `make lint` to confirm all targets work. Fix any broken targets.
6. Commit: `git add README.md Makefile && git commit -m "docs: finalize README and Makefile"`

### Phase 12b — Report Findings

If `findings_reporting.enabled` is `true` in manifest, run `/report-findings`. The user reviews and confirms before any submission.

### Phase 12c — Final Status

Run `/status` to display the final project dashboard with all metrics.

---

## Mode Reference

| Mode | Gates | Cost Estimate | When to Use |
|------|-------|---------------|-------------|
| `full` | All 11 gates per group | $100-300 | Production apps, complex requirements |
| `lean` | Gates 1-6, 9, 11 (skip UI, security, compliance) | $30-80 | Backend-heavy, internal tools |
| `solo` | Gates 1-3, 11 only | $5-15 | Bug fixes, small features, prototyping |
| `turbo` | Gates 1-3, 11 per commit; 4-10 once at end | $30-50 | Well-specified + capable model |

**Note:** Gate 11 (spec gaming detection) runs in ALL modes — it cannot be disabled. This prevents agents from gaming the verification system regardless of mode.

---

## Gotchas

- **Proceeding without approval:** Phases 1-4 each require explicit human approval. Silence is not consent.
- **Skipping the architect phase:** Phase 2 produces `project-manifest.json` and `component-map.md` which are required by `/auto`. Skipping architecture breaks the downstream pipeline.
- **Not initializing state files:** Phase 5 must create all state files before `/auto` runs.
- **Wrong mode passthrough:** Read the `--mode` flag and pass it to `/auto` exactly.
