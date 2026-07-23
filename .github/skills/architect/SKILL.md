---
name: architect
description: Interactive stack interrogation, design artifact generation, decision verification, and learnings persistence. Runs after BRD approval, before spec decomposition.
argument-hint: "[--post-build]"
---

# Architect Skill

Interactive technical design phase. The architect reads the BRD, interviews the human about stack and deployment decisions, generates machine-readable design artifacts, verifies completeness, and persists decisions for cross-project reuse.

---

## Usage

```
/architect                 # Auto-detect mode (interview | synthesis) based on sentinels
/architect --from-import   # Force synthesis mode (needs specs/design/.imported)
/architect --restart       # Force interview mode even when sentinels present
/architect --post-build    # Post-build learnings update only (legacy phase 5)
```

---

## Prerequisites

- `specs/brd/` must contain an approved BRD (app spec and/or feature specs)
- `.claude/learnings/` should exist (created by `/scaffold`)

---

## Step 0 — Mode detection (BRD v3.1 §3)

**Run before any other step.** Determines whether to run interview mode (existing 11 rounds) or synthesis mode.

```bash
if [[ "$*" == *"--restart"* ]]; then
  MODE=interview
  # user explicitly overrides sentinels; archive any prior review docs first
  mkdir -p specs/design/amendments
  mv specs/design/architecture-review-v*.md specs/design/amendments/ 2>/dev/null || true
elif [[ "$*" == *"--from-import"* ]] && [ -f specs/design/.imported ]; then
  MODE=synthesis
elif [ -f specs/design/.imported ]; then
  # sentinel present but no explicit flag — ask human once
  echo "Architecture was imported (see specs/design/.imported)."
  echo "Recommended: synthesis mode (skips 11 rounds)."
  echo "Type 'r' + Enter to restart with interview instead. Any other key: synthesis."
  read -r ANS
  if [ "$ANS" = "r" ]; then MODE=interview; else MODE=synthesis; fi
else
  MODE=interview
fi
```

**On synthesis mode:** follow [`synthesis-mode.md`](synthesis-mode.md) end-to-end (Steps 1-7 of that doc), then jump to **Step 5 — Review loop** below.

**On interview mode:** proceed to Step 1 below.

---

## Interactive Flow (interview mode)

### Step 1 — Read Context

Read in order:
1. `specs/brd/` — all approved specs
2. `.claude/learnings/stack-decisions/` — all prior project records
3. `.claude/learnings/integration-notes/` — any relevant API notes
4. `.claude/learnings/failure-patterns/common-failures.md`

Summarize relevant learnings to the human before starting questions.

### Step 2 — Stack Interrogation (up to 11 rounds)

Conduct one round at a time. Wait for human response before proceeding. Rounds 7-9 are **conditional** — only activate if the BRD describes the relevant requirements (agentic system, ML, user data).

**Round 1 — Backend:** Present 2-3 options informed by BRD requirements. Challenge mismatches.
**Round 2 — Database:** Analyze data patterns from BRD. Challenge schema-stack mismatches.
**Round 3 — Frontend:** Framework, styling, state management.
**Round 4 — AI/LLM Model Selection:** Which models power the forge agents? Cloud-only, hybrid, or local-only routing.
**Round 5 — Deployment:** Dev environment, target deployment, CI/CD, external services.
**Round 6 — Verification mode:** Docker/local/stub verification config.
**Round 7 — Agentic Architecture** *(if BRD describes agents):* Agent count, protocols (MCP/A2A), communication pattern, framework, human oversight model.
**Round 8 — AI/ML Pipeline** *(if BRD involves ML):* Models, training/inference, batch/real-time, RAG components, vector DB, monitoring.
**Round 9 — Governance & Compliance** *(if BRD involves user data or AI decisions):* Regulations (GDPR/HIPAA/SOC2/AI Act), PII handling, fairness requirements, audit trail.
**Round 10 — Context & Cost Budget:** Build budget, token strategy, prompt caching.
**Round 11 — Verify & Challenge:** Summarize ALL decisions (including AI/compliance). List concerns.

