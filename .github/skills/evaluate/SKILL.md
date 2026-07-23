---
name: evaluate
description: Run the application and verify sprint contract criteria via API tests, Playwright interaction, and schema validation.
argument-hint: "[group-id]"
---

# Evaluate Skill

Verify that the implemented group meets all sprint contract criteria by running live checks against the application: API calls, Playwright browser interaction, and schema validation.

---

## Usage

```
/evaluate C
```

Evaluates group C's sprint contract. The group ID matches a node in `specs/stories/dependency-graph.md` and a file at `sprint-contracts/{group}.json`.

---

## Prerequisites

Before running `/evaluate`, verify ALL of the following. If any check fails, return a structured NOT_RUN result immediately — do NOT silently skip the evaluation.

### Required Checks

1. **Sprint contract exists:** `sprint-contracts/{group}.json` must exist and be valid JSON.
2. **Manifest URLs populated:** `project-manifest.json` must have non-null `api_base_url` and `health_check` fields. If the project has a frontend (`stack.frontend` is non-null), `ui_base_url` must also be non-null.
3. **Bootstrap command exists:** `verification.dev_bootstrap` must be non-null.

### On Missing Prerequisites — NOT_RUN (Fail-Fast)

If any prerequisite is missing, return this structured result and stop:

```json
{
  "verdict": "NOT_RUN",
  "group": "{group}",
  "reason": "Cannot evaluate — missing prerequisites",
  "missing": [
    "sprint-contracts/{group}.json does not exist",
    "evaluation.api_base_url is null in project-manifest.json",
    "verification.dev_bootstrap is null in project-manifest.json"
  ],
  "action_required": "Run /architect to populate manifest fields, then /auto to generate sprint contracts"
}
```

Write this to `specs/reviews/evaluator-report.md` with `VERDICT: NOT_RUN` (not PASS, not FAIL). The `/auto` orchestrator treats NOT_RUN as a blocker — the group cannot progress.

**Do NOT silently skip evaluation when prerequisites are missing.** A skipped evaluation means zero automated verification — stories get marked "done" on code generation alone. This defeats the GAN architecture.

### Runtime Check

- Docker stack (or local processes) should be running. If not, the health check in Step 4 will catch this and produce a FAIL with `failure_layer: "infrastructure"`.

---

## Execution Steps

### Step 1 — Load Evaluation Patterns

Read `.claude/skills/evaluate-patterns/SKILL.md` for project-specific evaluation patterns, custom assertion helpers, and any environment-specific overrides.

### Step 2 — Load Sprint Contract

Read `sprint-contracts/{group}.json`. The contract contains:
- `setup`: list of actions to create test fixtures before running checks (users, seed data, config). Execute these first.
- `api_checks`: list of HTTP endpoint checks.
- `playwright_checks`: list of browser interaction sequences.
- `design_checks`: list of visual and component checks (evaluated in Full mode only).
- `architecture_checks.files_must_exist`: list of file paths that must be present on disk.
- `teardown`: list of actions to clean up test fixtures after all checks complete.
- `features`: list of feature IDs this group satisfies.

### Step 2.5 — Execute Test Fixtures (Setup)

Before running any checks, execute the `setup` array from the sprint contract. Each entry specifies an action to create test data:

```json
{"action": "create_user", "email": "admin@test.local", "role": "admin", "password": "test123"}
{"action": "seed_data", "endpoint": "POST /api/seed", "body": {"scenario": "basic"}}
{"action": "run_migrations"}
{"action": "api_call", "method": "POST", "path": "/api/bots", "body": {"name": "Test Bot"}}
```

Execute each action via the appropriate method (API call, database seed command, etc.). If a setup action fails, record FAIL with `failure_layer: "setup"` and stop — checks against empty data are meaningless.

After all checks complete (regardless of verdict), execute the `teardown` array to clean up test data. Teardown failures are logged as WARNs but do not change the verdict.

### Step 3 — Load Project Manifest

Read `project-manifest.json`. Extract:
- `api_base_url` — base URL for all API checks (e.g., `http://localhost:8000`).
- `ui_base_url` — base URL for Playwright navigation (e.g., `http://localhost:3000`).
- `health_check` — path to the health endpoint (e.g., `/health`).
- `dev_bootstrap` — command to start the full stack (from `verification.dev_bootstrap`).
- `dev_teardown` — command to tear down the stack (from `verification.dev_teardown`).

### Step 3.5 — Autonomous Service Lifecycle

The evaluator manages the app lifecycle autonomously. Do NOT ask the user to "open 3 terminals and start services."

**Startup sequence:**

