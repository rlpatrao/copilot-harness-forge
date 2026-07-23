---
name: dogfood
description: Autonomous self-testing of the forge. Creates a test project, runs the full 12-phase pipeline, self-heals on failures, fixes forge bugs when found, and produces a dogfooding report.
argument-hint: "[prompt] [--type crud|ml|agentic] [--mode full|lean|solo]"
---

# /dogfood — Autonomous Self-Testing

Run the forge's own pipeline against a real test project to find and fix bugs in the forge itself. This is not a test of the generated app — it's a test of the forge's skills, agents, hooks, and gates.

## Usage

```
/dogfood "Build a fraud detection SaaS" --type agentic --mode full
/dogfood "Build a task manager" --type crud --mode lean
/dogfood  # Uses default: agentic fraud detection, full mode
```

## How It Works

The dogfood skill operates in two nested loops:

```
OUTER LOOP (forge-level):
  1. Scaffold test project
  2. Run full /build pipeline (inner loop)
  3. On forge-level failure → fix the forge → re-scaffold → retry
  4. On success → run all validation scripts
  5. Produce dogfooding report

INNER LOOP (project-level — the normal /auto loop):
  For each group A through F:
    1. Negotiate sprint contract
    2. Spawn agent team to implement stories
    3. Run 11-gate ratchet
    4. On gate failure → self-heal (fix project code, retry up to 3x)
    5. On pass → mark features, advance to next group
```

The key difference from a normal `/build`: when a failure is caused by the **forge itself** (bad skill instruction, broken hook, missing template, wrong gate logic), the dogfood skill fixes the forge source code, re-copies the fix into the test project's `.claude/`, and retries.

## Failure Classification

Every failure is classified as **forge-level** or **project-level**:

| Signal | Classification | Action |
|--------|---------------|--------|
| Validation script fails (validate-scaffold.sh) | **Forge** | Fix validation script or scaffold command |
| Hook crashes with JS error | **Forge** | Fix the hook |
| Skill references non-existent file or template | **Forge** | Fix the skill or create the missing file |
| Gate checks wrong path (e.g., /src/ vs /app/) | **Forge** | Fix the gate logic |
| features.json has wrong format | **Forge** | Fix spec skill's format instructions |
| Agent produces invalid output format | **Forge** | Fix agent definition or skill prompt |
| Generated code has syntax errors | **Project** | Self-heal via generator (normal auto loop) |
| Generated code fails tests | **Project** | Self-heal via generator |
| Architecture violation in generated code | **Project** | Self-heal via generator |
| Compliance check fails (missing fairness metrics) | **Project** | Self-heal via generator |

## Steps

### Step 1 — Create Test Project

```bash
mkdir -p test-projects/{project-name}
```

The test project lives inside the forge repo (gitignored via `test-projects/` in `.gitignore`).

### Step 2 — Scaffold

Follow `/scaffold` steps exactly against the test project. Run `validate-scaffold.sh` immediately after.

If validation fails: **this is a forge bug**. Read the failure, fix the forge source, re-scaffold, re-validate. Log the issue.

### Step 3 — Write project-manifest.json

Based on the `--type` flag:
- `crud`: Standard manifest, no ai_native section
- `ml`: Add `ai_native.type: "ml"`, `compliance.model_card_required: true`, `compliance.fairness_metrics: true`
- `agentic`: Add `ai_native.type: "agentic"`, `ai_native.framework: "langgraph"`, full compliance + security sections

### Step 4 — Run Full /build Pipeline

Execute all 12 phases sequentially. At each phase:

1. Run the phase
2. Verify the expected outputs exist
3. If outputs are missing or malformed: classify as forge or project issue
4. If forge issue: fix, re-run phase
5. If project issue: normal self-healing (auto loop handles this)

**Phase-specific verification:**