See `agents/architect.md` for detailed question templates and challenge examples.

### Step 3 — Generate Project README and Makefile

**Immediately after stack confirmation** (not post-build), generate:

1. **`README.md`** at project root — fill the template from `.claude/templates/README.project.template.md` with all stack decisions, setup instructions, run commands. Developers need this from day one to `make install && make dev`.

2. **`Makefile`** at project root — fill from `.claude/templates/Makefile.template`. Must include: `install`, `dev`, `test`, `lint`, `typecheck`, `migrate`, `seed`, `docker-up`, `docker-down`, `clean`. Adapt commands to the chosen stack (e.g., `uv run pytest` vs `pytest`, `pnpm` vs `npm`).

These are generated NOW, not post-build. A project without a README and Makefile is not usable.

### Step 4 — Generate Design Artifacts

After human confirms stack, generate all artifacts to `specs/design/`:
- `architecture.md` — component diagram, tech choices with rationale
- `api-contracts.md` + `api-contracts.schema.json` — typed endpoints
- `data-models.md` + `data-models.schema.json` — Pydantic + TS + DB
- `component-map.md` — story → file mapping with Produces/Consumes
- `folder-structure.md` — complete file tree
- `deployment.md` — Docker Compose, env vars, migrations

Also generate/update:
- `project-manifest.json` — complete stack config (fills skeleton from scaffold)
- `calibration-profile.json` — UI standards config based on project type

### Step 4 — Decision Verification Gate

Run self-check before presenting to human. Flag any gaps:
- Every BRD feature → API endpoint
- Every data entity → model
- No upward layer imports in folder structure
- External APIs → typed wrappers in component map
- All env vars documented

### Step 5 — Write Learnings

Write stack decision record to `.claude/learnings/stack-decisions/{project-name}-stack.md`.
Update `_index.md`.

**Note (BRD v3.1 §3):** With the Step 6 review loop in place, defer this write until Step 6 approval. Restart at Step 6 would otherwise persist learnings for a rejected architecture.

---

## Step 6 — Architecture review loop (BRD v3.1 §3)

**Runs after Step 5 in interview mode, or immediately after `synthesis-mode.md` Step 7 in synthesis mode.**

The goal: present a single review document to the human, capture approve / amend / restart, iterate up to 3 amend cycles, then either handoff to `/auto` or fall back to interview.

### Step 6.1 — Emit the review doc

Fill [`templates/architecture-review.md`](templates/architecture-review.md) and write to `specs/design/architecture-review-v${N}.md` where `${N}` starts at 1.

Print to the human:

```
Architecture review v${N} written to specs/design/architecture-review-v${N}.md

Please review sections 1-8. Decide in section 9:
  [A] Approve   — I'll finalize architecture.md, persist learnings, and set the /auto handoff flag
  [M] Amend     — describe changes; I'll produce v${N+1} (${remaining}/3 amend cycles remaining)
  [R] Restart   — drop this synthesis/interview output and run the full 11-round interview

Type A, M, or R:
```

### Step 6.2 — Read the human decision

**BRD v3.4 auto-approve:** if `--auto-approve` was passed AND mode is `synthesis` (never in interview mode), skip this step: treat the decision as `A (Approve)` and jump to Step 6.3. Log a note "auto-approved via --auto-approve (BRD v3.4)" to the review doc's decision section for audit.

Otherwise, wait for A/M/R. Interpret:

- **A (Approve):** proceed to Step 6.3
- **M (Amend):** proceed to Step 6.4 (if amend budget remains)
- **R (Restart):** proceed to Step 6.5

### Step 6.3 — On Approve