1. **Check if already running:** `curl -sf {api_base_url}{health_check}`. If healthy, skip to Step 4.
2. **Run migrations** (if applicable): Auto-detect migration tools in the project and run them:
   - Python/Alembic: `cd backend && uv run alembic upgrade head`
   - Node/Prisma: `cd backend && npx prisma migrate deploy`
   - Django: `cd backend && python manage.py migrate`
   Only run if a migration tool is detected in the project.
3. **Bootstrap:** Execute `verification.dev_bootstrap` (e.g., `docker compose -f docker-compose.dev.yml up -d`).
4. **Health-check retry loop:** 5 attempts, exponential backoff (2s, 4s, 8s, 16s, 32s).
5. **On failure:** Record FAIL with `failure_layer: "infrastructure"` and the bootstrap command's stderr output.

**Teardown** (after evaluation completes, whether PASS or FAIL):

1. Execute `verification.dev_teardown` (e.g., `docker compose -f docker-compose.dev.yml down -v`).
2. If teardown fails, log a WARN but do not change the evaluation verdict.

**Lifecycle ownership:** When invoked from `/auto`, the orchestrator passes `--skip-lifecycle` in the agent prompt. If `--skip-lifecycle` is present, skip Steps 3.5 (startup) and teardown entirely — the orchestrator manages the stack via SECTION 7. When invoked standalone via `/evaluate`, manage the full lifecycle (startup, health check, teardown).

### Step 4 — Verify Application Health

Run a health check to confirm the application is live:

```
curl --retry 5 --retry-delay 3 -sf {api_base_url}{health_check}
```

If the health check fails after 5 retries, immediately record a FAIL with `failure_layer: "infrastructure"` and stop. Include the error output and the last 50 lines of service logs (`docker compose logs --tail=50` or process stderr). Do not proceed to API or Playwright checks. A broken stack is not a partial pass.

---

## Layer 1 — API Checks

For each entry in `api_checks`:

1. Execute the request via Bash:
   ```
   curl -s -w '\n%{http_code}' -X {method} {api_base_url}{path}
   ```
   Include `-H` headers and `-d` body as specified in the check entry.

2. Parse the response: the last line is the HTTP status code; everything before it is the response body.

3. Verify status code matches `expect.status`. A mismatch is a FAIL for this check.

4. **Behavioral verification** — a correct status code is necessary but not sufficient. Also check:
   - `expect.body_contains`: Verify the response body contains every listed string. A missing string is a FAIL.
   - `expect.body_not_contains`: Verify the response body does NOT contain error indicators. Common false-positive strings to reject: `"Failed to connect"`, `"error"`, `"No data found"`, `"access denied"`, `"[]"` (when data is expected). A match is a FAIL.
   - `expect.min_items`: For list endpoints, verify the response array has at least N items (proves test fixtures were loaded). An empty array when data should exist is a FAIL, not a PASS.
   - `expect.body_schema`: Validate response against a JSON Schema reference (see schema_ref below).

   **A 200 response with an error message in the body is a FAIL.** Do not treat liveness as correctness.

5. If the check entry contains a `schema_ref` field, validate the response body against the schema:
   ```
   python3 -c "
   import json, jsonschema, sys
   body = json.loads(sys.stdin.read())
   schema = json.load(open('specs/design/api-contracts.schema.json'))
   ref = schema['{schema_ref}']
   jsonschema.validate(body, ref)
   print('schema valid')
   " <<< '{response_body}'
   ```
   A schema validation error is a FAIL for this check.

Record each check as PASS or FAIL with the actual vs. expected values.

### Debugging API Failures

Before reporting an API check as FAILED, read the server logs:
```bash
docker compose logs backend --tail=50 2>&1
```
Include the relevant error from the logs in the failure report. This gives the generator the actual stack trace, not just "got 500 instead of 200."

---

## Performance Checks

For each `performance_checks` entry in the contract:
```bash
# Measure response time
time_ms=$(curl -s -o /dev/null -w "%{time_total}" -X {method} {api_base_url}{endpoint} | awk '{printf "%.0f", $1 * 1000}')
```
If `time_ms > max_response_time_ms`, report as WARN (not BLOCK — performance is advisory unless critical).

---

## Layer 2 — Playwright Checks

For each entry in `playwright_checks`:

1. Use Playwright MCP tools to execute the interaction sequence:
   - `browser_navigate` — navigate to a URL.
   - `browser_click` — click an element (use `getByRole`, `getByText`, or `getByLabel`; never CSS selectors).
   - `browser_fill_form` — fill form fields.
   - `browser_snapshot` — capture the DOM snapshot for assertion.
   - `browser_take_screenshot` — capture visual state for UI standards review.