| Phase | Expected Outputs | Forge Issue If |
|-------|-----------------|----------------|
| 1. BRD | `specs/brd/app_spec.md` + feature specs | Template missing or malformed |
| 2. Architect | `specs/design/*.md` + manifest updated | Architect skill missing round, design artifact template broken |
| 3. Spec | `specs/stories/E*.md` or `{G}-*.md` + `features.json` (array) | features.json is dict, stories missing acceptance criteria |
| 3.5. Test Planning | `specs/test_artefacts/test-plan.md` + `test-cases.md` + `traceability-matrix.md` + `test-data/fixtures.json` | Test cases not mapped to BRD, missing traceability |
| 4. Design | `specs/design/mockups/*.html` | Mockup template broken |
| 5. State init | All state files exist | Scaffold missing state file |
| 6. Observe | `backend/*/telemetry.py`, `monitoring/*` | OTel template broken |
| 7. Comply | `docs/model-card.md`, compliance docs | Compliance skill or template broken |
| 8-11. Auto | Code generated, gates pass | Hook crashes, gate logic wrong, skill instructions ambiguous |
| 12. Post-build | Learnings written, model card complete | Learnings skill broken |

### Step 4.5 — Set Up Runtime Environment (MANDATORY)

**This is not optional.** Code that isn't tested is not verified. Install dependencies and verify the environment before entering the auto loop.

#### Backend Setup
```bash
cd {project-root}/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"  # or: pip install -r requirements.txt
```

If `pip install` fails:
- Read the error (missing system dep? incompatible version?)
- Fix `pyproject.toml` or `requirements.txt`
- Retry
- If the fix required changing forge templates or skills → **forge issue**, fix and log

Verify: `python3 -c "import app; print('Backend importable')"` — if this fails, fix imports.

#### Frontend Setup
```bash
cd {project-root}/frontend
npm install
```

If `npm install` fails: fix `package.json`, retry. Verify: `npx tsc --noEmit` passes.

#### Database Setup (if Docker available)
```bash
cd {project-root}
docker compose up -d db
# Wait for health
until docker compose exec db pg_isready -U postgres 2>/dev/null; do sleep 2; done
# Run migrations
cd backend && alembic upgrade head
```

If Docker is not available: skip Gate 5 (evaluator) but still run all other gates. Log that Docker gates were skipped.

### Step 5 — Run All Groups (The Auto Loop)

For each group A through F:

1. Read stories for the group from `features.json`
2. Read design artifacts (component-map, folder-structure, api-contracts)
3. **Implement all stories in the group** — write actual production code
4. **After each group, actually run the tests and gates:**

#### Gate 1 — Unit Tests (ACTUALLY RUN THEM)
```bash
cd backend && python3 -m pytest tests/ -x -q --tb=short 2>&1
```
If tests fail: **read the failure output**, fix the code (not the test unless the test is wrong), re-run. Up to 3 self-heal attempts per failure.

```bash
cd frontend && npx vitest run --reporter=verbose 2>&1
```
Same self-heal loop for frontend tests.

**DO NOT mark Gate 1 as passed based on test count alone. Tests must actually execute and pass.**

#### Gate 2 — Lint + Types
```bash
cd backend && ruff check app/ && mypy app/ --ignore-missing-imports
cd frontend && npx tsc --noEmit
```
If lint/type errors: auto-fix (`ruff check --fix`), or fix manually, re-run.

#### Gate 3 — Coverage
```bash
cd backend && python3 -m pytest tests/ --cov=app --cov-report=term-missing -q
```
Read coverage percentage. If below baseline (from `.claude/state/coverage-baseline.txt`): add tests for uncovered lines. Update baseline on improvement.

#### Gate 4 — Architecture (static analysis — no runtime needed)
Grep for upward layer imports. Already implemented in previous steps.

#### Gate 5 — Evaluator: Live App + Browser Verification (MANDATORY)

**This gate starts the app, tests the API, opens a browser, interacts with the UI, and captures screenshots.** It is not optional — code that hasn't been seen running in a browser is not verified.