1. Copy `specs/design/architecture-review-v${N}.md` → `specs/design/architecture-review-final.md`
2. If Step 5 (learnings) was deferred, run it now: write `.claude/learnings/stack-decisions/{project-name}-stack.md` and update `_index.md`
3. If synthesis mode: leave imported `specs/design/architecture.md` in place; keep `architecture-derived.md` as reference
4. If interview mode: promote structured decisions into `specs/design/architecture.md` (if not already written by Step 4)
5. Write `state/architecture-approved.flag`:

   ```yaml
   approved_at: 2026-06-11T14:30:00Z
   version: v${N}
   review_doc: specs/design/architecture-review-v${N}.md
   mode: interview | synthesis
   next_suggested_command: /auto
   ```

6. Print handoff message:

   ```
   ✓ Architecture approved at v${N}.
   ✓ specs/design/architecture-review-final.md is authoritative.
   ✓ state/architecture-approved.flag written.
   Next: run /auto to start the autonomous build loop.
   (The SessionStart hook will surface this suggestion next session.)
   ```

7. Exit success.

### Step 6.4 — On Amend

Amend budget starts at 3 (i.e., you can produce v2, v3, v4). If cycle would produce v5 or later, force Restart with an informative message:

```
Amend budget exhausted (3 cycles used). Restart with full 11-round interview? [Y/n]
```

If within budget:

1. Read the human's inline amendments from section 9 of v${N}
2. Apply changes to the extracted decisions (backend/frontend/DB/deployment/component-map/etc.)
3. Re-generate any impacted derived artifacts (component-map, folder-structure, api-contracts)
4. Increment N, fill `templates/architecture-review.md` with v${N+1}, include an "Amendment history" entry citing what changed and why
5. Loop back to Step 6.1

### Step 6.5 — On Restart

1. Archive all `specs/design/architecture-review-v*.md` to `specs/design/amendments/`
2. Remove `specs/design/.imported` if present (user is explicitly abandoning the imported architecture)
3. Do NOT persist learnings (they were deferred)
4. Restart at Step 1 in interview mode (skip Step 0 to avoid loop)

### Amend budget diagram

```
v1 (initial) ──[Amend]──→ v2 ──[Amend]──→ v3 ──[Amend]──→ v4 ──[Amend requested]──→ Force Restart
                │                │                │                │
              Approve          Approve          Approve          Approve
                ↓                ↓                ↓                ↓
              handoff to /auto (in all 4 approve cases)
```

### What SessionStart does with the flag

The `state/architecture-approved.flag` file is picked up by [`hooks/session-start.js`](../../hooks/session-start.js) on the next session. It emits a system reminder to the coding-agent:

```
Architecture was approved at 2026-06-11T14:30:00Z (v2, synthesis mode).
Ready to start the autonomous build loop.
Suggested: run /auto
Review doc: specs/design/architecture-review-final.md
```

We do NOT auto-invoke `/auto` — that would violate the "don't take irreversible actions without confirmation" principle. The user runs `/auto` explicitly.

---

## Post-Build Mode (`--post-build`)

Invoked by `/auto` after build completes. Reads `learned-rules.md` and `failures.md`, fills in:
- "Verdict after build" per decision
- "Patterns That Worked"
- "Patterns to Avoid Next Time"
- "Recommendations for Similar Projects"

Also writes/updates integration notes for any external APIs used during the build.

---

## Gotchas

- **Not reading learnings first:** Always read existing stack-decisions before interviewing. Past project experience prevents repeating mistakes.
- **Accepting weak reasoning:** "I'm familiar with it" is not sufficient for a production choice. Challenge with BRD-specific trade-offs.
- **Incomplete component map:** The generator needs unambiguous file ownership. If two stories might touch the same file, designate an integrator.
- **Missing env vars:** Every external service needs env vars in `.env.example`. Missing vars cause deploy failures.
- **Skipping verification gate:** Gaps found at implementation time cost 10x more. Run the self-check.