2. Execute each step in the order specified. Do not reorder or skip steps.

3. Verify each assertion listed in the check entry:
   - Element visible: confirm the element appears in the snapshot.
   - Text matches: confirm the exact or partial text is present.
   - URL: confirm `browser_navigate` landed on the expected path.

4. Use `expect().toBeVisible()` for visibility assertions. Never use `waitForTimeout()` — if an element is not immediately visible, the check fails.

5. Record each check as PASS or FAIL with a description of what was asserted and what was found.

### Layer 2.5 — Browser Health Monitoring (during Playwright checks)

After each Playwright interaction sequence, capture browser health:

1. **Console errors:** Use `browser_console_messages` to read all console output. Any `error`-level messages that are not in the sprint contract's `expected_errors` list are FAIL.

2. **Network failures:** Use `browser_network_requests` to capture all network activity. Any 4xx/5xx responses not in `expected_errors` are FAIL. Slow responses (>3s) are WARN.

3. **JavaScript exceptions:** Use `browser_evaluate` to check `window.__REACT_ERROR_BOUNDARY_CAUGHT__` or similar error boundary flags.

4. **Screenshots:** Use `browser_take_screenshot` at key interaction points for the ui-standards-reviewer to assess conformance.

Write browser health results as structured failures (see evaluator agent for format). These feed directly into the self-healing loop — no separate pipeline.

### Tool Detection and Fallback Chain

At the start of the evaluation pass, detect available browser tools and log the active method.

**Detection sequence:**
1. Attempt `mcp__plugin_playwright_playwright__browser_tabs` — if it returns without error, Playwright MCP is available (Priority 1)
2. Attempt `mcp__claude-in-chrome__tabs_context_mcp` — if it returns, Chrome extension is available (Priority 2)
3. If neither: fall back to Playwright listener injection in E2E test files (Priority 3)

Log in evaluator report header:
```
Browser verification: Playwright MCP ✓ | Chrome Extension ✗ | Listeners (fallback) ✗
Active method: Playwright MCP
```

**Mandatory execution per page (Priority 1 — Playwright MCP):**
```
1. browser_navigate → {ui_base_url}/{page}
2. browser_wait_for → network idle or specific element
3. browser_snapshot → verify expected elements in DOM
4. browser_fill_form / browser_click → execute interaction
5. browser_snapshot → verify action produced expected result
6. browser_take_screenshot → save to specs/reviews/screenshots/{group}-{story}-{step}.png
7. browser_console_messages → check for errors
8. browser_network_requests → check for 4xx/5xx
```

**Mandatory execution (Priority 2 — Chrome extension):**
```
1. mcp__claude-in-chrome__navigate → page URL
2. mcp__claude-in-chrome__read_page → verify content
3. mcp__claude-in-chrome__form_input / find + click → interact
4. mcp__claude-in-chrome__read_page → verify result
5. mcp__claude-in-chrome__computer → screenshot
6. mcp__claude-in-chrome__read_console_messages → check errors
7. mcp__claude-in-chrome__read_network_requests → check failures
```

**Mandatory execution (Priority 3 — Playwright listeners):**
```
1. Generate E2E test files with page.on('console') + page.on('response') listeners
2. Run: npx playwright test --reporter=json --output=specs/reviews/playwright-results/
3. Parse JSON for failures, console errors, network errors
4. Extract screenshots from test artifacts
```

### Browser Verification Is Not Optional

If `ui_base_url` is set in `project-manifest.json`, at least one browser verification method MUST succeed. If all three priorities fail:
- FAIL the gate with `failure_layer: "infrastructure"`
- `failure_reason: "No browser verification method available. Playwright MCP: {error}. Chrome extension: {error}. Listeners: {error}."`
- Do NOT silently skip browser checks and pass the gate

### Screenshot Evidence

Every browser interaction MUST produce a screenshot. Screenshots are saved to:
```
specs/reviews/screenshots/
  {group}-{story}-01-page-loaded.png
  {group}-{story}-02-form-filled.png
  {group}-{story}-03-action-result.png
```

If Priority 3 (listeners) is active and screenshots cannot be captured, log: `WARN: No screenshot evidence — running in headless listener mode`

---

## Layer 3 — Design Checks (Full Mode Only)

Skip this layer entirely in **Lean** or **Solo** mode.

In Full mode, delegate to the `design-critic` agent:
- Pass the list of `design_checks` entries from the sprint contract.
- Pass the `ui_base_url`.
- The design-critic returns PASS/FAIL per check with visual evidence (screenshots or snapshots).