##### Step 5a — Start the backend
```bash
cd {project-root}/backend
source .venv/bin/activate

# Initialize database (SQLite: just run migrations. PostgreSQL: docker compose up -d db first)
alembic upgrade head

# Start backend (background)
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/dogfood-backend.log 2>&1 &
sleep 3

# Health check
curl -sf http://localhost:8000/api/v1/health || { echo "FAIL: backend not healthy"; cat /tmp/dogfood-backend.log; }
```

If health check fails: read the log, self-heal (fix import errors, missing deps, config issues), retry. Up to 3 attempts.

**IMPORTANT:** Use `--host 0.0.0.0` so both IPv4 and IPv6 `localhost` connections work.

##### Step 5b — Start the frontend
```bash
cd {project-root}/frontend
npm run dev -- --port 5173 &
sleep 5
```

##### Step 5c — API Smoke Tests
Test every API endpoint listed in `specs/design/api-contracts.md`:
```bash
# Health
curl -sf http://localhost:8000/api/v1/health

# Core CRUD (adapt to project — these are examples)
curl -sf -X POST http://localhost:8000/api/v1/{resource} -H "Content-Type: application/json" -d '{...}'
curl -sf http://localhost:8000/api/v1/{resource}
```

Log each response. Any 5xx is a FAIL → self-heal.

##### Step 5d — Browser Verification via Playwright MCP

**Use the Playwright MCP tools to interact with the UI like a real user.** All screenshots are saved to `{project-root}/dogfood-screenshots/`.

```bash
mkdir -p {project-root}/dogfood-screenshots
```

For each key page in the app:

1. **Navigate:** `browser_navigate` to the page URL
2. **Snapshot:** `browser_snapshot` to capture the DOM structure — verify expected elements are present
3. **Interact:** `browser_fill_form` to fill inputs, `browser_click` to click buttons
4. **Verify result:** `browser_snapshot` again — verify the action produced the expected change
5. **Screenshot:** `browser_take_screenshot` — save to `dogfood-screenshots/{page}-{action}.png`
6. **Console check:** `browser_console_messages` with level "error" — any errors are FAIL

**Minimum interactions per project type:**

| Project Type | Required Browser Tests |
|-------------|----------------------|
| CRUD | Navigate to main page, create an item, verify it appears in list, screenshot |
| ML | Above + trigger inference, verify result displays, screenshot |
| Agentic | Above + trigger agent action, verify agent output appears, verify HITL queue if present, screenshot |

**Screenshot naming convention:**
```
dogfood-screenshots/
  01-homepage-loaded.png
  02-form-filled.png
  03-item-created.png
  04-list-updated.png
  05-agent-response.png
  06-history-page.png
```

**Every screenshot is evidence.** The dogfood report references these screenshots as proof that the UI works.

##### Step 5e — Console Error Check (Layer 2.5)

After all browser interactions:
```
browser_console_messages with level "error"
```

If any console errors (excluding favicon 404): **FAIL**. Fix the frontend code, reload, retry.

##### Step 5f — Stop servers (after all groups complete)
```bash
pkill -f "uvicorn app.main" 2>/dev/null
pkill -f "vite.*5173" 2>/dev/null
```

#### Gate 6-8 — Reviews (static analysis)
Code reviewer, UI standards, security — these are agent-based reviews run by spawning reviewer agents.

#### Gate 9 — Mutation Testing
```bash
cd backend && mutmut run --paths-to-mutate=app/ --tests-dir=tests/ --runner="python3 -m pytest -x -q" 2>&1
```
If mutmut not installed: `pip install mutmut`, retry. If mutation score drops: add tests.

#### Gate 10 — Compliance
```bash
bash scripts/validate-compliance.sh
```

#### Gate 11 — Spec Gaming Detection (static)
Already implemented.

#### Gate 12 — E2E Playwright Test Files (MANDATORY)

**The plan says write E2E tests in `e2e/`. Follow the plan.**

After all groups are implemented, generate Playwright E2E test files:

```
e2e/
  playwright.config.ts     # Config with webServer for backend + frontend
  {feature-1}.spec.ts      # One spec per feature group
  {feature-2}.spec.ts
  error-handling.spec.ts   # Connection errors, API failures, empty states
```

