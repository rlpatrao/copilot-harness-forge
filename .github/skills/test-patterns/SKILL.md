---
name: test-patterns
description: Test planning, test case design, test data generation, and Playwright E2E automation. Use when creating test plans, writing test cases, generating test data, setting up Playwright, or automating end-to-end tests.
---

# Testing Skill

## Test Strategy Layers

```
Unit Tests (pytest/vitest)     — Fast, isolated, run on every save
Integration Tests (pytest)     — API endpoints + DB, run on commit
E2E Tests (Playwright)         — Full user flows in browser, run before merge
E2E Tests (PTY)                — Full user flows in terminal (CLI apps), run before merge
```

## CLI / Terminal App E2E (PTY-based)

For non-web projects (CLI tools, terminal games, scripts), use PTY-based E2E testing instead of Playwright. Uses only Python stdlib (`pty`, `os`, `subprocess`, `select`, `fcntl`).

**Pattern:**
1. Launch the app in a pseudo-terminal via `pty.openpty()` + `subprocess.Popen`
2. Set terminal size via `fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))`
3. Send keystrokes by writing to the master fd: `os.write(master, b'\n')` for ENTER, `os.write(master, b'\x1b[A')` for arrow keys
4. Read screen output via `select.select([master], [], [], timeout)` + `os.read(master, 4096)`
5. Assert expected text appears in output (menu items, game elements, status messages)
6. Always kill the process in `try/finally` — never leave zombies

**Required test scenarios for CLI apps:**
- App launches and shows initial screen
- User input is accepted and produces visible response
- App exits cleanly (return code 0, terminal state restored)
- At least one full user workflow (start → interact → complete → exit)
- Real production data loaded (not just test fixtures)

**Skip on Windows:** `pytest.mark.skipif(sys.platform == 'win32', reason='PTY not available')`

## Test Case Design

From each acceptance criterion, generate 1-3 test cases:

```
Criterion: "Upload accepts PDF files up to 50MB"
→ TC-001: Upload 1MB PDF — succeeds
→ TC-002: Upload 50MB PDF — succeeds (boundary)
→ TC-003: Upload 51MB PDF — fails with size error
```

For detailed test data patterns, see [references/test-data.md](references/test-data.md).
For Playwright patterns, see [references/playwright.md](references/playwright.md).
For test case templates, see [examples/test-case-template.md](examples/test-case-template.md).

## Output Structure

```
specs/test_artefacts/
├── test-plan.md              # Overall test strategy
├── test-cases.md             # All test cases with expected results
├── test-data/
│   └── fixtures.json         # Shared test data
└── e2e/
    ├── playwright.config.ts
    ├── flows/
    │   └── *.spec.ts
    └── helpers/
        └── test-utils.ts
```

## Gotchas

- **CSS class selectors in Playwright.** Never use them. Use `getByRole()`, `getByLabel()`, `getByText()`, or `getByTestId()` (last resort).
- **Tests depending on other tests' state.** Every test must be independent. If test B fails when test A doesn't run first, the tests are coupled.
- **Random data in tests.** Tests must be deterministic — same input, same output. No `random.choice()` or `Date.now()` in test data.
- **Missing boundary tests.** If a criterion says "up to 50MB," there must be a test at exactly 50MB AND one at 51MB.
- **Playwright timeouts on CI.** Default 30s is often too short. Use `toBeVisible({ timeout: 10000 })` for elements that depend on network requests.
- **Forgetting empty state tests.** Every list/table component needs a test with zero items.
- **Testing implementation details.** Don't assert on internal state or method calls — assert on observable behavior.

## Verification

```bash
uv run pytest -x -q --cov=src --cov-report=term-missing
npm test -- --coverage
npx playwright test
npx playwright show-report
```
