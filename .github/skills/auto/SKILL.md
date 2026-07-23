---
name: auto
description: Autonomous build loop with Karpathy ratcheting, GAN evaluator, browser console capture, UI standards review, 8-gate ratchet, session chaining, and cross-project learnings. Iterates story groups until all features pass or stopping criteria met.
argument-hint: "[--mode full|lean|solo|turbo] [--group GROUP_ID]"
---

# Auto Skill

Autonomous build loop implementing Karpathy's ratcheting pattern with GAN-style generator-evaluator separation, agent teams for parallel execution, sprint contracts for verifiable done-criteria, self-healing with failure-driven learning, and session chaining for multi-context-window builds.

---

## SECTION 1: Usage, Prerequisites, and Agent Delegation

### Usage

```
/auto
/auto --mode lean
/auto --mode solo
/auto --group D
```

- `--mode` controls which ratchet gates are enforced. Default: `full`. Options: `full`, `lean`, `solo`, `turbo`.
- `--group` resumes or targets a specific dependency group. If omitted, picks the next unfinished group from the dependency graph.

### Prerequisites

Before `/auto` can run, the following must exist:

- `specs/stories/` — approved story files with acceptance criteria.
- `specs/design/` — approved architecture artifacts including `api-contracts.md` and `component-map.md`.
- `.claude/program.md` — project constraints and conventions.
- `features.json` — feature tracking file (created by `/spec`).
- `specs/stories/dependency-graph.md` — group ordering and dependencies.
- `claude-progress.txt` — session tracking file (created by `/build` phase 4).

If any prerequisite is missing, stop and report what is absent. Do not proceed with partial context.

### Evaluation Readiness Pre-Flight

After verifying the prerequisites above, validate that the evaluation pipeline can actually run. Read `project-manifest.json` and check:

1. **`evaluation.api_base_url`** — must be non-null (unless project is a CLI/library with no API).
2. **`evaluation.health_check`** — must be non-null (unless project is a CLI/library).
3. **`evaluation.ui_base_url`** — must be non-null if the project has a frontend (check `stack.frontend` is non-null).
4. **`verification.mode`** — must be one of `docker`, `local`, or `stub`.
5. **`verification.dev_bootstrap`** — must be non-null. This is the command the evaluator uses to start the app.

If any required field is null, halt with this message:

```
BLOCKED: Evaluation pipeline not ready. The following manifest fields are null:

  - evaluation.api_base_url (required — set by /architect)
  - verification.dev_bootstrap (required — set by /architect)

Run /architect to populate these fields before starting the build loop.
Without these, the evaluator cannot run and all stories will be marked
"done" without verification — defeating the purpose of the ratchet.
```

Do NOT proceed with the build loop if evaluation readiness fails. Building 50 stories that can never be E2E-tested is wasted effort.

### Infrastructure Pre-Flight (Phase 0)

After evaluation readiness passes, attempt to start the app stack and verify it works before writing any feature code:

1. Run `verification.dev_bootstrap` command.
2. Health-check `evaluation.api_base_url` + `evaluation.health_check` with retry (5 attempts, exponential backoff).
3. If health check passes: tear down with `verification.dev_teardown`, proceed to build loop.
4. If health check fails: halt with `BLOCKED: Local dev stack failed health check. Fix infrastructure before building features.` Include the error output.

This catches infrastructure problems (missing Docker images, broken database configs, port conflicts) before any stories are implemented.

### Agent Delegation

**Critical rule: /auto orchestrates but NEVER implements code directly.**

- `/auto` is the orchestrator. It reads state, makes decisions, spawns agents, and manages the loop.
- Code generation is delegated to the **generator** agent (via `/implement` or direct agent spawn).
- Code verification is delegated to the **evaluator** agent (via `/evaluate` or direct agent spawn).
- Design critique is delegated to the **design-critic** agent.
- `/auto` never writes application code, tests, or configuration files itself.

---

## SECTION 2: Context Recovery (Step 1 of Every Iteration)

At the start of EVERY iteration — including the first — read these files in order:

1. **`.claude/program.md`** — Constraints may have changed mid-run. Re-read every iteration. Never cache.
2. **`.claude/state/learned-rules.md`** — Accumulated project rules. Inject verbatim into ALL agent prompts spawned this iteration.
3. **`claude-progress.txt`** — Read the LAST session block (the block after the final `=== Session` marker). Extract: `current_group`, `groups_completed`, `groups_remaining`, `last_commit`, `next_action`.
4. **`features.json`** — Current pass/fail state for all features. Determines what work remains.
5. **`specs/stories/dependency-graph.md`** — Pick the next unfinished group. A group is "unfinished" if any of its stories' features are not passing in `features.json`. Respect dependency ordering: do not start a group whose upstream dependencies have failing features.

If `claude-progress.txt` indicates a `current_group` that is not yet complete, resume that group. Otherwise, select the next unfinished group in dependency order.

Run `/status` to display current project state before resuming the build loop.

---

## SECTION 3: Sprint Contract Negotiation (Steps 2-3)

Sprint contracts define the verifiable done-criteria for a group. Two-step propose-approve process using generator and evaluator agents.

### Step 2 — Generator Proposes Contract

Spawn generator as a subagent with this prompt:

> Read stories [list IDs for this group], `specs/design/api-contracts.md`, `specs/design/component-map.md`, `specs/test_artefacts/test-cases.md` (for test cases mapped to this group's stories), and `specs/test_artefacts/traceability-matrix.md` (for BRD traceability). Propose a sprint contract for group {ID}. Include: setup (test fixtures), api_checks, playwright_checks, design_checks, architecture_checks, teardown, features list. Each check must trace to a test case ID from test-cases.md. Write the contract to `sprint-contracts/{group}.json`.
>
> The `setup` array must create all test data needed for checks to be meaningful (users, seed records, config). The `teardown` array must clean up test data. Without fixtures, admin pages show "access denied" and data pages show empty states — the evaluator sees rendered HTML and marks PASS but verifies nothing.
>
> API checks must verify behavioral correctness, not just liveness. A 200 response with `{"error": "Failed to connect"}` or `{"data": []}` when data should exist is a FAIL. Include `expect.body_contains` or `expect.body_schema` assertions for every check.

The generator produces a draft contract based on the story acceptance criteria and the architecture design.

### Step 3 — Evaluator Approves Contract

Spawn evaluator as a subagent with this prompt:

> Read the proposed sprint contract at `sprint-contracts/{group}.json`. Review each check against the story acceptance criteria and API contracts. Add any missing checks. Remove any checks that do not trace to an acceptance criterion. Write the final contract to the same path.

Rules:
- **No back-and-forth.** The evaluator has final say. The generator does not get to dispute.
- **Contract is immutable after negotiation.** Once the evaluator writes the final version, no one edits it.
- **Skip in Solo mode.** In Solo mode, the generator works directly without contracts or evaluator verification.

---

## SECTION 4: Agent Team Execution (Step 4)

Spawn the generator agent to create and manage a Claude Code agent team for the current group.

### Dependency Handshake

Before spawning teammates, the generator analyzes the component map:
1. Identifies shared files (files in 2+ stories)
2. Identifies interface boundaries (`Produces:` / `Consumes:` in component map)
3. Builds a micro-DAG grouping teammates into execution phases
4. Designates integrators for shared files

Log the micro-DAG to `iteration-log.md`.

If no cross-dependencies exist, all teammates spawn in parallel (legacy behavior).

### Phased Execution

| Phase | Who | Starts When | Must Do |
|-------|-----|------------|---------|
| 1 | Teammates with no upstream deps | Immediately | Implement + commit typed interface contracts |
| 2 | Teammates consuming Phase 1 outputs | All Phase 1 teammates complete | Code against committed interface contracts |
| 3 | Integrators for shared files | All Phase 2 teammates complete | Collect declared additions, write to shared files |

Max 5 concurrent teammates per phase. Batch in groups of 5 if more.

### Teammate Spawn Prompt

Every teammate receives:
- Story acceptance criteria (from `specs/stories/story-NNN.md`)
- File ownership (from `specs/design/component-map.md`)
- Learned rules (from `.claude/state/learned-rules.md` — inject verbatim)
- Quality principles (from `.claude/skills/code-gen/SKILL.md`)
- Interface contracts from upstream teammates (Phase 2+ only)
- If story involves external API: `.claude/skills/code-gen/references/api-integration-patterns.md`

### Solo Mode

In Solo mode, the generator works alone sequentially. No team spawning, no phases. Read stories in dependency order and implement one at a time.

### Model Tiering

| Role | Model | Rationale |
|------|-------|-----------|
| `/auto` orchestrator | Opus | Judgment, architectural decisions |
| Evaluator | Opus | Skeptical verification |
| Design critic | Opus | Subjective visual judgment |
| Generator lead | Sonnet | Coordination, lower cost |
| Generator teammates | Sonnet | Mechanical implementation |
| Security reviewer | Sonnet | Pattern matching |

### Model Routing

Read `execution.model_routing` from `project-manifest.json` at the start of every iteration:

```json
"model_routing": {
  "strategy": "cloud-only | hybrid | local-only",
  "reasoning_agents": { "model": "...", "provider": "...", "base_url": "..." },
  "code_gen_agents": { "model": "...", "provider": "...", "base_url": "..." },
  "local_model": { "name": "...", "runtime": "...", "startup_command": "..." }
}
```

**How to apply:**
- **cloud-only** (default): Use Claude models as normal. Opus for reasoning agents, Sonnet for code gen.
- **hybrid**: Spawn architect/evaluator with Claude Opus. Spawn generator/test-engineer/reviewers via the `base_url` in `code_gen_agents` using OpenAI-compatible API format.
- **local-only**: ALL agents use the local model endpoint. Pass `base_url` and `model` name when spawning every agent.

When `strategy` is `hybrid` or `local-only`, and the provider is `openai-compatible`:
1. Before the first iteration, verify the local model is running: `curl -s {base_url}/models | jq .`
2. If not running and `local_model.startup_command` exists, start it and wait for health.
3. Log model routing in `claude-progress.txt` session block.
4. In cost-tracker, use local model pricing ($0/token) instead of Claude pricing.

**Fallback:** If local model is unreachable after 3 retries, log a warning and ask the human whether to fall back to cloud or abort.

---

## SECTION 5: Ratchet Gate (Step 5)

After the agent team completes, run the ratchet gate. The ratchet is monotonic: progress never regresses.

### Gate Result States

Every gate produces one of three results:

| State | Meaning | Progression |
|-------|---------|-------------|
| **PASS** | Gate executed and all checks succeeded | Allowed |
| **FAIL** | Gate executed and one or more checks failed | Blocked — enters self-healing loop |
| **NOT_RUN** | Gate could not execute due to missing prerequisites | Blocked — halt with actionable error |

**Only PASS allows progression.** NOT_RUN is treated like FAIL for progression purposes, but with a different response: instead of entering the self-healing loop, halt immediately and report what prerequisite is missing. The self-healing loop cannot fix missing infrastructure or configuration.

A gate returns NOT_RUN when:
- Sprint contract does not exist for the current group (should have been created in Section 3)
- `project-manifest.json` evaluation URLs are null
- `verification.dev_bootstrap` is null or the bootstrap command has not been run
- The evaluator cannot reach the app (no browser tool available AND no API URL configured)

**Log gate states** in `claude-progress.txt` using the three-state format: `gate_5: PASS`, `gate_5: FAIL (api_check POST /users)`, or `gate_5: NOT_RUN (sprint contract missing)`.

Twelve sub-gates, mode-dependent:

| Gate | Full | Lean | Solo | Turbo | Condition |
|------|------|------|------|-------|-----------|
| 1. Unit tests (pytest, vitest) | Yes | Yes | Yes | Per commit | Always |
| 2. Lint + types (ruff, mypy, tsc) | Yes | Yes | Yes | Per commit | Always |
| 3. Coverage >= baseline | Yes | Yes | Yes | Per commit | Always |
| 4. Architecture (files exist, schema validation) | Yes | Yes | No | End only | Always |
| 5. Evaluator (API + Playwright + Browser Console) | Yes | Yes | No | End only | Always |
| 6. Code reviewer (static quality + story traceability) | Yes | Yes | No | End only | Always |
| 7. UI standards review (SaaS/enterprise conformance) | Yes | No | No | End only | UI projects |
| 8. Security reviewer (OWASP web + agentic top 10) | Yes | No | No | End only | Always |
| 9. Mutation testing (mutmut/Stryker) | Yes | Yes | No | End only | Always |
| 10. Compliance reviewer (bias, fairness, PII) | Yes | No | No | End only | ML projects only |
| 11. Spec gaming detection | Yes | Yes | Yes | Per commit | Always |
| 12. Smoke launch (real data) | Yes | Yes | Yes | Per commit | Always |

### Gate 9 — Mutation Testing

Run after Gate 3 (coverage). Uses mutmut (Python) or Stryker (TypeScript) to inject small bugs and verify tests catch them.

```bash
# Python
mutmut run --paths-to-mutate=src/ --tests-dir=tests/ --runner="pytest -x -q"
# TypeScript
npx stryker run
```

Ratchet the mutation score: if previous score was 72%, new code must maintain or exceed 72%. Read baseline from `.claude/state/mutation-baseline.txt` (created on first run if missing).

If mutation score drops: FAIL. The generator must add tests that catch the surviving mutants.

### Gate 10 — Compliance Review (ML projects only)

Skip if `project-manifest.json` → `ai_native.type` is not `ml` or `agentic` and `compliance.model_card_required` is false.

Spawn the `compliance-reviewer` agent. It checks:
- Fairness metrics implemented and within thresholds
- PII handling follows documented policy
- Model card exists and is complete
- Audit trail covers AI decisions
- Data retention policy implemented

If any BLOCK findings: FAIL. Generator must fix before proceeding.

### Gate 11 — Specification Gaming Detection

**Run in ALL modes** — this is the anti-gaming gate. Check after every commit:

1. **Test count monotonicity:** Count tests before and after. If count decreased, FAIL. Agents must not delete tests to make suites pass.
2. **No tautological assertions:** Scan test files for `expect(true).toBe(true)`, `assert True`, `expect(x).toBe(x)` patterns. FAIL if found.
3. **Mock target validation:** For every mock/stub, verify the mocked interface matches the real implementation's signature. FAIL on phantom mocks.
4. **Coverage source validation:** If coverage increased, verify it came from new production code being tested, not from adding trivial code or inflating test counts.
5. **No test weakening:** If a test assertion changed from specific to generic (e.g., `toBe(42)` → `toBeTruthy()`), WARN.

This gate exists because research shows frontier models actively game specifications (METR 2025, Anthropic reward hacking research). It cannot be disabled.

### Gate 12 — Smoke Launch (Real Data Integration)

**Run in ALL modes after every group.** This gate verifies the application actually starts and runs with real production data. It exists because tests using synthetic fixtures routinely pass while the app crashes on launch (see learnings/failure-patterns/common-failures.md, pattern F1).

**For web apps (api_base_url set in manifest):**
1. Verify Docker stack is healthy: `docker compose ps`
2. Hit health endpoint: `curl -sf {api_base_url}/health`
3. If UI exists: load homepage via Playwright, check for no console errors

**For CLI apps / libraries / non-web projects (no api_base_url):**

Two sub-checks (both required):

**12a. Headless smoke launch:**
1. Import the main module: `python3 -c "import {module}; print('OK')"` or equivalent
2. Load real production data (config files, data files, maps, models — whatever the app reads at startup)
3. Exercise the main code path headlessly for N iterations:
   ```bash
   python3 -c "
   from {module} import MainClass, DataLoader
   data = DataLoader.from_file()  # REAL file, not test fixture
   app = MainClass(data)
   for _ in range(100):
       app.update()
   print('Smoke launch: OK')
   "
   ```

**12b. PTY-based E2E (for interactive CLI apps):**
If the app has a terminal UI (curses, prompt_toolkit, rich, etc.), run PTY-based E2E tests that launch the actual app in a pseudo-terminal, send keystrokes, and verify rendered output. See `.claude/skills/test-patterns/SKILL.md` for the PTY testing pattern.

Required scenarios:
- App launches and shows initial screen (verify expected text in PTY output)
- User input is accepted (send keystrokes, read response)
- App exits cleanly on quit command (return code 0)
- Full user workflow exercised (start → interact → complete → exit)

**For all project types:**
- If the smoke launch crashes: **FAIL**. Read the traceback, fix the code, retry (up to 3 attempts).
- The key distinction: unit tests verify logic with controlled inputs. Smoke launch verifies the app doesn't crash with real-world data (files with unequal row lengths, large datasets, production configs with unexpected values).
- This gate cannot be skipped. Code that hasn't been seen running is not verified.

### Turbo Mode (for highly capable models)

For builds using Opus 4.6+ where the model can sustain coherence across long tasks:
- Generator works without story group decomposition — implements all stories sequentially in a single pass
- Sprint contracts NOT negotiated per-group — one contract for the entire build
- Evaluator runs ONCE at the end (not per-group)
- Ratchet gates 1-3 still run after each commit (tests + lint + coverage)
- Gates 4-8 (architecture, evaluator, code reviewer, UI standards, security) run once at the end
- Significantly cheaper (~$30-50) but less incremental verification

Use when: Model is highly capable AND project is well-specified AND you trust the generator to self-correct.
Do NOT use when: External API integrations, complex multi-service architecture, or first time using the harness.

### Fast Lane (trivial changes)

Skip gates 4-8 (architecture, evaluator, code reviewer, UI standards, security) for commits that ONLY contain:
- Lint/format fixes (ruff auto-fix, eslint --fix)
- Documentation updates (.md files only)
- Type annotation fixes (no logic changes)
- Learned rules updates

Detection: If `git diff --name-only` shows only .md files, or if the commit message starts with `fix: lint` or `docs:`, skip the evaluator. Gates 1-3 (tests + lint + coverage) always run.

This prevents the expensive evaluator from blocking trivial housekeeping changes.

### Gate 1 — Unit Tests

```bash
cd backend && uv run pytest -x -q && cd ..
cd frontend && npm test && cd ..
```

Both must pass with zero failures. The `-x` flag stops at first failure for fast feedback.

### Gate 2 — Lint + Types

```bash
# Backend
uv run ruff check . && uv run mypy src/
# Frontend
npm run lint && npm run typecheck
```

All four commands must exit with code 0.

### Gate 3 — Coverage >= Baseline

```bash
uv run pytest --cov=src --cov-report=term-missing -q | grep "^TOTAL" | awk '{print $NF}'
```

Compare the result with `.claude/state/coverage-baseline.txt`. The new coverage percentage must be **greater than or equal to the baseline AND >= 80% (hard floor)**. If it drops below either threshold, the gate FAILS — even if all tests pass.

**Coverage policy (ref: "AI is forcing us to write good code" by Steve Krenzel):**
- **Floor: 80%.** No commit may drop below this. The ratchet gate BLOCKS.
- **Target: 100%.** Every line the agent wrote must be verified by a test. At 100%, any uncovered line is an unambiguous signal of missing verification.
- **TDD enforced:** Tests are written BEFORE implementation. The generator and teammates must follow the red-green-refactor cycle: write failing test → implement → verify pass → commit.

### Gate 4 — Architecture Checks

Spawn evaluator to verify `architecture_checks` from the sprint contract:
- All files in `files_must_exist` must be present on disk.
- Schema validation against `specs/design/api-contracts.schema.json` if specified.

### Gate 5 — Evaluator (API + Playwright + Browser Console)

Spawn evaluator with the full sprint contract and `--skip-lifecycle` (the orchestrator manages the app lifecycle via SECTION 7). The evaluator runs three layers plus browser health monitoring:

**Layer 1 — API Checks:**
- All `api_checks` against the live Docker stack.
- On failure: read `docker compose logs backend --tail=50` for stack traces.

**Layer 2 — Playwright Checks:**
- All `playwright_checks` against the running UI.
- On failure: capture page screenshot + DOM snapshot for debugging.

**Layer 2.5 — Browser Console Health (runs during Layer 2):**
During every Playwright check, the evaluator captures browser telemetry:
- `console.error` entries → FAIL (with full error text and source file:line)
- Unhandled promise rejections → FAIL
- Network 4xx/5xx not in sprint contract `expected_errors` → FAIL
- `console.warn` entries → WARN (logged, non-blocking)

Browser errors are captured using the richest available tool:

1. **Playwright MCP plugin** (preferred): `browser_console_messages` and `browser_network_requests` provide full console output and network activity without writing test files. `browser_take_screenshot` captures visual state for UI review.
2. **Chrome extension MCP**: `read_console_messages` and `read_network_requests` for real-browser capture with full stack traces.
3. **Playwright listeners** (fallback): `page.on('console')` and `page.on('pageerror')` wired into E2E test files.

The evaluator auto-detects which tools are available at the start of each evaluation pass.

Browser errors produce structured failure JSON with `layer: "browser_console"` or `layer: "network"` and `error_type: "console_error"` or `"network_error"`, enabling targeted self-healing (generator fixes the exact file:line from the error).

The evaluator writes its report to `specs/reviews/evaluator-report.md`.

### Gate 6 — Code Reviewer (Static Quality)

Spawn `code-reviewer` agent to run a static analysis pass on all files changed in this group. Checks:
- Six quality principles (small modules, static typing, short functions, explicit errors, no dead code, self-documenting)
- Architecture compliance (no upward layer imports)
- Story traceability (every file traces to a story in the sprint contract)
- Learned rules violations
- Test coverage quality (not just quantity — no mocked business logic, no generic assertions)

The code-reviewer writes its report to `specs/reviews/code-review.md`.

**Eval validation:** If the code-reviewer's rules or learned-rules have changed since the last eval run, auto-run the eval samples (`.claude/evals/`) to verify the reviewer still catches known violations.

FAIL if any BLOCK-level finding exists (architecture violation, security issue, missing story traceability).
WARN for advisory findings (function length, missing docstrings).

### Gate 7 — UI Standards Review (Full Mode Only)

Skip in Lean, Solo, and Turbo (per-group) modes.

Spawn `ui-standards-reviewer` agent for every frontend page in the current group:

1. Take screenshots at 1280px and 375px widths via Playwright
2. Read `calibration-profile.json` for project type and UI standards config
3. Run the conformance checklist (see `.claude/skills/evaluate-patterns/references/ui-standards-checklist.md`)
4. Report PASS/FAIL per check with specific fix instructions for FAILs

**This is a single pass, not an iterative loop.** If checks fail, the fix instructions are sent to the generator via the normal self-healing loop (max 3 attempts). No scoring, no plateau detection, no originality judgment.

### Gate 8 — Security Reviewer (Full Mode Only)

Skip in Lean, Solo, and Turbo (per-group) modes.

Spawn `security-reviewer` agent to scan all code changed in this group for OWASP top 10 vulnerabilities:
- Injection (SQL, command, XSS)
- Auth bypass (missing middleware, unvalidated JWT)
- Hardcoded secrets (API keys, passwords, tokens)
- SSRF and path traversal
- CSRF (missing tokens on state-changing endpoints)

FAIL if any critical vulnerability found. Fix instructions go to generator via self-healing.

---

## SECTION 6: PASS/FAIL Handling (Steps 6-7)

### On PASS (All Gates Clear)

Execute these steps in order:

0. **Write the integrity sidecar (before staging/flip):** for each verified feature, hash its artifact(s) so the E2E gate can detect post-hoc tampering:
   `node -e "require('.claude/hooks/lib/artifact-integrity.js').writeSidecar(process.cwd(),'{id}',['verification/{id}.json','verification/{id}.png'])"`
   Then `git add verification/{id}.json verification/{id}.png verification/{id}.sha256.json`. The `hooks/e2e-gate.js` hook BLOCKS the `passes` flip unless the committed/staged sidecar matches the artifacts.
1. **Commit:** `git add -A && git commit -m "feat: implement group {group}"`
2. **Update features.json:** Set `passes: true` for all features in this group's sprint contract.
3. **Update claude-progress.txt:** Append a new session block (see SECTION 10 for format).
4. **Update iteration-log.md:** Append entry with group ID, timestamp, verdict, and summary.
5. **Update coverage-baseline.txt:** Write the new coverage percentage (ratchet up).
6. **Next group:** Return to SECTION 2 (context recovery) for the next iteration.

Run `/status` to update and display `specs/status.md` with current project health.

### On FAIL — Self-Healing Loop (Max 3 Attempts)

Do not immediately revert. Attempt targeted self-healing first.

**Attempt 1-3:**

1. **Diagnose:** Read the evaluator report (`specs/reviews/evaluator-report.md`) for specific failure details. Identify the exact check that failed and the error output.

2. **Classify** the failure into one of 12 categories:

| Category | Signal | Auto-Fix Strategy |
|----------|--------|-------------------|
| Lint/format | ruff/eslint error output | `ruff check --fix && ruff format` |
| Type error | mypy/tsc error with file:line | Fix the type annotation at the specified location |
| Test failure | pytest/vitest assertion error | Fix the production code, NOT the test |
| Import error | ImportError / ModuleNotFoundError | Fix the import path or `__init__.py` |
| Coverage drop | Coverage % below baseline | Add tests for the specific uncovered lines |
| API check fail | HTTP 500/404/wrong schema | Read `docker compose logs backend --tail=50`, identify root cause from stack trace, fix service/router |
| Playwright fail | Element not found / assertion error | Read the selector, fix the component |
| Console error | `console.error` or unhandled rejection during Playwright | Read browser error with source file:line, fix the component (null check, error boundary, loading state) |
| Network error | Frontend fetch returns unexpected 4xx/5xx | Fix the API call URL, error handling, or backend endpoint |
| Infrastructure fail | Container exit code / service won't start / health check timeout | Read `docker compose logs` or process stderr, fix config or deps |
| Setup fail | Test fixture creation failed (API returned error during setup) | Fix the endpoint or seed script that the setup action calls |
| Behavioral fail | 200 response with error body, empty list when data expected | Fix the feature logic — the endpoint is reachable but not functioning correctly |
| Architecture drift | Schema mismatch / missing file | Read the schema, fix the response or create the file |
| Duplication | jscpd % over baseline/cap (runs inside the lint-drift/entropy gate, not a numbered gate) | Extract the duplicated block into a shared helper; re-run `node .claude/scripts/jscpd-gate.js` |
| UI standards fail | Conformance check failed | Apply the fix instruction from ui-standards-reviewer (e.g., change color to #767676, add min-height: 44px) |

3. **Spawn generator** to apply the targeted fix. The generator prompt must include:
   - The structured failure JSON from `specs/reviews/eval-failures-NNN.json` (see evaluator agent for schema).
   - The category and auto-fix strategy from the table above.
   - All learned rules.
   - Instruction to fix ONLY the failing issue — no other changes.
   - **Accumulated `prior_attempts`:** On attempt 2, include attempt 1's fix description and result. On attempt 3, include both. This prevents the generator from re-trying the same fix.

   **Error type to fix strategy mapping:**

   | error_type | Strategy |
   |-----------|----------|
   | `lint_format` | Run auto-fix tools (`ruff check --fix`, `eslint --fix`) |
   | `type_error` | Fix annotation at file:line from stack trace |
   | `import_error` | Check module path, fix import statement |
   | `key_error` | Check data shape at source — log incoming data, fix accessor |
   | `timeout` | Check if service is started, increase timeout, add retry |
   | `connection_refused` | Verify service URL in config, check port mapping |
   | `validation_error` | Compare request/response against schema, fix model |
   | `assertion_error` | Read test assertion, compare expected vs actual, fix logic |
   | `console_error` | Read browser error source file:line, add null check / error boundary / loading state |
   | `network_error` | Fix frontend fetch URL or error handling, or fix backend endpoint returning unexpected status |
   | `ui_standards_fail` | Apply specific fix from ui-standards-reviewer (color, spacing, touch target, empty state) |
   | `api_transient` | Retry evaluator check once (code may be correct, API was flaky). If retry passes, do not count as a self-heal attempt. |
   | `api_permanent` | Fix wrapper error handling or request format |

4. **Re-run the failed gate** (not all gates — just the one that failed).

5. **3rd failure — hard stop for this group:**
   - Revert changes: `git checkout -- .`
   - Log the failure to `.claude/state/failures.md` with group ID, failure category, all three attempt summaries.
   - Extract a learned rule (see SECTION 12).
   - Mark the group as BLOCKED in `claude-progress.txt`.
   - Escalate to the user with a summary.
   - Continue to the next unblocked group.

---

## SECTION 7: App Lifecycle Management

`/auto` is responsible for starting and stopping the application. The evaluator does NOT manage the app lifecycle.

Read `verification.mode` from `project-manifest.json`. Default: `docker`.

### Mode: docker (default)

**Startup:**
1. Run `verification.dev_bootstrap` from `project-manifest.json` (e.g., `docker compose -f docker-compose.dev.yml up -d`)
2. Run DB migrations if detected (Alembic, Prisma, Django — see evaluate skill Step 3.5)
3. Run health-check retry loop against `evaluation.api_base_url` + `evaluation.health_check`
4. If health check fails: FAIL the current group, log to failures.md

**Between Groups:**
```bash
# Re-run bootstrap to pick up new code
{verification.dev_bootstrap}
```
Wait for health check before handing off to evaluator.

**Teardown:**
```bash
{verification.dev_teardown}
```

**Error Context:** `docker compose logs --tail=50 {service_name}`

### Mode: local

**Startup:**
1. Read `verification.local.start_commands` from manifest
2. Start each command as a background process, capture stdout/stderr to `.claude/state/process-{name}.log`
3. Run health-check retry loop against configured URLs

**Between Groups:** Kill and restart processes (re-run start commands).

**Teardown:** Kill all background processes started by the orchestrator.

**Error Context:** Read from `.claude/state/process-{name}.log`

### Mode: stub

**Startup:**
1. Read `verification.stub.schema_source` from manifest
2. Generator creates a lightweight mock server (FastAPI or Express) that serves schema-valid example responses for every endpoint in the schema
3. Start the mock server on a free port
4. Run health-check retry loop

**Between Groups:** Regenerate mock server if schema has been amended (check `specs/design/amendments/`).

**Teardown:** Kill mock server process.

**Error Context:** Stub mismatch reports — when a request doesn't match any endpoint in the schema, log the requested path and method.

**Stub mode limitations:** Layer 1 checks validate request/response shapes but cannot verify business logic. Layer 2 (Playwright) skipped unless a separate frontend URL is configured.

### Worktree Isolation (All Modes)

When using `--worktree` flag, each worktree gets its own app instance:
- Docker mode: different port mappings (configured via `project-manifest.json`)
- Local mode: different port arguments in start commands
- Stub mode: different mock server port (auto-selected)

---

## SECTION 8: Architecture Amendment Detection

After each agent team completes (before the ratchet gate):

1. Check `specs/design/amendments/` for new files that were not present at the start of this iteration.
2. If new amendment files are found:
   - Read each amendment file to understand the architectural change.
   - Spawn a planner agent to update affected architecture artifacts (`api-contracts.md`, `component-map.md`, schema files).
   - Commit the amendment: `git add specs/design/ && git commit -m "refactor: update api-contracts for {change description}"`
3. Proceed to the ratchet gate with the updated architecture.

Amendments are a signal that the implementation discovered a design gap. They must be incorporated before evaluation, not deferred.

### Changelog Integration

When an amendment is detected and processed:
1. Read `specs/brd/changelog.md` to get the current version.
2. Append a new entry:

```markdown
## v{N} — {date}
- **Change:** {amendment description}
- **Reason:** Auto-detected during implementation — design gap discovered by generator/evaluator
- **Impact:** {affected artifacts}
- **Cascade:** design done | implement in-progress
```

3. This ensures auto-detected amendments are visible in the same changelog as user-requested changes.

---

## SECTION 9: UI Standards Review (Frontend Groups Only, Full Mode)

Read `calibration-profile.json` for project type and UI standards config. Fall back to SaaS defaults if file does not exist.

### Configuration

The `calibration-profile.json` file contains a simple feature-flag set (no weighted scoring):

```json
{
  "project_type": "saas",
  "ui_standards": {
    "responsive_required": true,
    "mobile_breakpoint": 375,
    "desktop_breakpoint": 1280,
    "wcag_level": "AA",
    "min_touch_target": 44,
    "spacing_grid": 8,
    "empty_states_required": true,
    "error_pages_required": true
  }
}
```

### Execution

For each frontend page in the current group:

1. **Screenshot** — Take screenshots at desktop (1280px) and mobile (375px, if `responsive_required`) widths using Playwright.
2. **Spawn `ui-standards-reviewer`** with screenshots + calibration profile.
3. **Reviewer runs the checklist** from `.claude/skills/evaluate-patterns/references/ui-standards-checklist.md`, filtered by project type.
4. **PASS** — all required checks pass → record result, continue to next page.
5. **FAIL** — one or more required checks fail → send fix instructions to generator via normal self-healing loop.

### Key Differences from Original Design-Critic

| Aspect | Old (design-critic GAN) | New (ui-standards-reviewer) |
|--------|------------------------|---------------------------|
| Model | Opus | Sonnet |
| Execution | Multi-iteration GAN loop (up to 10 rounds) | Single pass |
| Scoring | 4 weighted criteria, numeric scores, thresholds | Binary PASS/FAIL per checklist item |
| Originality | Scored and optimized for | Not evaluated |
| Plateau detection | Yes (forced pivots on score stagnation) | N/A |
| Fix handling | Critique sent back for re-scoring | Fix instructions sent to generator via self-healing |
| Cost per group | $8-15 (multiple Opus evaluations) | $0.50-1.50 (single Sonnet pass) |

### Termination

- All required checks pass → PASS, move to next group
- Checks fail → self-healing loop (max 3 attempts, same as any other gate failure)
- 3rd failure → revert, log, extract learned rule, mark group BLOCKED
- Lean/Solo modes: skip this section entirely
- Turbo mode: runs once at end

---

## SECTION 10: Session Chaining

`claude-progress.txt` is the memory bridge between context windows. Each iteration appends a new session block.

### Format

```
=== Session {N} ===
date: {ISO 8601}
mode: {full|lean|solo}
groups_completed: [A, B, C]
groups_remaining: [D, E, F]
current_group: D (extraction)
current_stories: [E4-S1, E4-S2]
sprint_contract: sprint-contracts/group-D.json
last_commit: {hash} "{message}"
features_passing: 47 / 203
coverage: 82%
learned_rules: 6
blocked_stories: none
next_action: Run evaluator against group D
```

### Rules

- **Append, never overwrite.** Each session block is added after the previous one. The file is an append-only log.
- **Read the LAST block** for recovery. When context recovery (SECTION 2) reads this file, it parses only the final session block to determine current state.
- **Session number increments monotonically.** Parse the last session number and add 1.
- **`next_action` is critical.** This field tells a fresh context window exactly what to do first. Be specific: "Run evaluator against group D" is good. "Continue" is not.
- **Include `blocked_stories`** if any stories failed 3 consecutive self-heal attempts. Format: `[E4-S3 (import error), E5-S1 (docker fail)]`.

---

## SECTION 11: Stopping Criteria

OR logic with priority (check in order):

1. **Hard stop:** An architecture violation that self-healing cannot fix, OR the total iteration count exceeds 50. Stop the entire `/auto` run. Report status and hand off to the user.

2. **Escalate (per-story):** A story fails 3 consecutive self-heal iterations. Mark it BLOCKED. Log to `failures.md`. Extract learned rule. Skip to the next group. Do NOT stop the entire run.

3. **Coverage gate:** Coverage drops below the baseline AFTER a successful commit. This overrides the pass — revert the commit (`git revert HEAD --no-edit`), log the regression, and re-enter self-healing for coverage.

4. **Success:** All features in `features.json` have `passes: true` AND coverage >= baseline threshold. Print:
   ```
   === BUILD COMPLETE ===
   Features passing: {N}/{N}
   Coverage: {X}%
   Groups completed: [list]
   Blocked stories: [list or "none"]
   Learned rules: {count}
   Total iterations: {count}
   ```
   Then:
   1. Run `docker compose down -v`
   2. Run `/architect --post-build` — fills in verdict, patterns, and recommendations in the stack decision record. Updates integration notes for any external APIs used.
   3. Generate `README.md` for the built application (see below)
   4. Commit: `git add README.md && git commit -m "docs: add README with architecture, setup, and API reference"`
   5. Print estimated cost summary (same as `/context-budget --summary` output)
   6. Exit

### README Generation (on completion)

After the build completes, generate a `README.md` that describes the GENERATED APP (not the harness).

Read these files for content:
- `specs/brd/brd.md` — project description
- `specs/design/architecture.md` — system architecture
- `specs/design/api-contracts.md` or `api-contracts.schema.json` — API surface
- `specs/design/component-map.md` — module structure
- `project-manifest.json` — tech stack
- `init.sh` — setup steps
- `docker-compose.yml` (if exists) — services
- `.env.example` (if exists) — required environment variables

**Required sections:** Project description, Architecture (diagram/layers), Tech Stack (table), Prerequisites, Quick Start (copy-paste commands), API Endpoints (table), Project Structure (directory tree), Running Tests, Environment Variables (table from .env.example), Development notes.

**Rules:**
- Do NOT mention Claude, the harness, `/auto`, agents, or the GAN loop. This is a developer README for the app.
- All commands must work against the generated code.
- API table must match actual routes, not just the spec.
- Environment variables must match `.env.example` exactly.

---

## SECTION 12: Failure-Driven Learning

Learned rules are the harness's long-term memory. They prevent the same mistake from recurring across iterations and context windows.

### When to Extract a Rule

Extract a new rule when the same error type (by category from SECTION 6) appears **2 or more times** in `.claude/state/failures.md`. Check after every failure entry.

### Rule Format

Append to `.claude/state/learned-rules.md`:

```markdown
## Rule {N}: {descriptive title}

- **Source:** Group {group}, Story {story}, Iteration {iter}
- **Pattern:** {what went wrong — the repeated error signature}
- **Rule:** {the concrete instruction to prevent recurrence}
- **Applied in:** {list of agents/skills that must follow this rule}
```

### Injection

- Rules are injected verbatim into ALL future agent prompts: generator teammates, evaluator, ui-standards-reviewer, code-reviewer, security-reviewer.
- Include the full text of every rule, not just titles or references.
- Rules are NEVER deleted. The rule set is monotonically growing — it is a ratchet on institutional knowledge.
- If `learned-rules.md` does not exist yet, create it with a header: `# Learned Rules\n\nRules extracted from failure patterns during autonomous build.\n`

---

## SECTION 13: Gotchas

- **Not reading `program.md` each iteration:** Constraints can change mid-run (e.g., a human updates program.md while /auto is running). Always re-read at the start of every iteration.
- **Retrying the same approach after failure:** The self-healing loop must classify the failure and apply a DIFFERENT fix strategy. If attempt 1 failed with a type error fix, attempt 2 must try a different approach (e.g., restructure the function signature, not just change the annotation).
- **Reverting too eagerly:** Self-heal first (3 attempts). Only revert after the 3rd failure. Premature revert wastes working code.
- **Reverting too broadly:** `git checkout -- .` reverts everything. After the 3rd failure, only the current group's files should be reverted. Use the file ownership list from `component-map.md` to scope the revert: `git checkout -- {file1} {file2} ...`
- **Ignoring failure log patterns:** Check `failures.md` for recurring patterns BEFORE spawning the generator. If the same error has appeared before, inject the relevant learned rule into the generator prompt proactively.
- **Autonomous drift:** Every code change must trace to a story in the current group. If the generator introduces code that does not map to any acceptance criterion, reject it. No speculative features.
- **No human check-in:** Cap at 50 total iterations. After 50 iterations, stop and present a status report regardless of completion state. Long autonomous runs without human oversight risk compounding errors.
- **Not injecting learned rules:** Every agent prompt must include the full text of all learned rules. This is the most common cause of repeated failures. If you spawn an agent without learned rules, you are guaranteeing a preventable regression.
- **Ignoring browser console errors:** Layer 2.5 browser console capture runs during EVERY Playwright check. If the evaluator skips console monitoring, silent frontend bugs accumulate. Ensure Playwright listeners are wired in every E2E test.
- **Treating UI standards as optional:** In Full mode, Gate 7 (UI standards) is not advisory — it's a blocking gate. Failed conformance checks must be fixed through self-healing before the group can pass.
- **Not running post-build learnings:** After the build completes, the architect must be invoked with `--post-build` to fill in verdict and patterns. Skipping this breaks the cross-project knowledge loop.

---

## SECTION 14: Post-Build Actions

After all groups pass and the build is complete:

1. **Report findings** — if `findings_reporting.enabled` in manifest, prompt: "Build complete. Report findings to the forge? Run `/report-findings` to review and submit."
2. **Changelog summary** — if `specs/brd/changelog.md` has entries beyond v1, display: "This build processed {N} requirement changes (v1 → v{M}). See `specs/brd/changelog.md` for the full history."
3. **Final status** — run `/status` to display the final project dashboard.