Each spec must:
- Navigate to the page
- Interact with all UI elements for that feature
- Assert expected outcomes
- Capture console errors (fail if any non-favicon errors)
- Test error states (backend down, invalid input)

Run them:
```bash
cd e2e && npx playwright test --reporter=list
```

If tests fail: self-heal the application code (not the test unless the test is wrong). Then re-run.

**This is not optional.** If the plan says "E2E tests", write E2E tests. Never skip a step in the plan because a different verification method was used. The plan is the contract.

#### Gate 13 — Smoke Launch (MANDATORY)

**Actually launch the application and verify it doesn't crash.** This catches the #1 false-green pattern: tests pass against test fixtures but the app crashes with real data.

For web apps:
```bash
# Start backend + frontend, hit health endpoint, load homepage in Playwright
curl -sf http://localhost:8000/health
```

For CLI apps:
```bash
# Import and run the main entry point headlessly (no interactive terminal needed)
python3 -c "
from {module} import main_class, data_loader
data = data_loader.from_file()  # Load REAL production data, not test fixtures
app = main_class(data)
for _ in range(100):  # Run N ticks / iterations
    app.update()
print('Smoke launch: OK')
"
```

**Key rule: E2E tests MUST exercise real production data, not just small test fixtures.** If the app loads a maze from a file, the E2E test must load that same file. If the app reads a config, the test must use the real config. Synthetic test data catches logic bugs; real data catches integration bugs (wrong dimensions, missing fields, encoding issues, path mismatches).

This gate exists because of a dogfooding finding: 68 unit+E2E tests passed but the game crashed on launch because tests used small 5x5 mazes while the real 28x31 maze had rows of unequal length. The IndexError only appeared in the render path with real data.

5. **On gate failure:**
   - Read the actual error output
   - Classify as forge or project issue
   - If forge: fix forge source, re-copy to `.claude/`, log issue, retry gate
   - If project: self-heal (modify generated code based on error, retry up to 3x)
   - After 3 project failures on same issue: log learned rule to `.claude/state/learned-rules.md`, mark group BLOCKED, continue to next group
6. **On gate pass:** Update features.json, update coverage-baseline.txt, commit, move to next group

### Self-Healing Protocol

When a test fails, the self-heal loop is:

```
1. Read the FULL pytest/vitest output (not just "3 tests failed")
2. Identify the failing test and the assertion that broke
3. Read the source file that the test exercises
4. Determine: is the test wrong or is the code wrong?
   - If test imports a function that doesn't exist → code is wrong (missing implementation)
   - If test asserts X but code returns Y → code is wrong (logic bug)
   - If test uses wrong import path → test is wrong (stale reference)
5. Fix the code (or test if test is wrong)
6. Re-run ONLY the failing test: `pytest tests/test_foo.py::test_bar -x`
7. If it passes: re-run full suite to check for regressions
8. If it fails again: different fix, retry (up to 3 attempts)
9. After 3 failures: log to learned-rules.md, mark BLOCKED
```

**Key principle: read the error message. Don't guess. Don't regenerate the whole file. Make a targeted fix based on what the error says.**

### Step 6 — Final Validation

After all groups complete (or are blocked):

```bash
bash scripts/validate-scaffold.sh     # Forge structure
bash scripts/validate-evals.sh        # Code reviewer regression
bash scripts/validate-compliance.sh   # ML/agentic compliance
```

### Step 7 — Produce Dogfooding Report

Write `test-projects/{project-name}/dogfood-report.md`:

```markdown
# Dogfooding Report

## Project: {name}
Type: {type} | Mode: {mode} | Date: {ISO 8601}

## Pipeline Results
| Phase | Status | Output | Issues Found |
|-------|--------|--------|-------------|
| 1. BRD | PASS/FAIL | {line count, feature count} | {forge issues} |
| ... | | | |

## Gate Results (per group)
| Group | Stories | Gate 1 | ... | Gate 11 | Status |
|-------|---------|--------|-----|---------|--------|

## Forge Issues Found and Fixed
| # | Issue | Category | Root Cause | Fix |
|---|-------|----------|------------|-----|

## Project Issues (self-healed)
| # | Issue | Gate | Self-Heal Attempts | Resolution |

## Compliance Summary
| Check | Result |

## Browser Verification (Gate 5)

### API Smoke Tests
| Endpoint | Method | Status | Response |
|----------|--------|--------|----------|
| /health | GET | {200/500} | {summary} |
| /{resource} | POST | {201/500} | {summary} |
| ... | | | |

### Screenshots
All screenshots saved to `dogfood-screenshots/`.

| # | Screenshot | What It Shows | Pass/Fail |
|---|-----------|---------------|-----------|
| 1 | [01-homepage-loaded.png](dogfood-screenshots/01-homepage-loaded.png) | App loads, main UI visible | {PASS/FAIL} |
| 2 | [02-form-filled.png](dogfood-screenshots/02-form-filled.png) | User input accepted | {PASS/FAIL} |
| 3 | [03-action-result.png](dogfood-screenshots/03-action-result.png) | Action produces expected output | {PASS/FAIL} |
| ... | | | |

### Console Errors
- Total errors: {N}
- Errors (excluding favicon): {list or "none"}

## Metrics
- Total files generated: {N}
- Total tests: {N}
- Coverage: {N}%
- Forge issues found: {N}
- Project self-heal cycles: {N}
- Groups completed: {N}/{total}
- Groups blocked: {N}
- Screenshots captured: {N}
- Console errors: {N}
```

### Step 8 — Commit Forge Fixes

If any forge issues were found and fixed during the run:

```bash
cd {forge-root}
git add {fixed-files}
git commit -m "fix: {summary} (found during /dogfood)"
git push
```

## Mandatory Dogfood Scenarios

The forge must be dogfooded with at least two project types to verify both verification pipelines:

### 1. Web App (proves Playwright MCP + Chrome extension pipeline)
```
/dogfood "Build a task manager" --type crud --mode lean
```
Verifies:
- API checks via curl against running backend
- Browser verification via Playwright MCP or Chrome extension
- Screenshot capture saved to disk
- Console error detection during UI interaction
- Network request monitoring for 4xx/5xx
- Full evaluator report with Layer 1 + 2 + 2.5 results

**This is the only way to prove Gate 5 actually works.** A dogfood run that skips browser verification (because the project has no UI) does not test the most critical verification path.

### 2. CLI / Non-Web App (proves PTY E2E + smoke launch pipeline)
```
/dogfood "Build a terminal game" --type crud --mode lean
```
Verifies:
- PTY-based E2E tests (launch in terminal, send keystrokes, verify output)
- Smoke launch with real production data (Gate 12)
- Non-web evaluator path works

### Release Gating

Before any forge release, BOTH scenarios must have passed in the most recent dogfood run. A release with only CLI dogfooding or only web dogfooding is incomplete — it leaves an entire verification pipeline unproven.

## Gotchas

- **Don't stop to ask the human.** The whole point of dogfooding is autonomous execution. If something is ambiguous, make a decision, log it, and continue.
- **Fix the forge, not just the test project.** If a hook crashes, don't work around it — fix the hook.
- **Re-scaffold after forge fixes.** The test project has copies of forge files in `.claude/`. After fixing the forge source, copy the fix into the test project too.
- **Don't skip groups.** Even if a group fails, attempt all groups to find as many forge issues as possible.
- **Log everything.** The dogfood report is the primary output — it's the forge's test results.
- **Classify correctly.** A forge issue vs project issue distinction is critical. Forge issues get committed to the forge repo. Project issues are just self-healing data.
- **Browser verification is not optional for web apps.** If the dogfood project has a UI and browser verification was skipped (no MCP available, Docker not running), the dogfood run is INCOMPLETE. Log it prominently in the report and fix the verification pipeline before releasing.