Record the design-critic's verdicts as-is. Do not override them.

---

## Architecture Checks

For each path listed in `architecture_checks.files_must_exist`:

- Verify the file exists on disk at the given path.
- If the file does not exist, record a FAIL with the missing path.

This check does not require Docker to be running.

---

## Update features.json

After all checks complete, update `features.json` for every feature ID listed in the sprint contract's `features` array:

- `passes`: `true` if all checks for that feature passed, `false` otherwise.
- `last_evaluated`: current timestamp in ISO 8601 format.
- `failure_reason`: `null` if passing; otherwise a human-readable description of the first failure (e.g., `"GET /users/1 returned 404, expected 200"`).
- `failure_layer`: `null` if passing; otherwise one of `"api"`, `"playwright"`, `"design"`, `"unit_test"`, `"infrastructure"`, `"setup"`, `"smoke_launch"`.

Do not remove existing fields from `features.json`. Merge the updates into the existing structure.

---

## Write Evaluator Report

Write the full evaluation report to `specs/reviews/evaluator-report.md`:

```markdown
# Evaluator Report — Group {group}

Date: {ISO 8601 timestamp}
VERDICT: PASS | FAIL

## API Checks

- [PASS] POST /users → 201 ✓
- [FAIL] GET /users/1 → expected 200, got 404
- [PASS] DELETE /users/1 → 204 ✓

## Playwright Checks

- [PASS] Upload page renders ✓
- [FAIL] Submit button not clickable
- [PASS] Success message visible after form submit ✓

## Design Checks

- [PASS] Button uses primary color token ✓
- [SKIP] Design checks skipped (Lean mode)

## Architecture Checks

- [PASS] All expected files exist ✓
- [FAIL] Missing: src/repository/user-repository.ts

## Features Updated

- F001: PASS
- F002: FAIL (api: GET /users/1 expected 200, got 404)
- F003: PASS
```

The overall VERDICT is PASS only if every check across all layers passes. A single FAIL in any layer produces a FAIL verdict.

---

## Mode Behavior

| Mode  | Layer 1 (API) | Layer 2 (Playwright) | Layer 3 (Design) |
|-------|--------------|---------------------|-----------------|
| Full  | Run          | Run                 | Run             |
| Lean  | Run          | Run                 | Skip            |
| Solo  | No-op — print "Solo mode: skipping evaluator" and exit |

Determine the current mode from `project-manifest.json` field `mode`. Default to Full if the field is absent.

## Verdict States

The evaluator produces one of three verdicts:

| Verdict | Meaning | When |
|---------|---------|------|
| **PASS** | All checks across all layers succeeded | Every check passed with behavioral verification |
| **FAIL** | One or more checks failed | Status mismatch, body assertion failed, infrastructure down, setup failed |
| **NOT_RUN** | Evaluation could not execute | Missing sprint contract, null manifest URLs, no bootstrap command |

Write the verdict to `specs/reviews/evaluator-report.md` using the exact format: `VERDICT: PASS`, `VERDICT: FAIL`, or `VERDICT: NOT_RUN`. The sprint-contract-gate hook and `/auto` orchestrator parse this string.

---

## Gotchas

- **Never skip a check:** Every entry in the sprint contract must be evaluated. Skipping a check to make the verdict green is not acceptable.
- **Never rationalize failures:** If the API returns 404 and the contract expects 200, that is a FAIL — not a "known issue" or "works on my machine." Record it as a FAIL.
- **200 is not PASS:** A 200 status code with an error in the body (`"Failed to connect"`, `"error"`, empty array when data expected) is a FAIL. Verify response content, not just status codes.
- **Empty data is not PASS:** If test fixtures were defined in `setup` and an endpoint returns no data, the fixtures failed or the feature is broken. Either way, FAIL.
- **Use getByRole, not CSS:** Playwright checks must use semantic locators (`getByRole`, `getByText`, `getByLabel`). CSS selectors break with minor UI changes and are not permitted.
- **Use expect().toBeVisible(), not waitForTimeout():** Arbitrary timeouts hide real failures. If an element does not appear immediately, the check fails.
- **Infrastructure down — that's a FAIL:** If the stack is unhealthy, record `failure_layer: "infrastructure"` and stop. Do not attempt workarounds or partial evaluations.
- **Do not modify sprint contracts:** The contract is a read-only input. If the contract appears wrong, report it; do not edit it to make checks pass.
- **Run setup before checks, teardown after:** Always execute the contract's `setup` array before any checks and `teardown` after. Without fixtures, you're verifying empty states.
