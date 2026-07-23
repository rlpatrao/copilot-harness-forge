---
name: report-findings
description: Review and submit anonymized harness findings as GitHub issues to the forge repo. Opt-in, user-confirmed, no secrets or PII.
argument-hint: "[--enable | --disable | --dry-run]"
---

# /report-findings

Submit anonymized harness findings from your project back to the forge repo as GitHub issues. This is **opt-in only** and always requires user confirmation before anything leaves the machine.

## What Gets Collected vs Excluded

### Collected (anonymized)

| Data | Example |
|------|---------|
| Gate name + pass/fail | `evaluator: FAIL` |
| Error category | `console-error`, `type-error` |
| Pattern (truncated 200 chars) | `Missing CSRF token on /api/...` |
| Iterations to fix | `3` |
| Stack type | `nextjs-postgres` |
| Forge version | `2.0.0` |
| Hook violation type | `secret-detected`, `file-too-long` |
| Learned rule text | `Always add CORS headers for...` |

### Excluded (never leaves machine)

| Data | Reason |
|------|--------|
| Source code | Never collected |
| File paths | Stripped during sanitization |
| API keys, tokens | Regex-stripped (sk-*, ghp_*, base64) |
| Emails, IPs, names | PII scan patterns from pii-scan.js |
| Repo name, org name | Not included in findings schema |
| Environment variables | Never collected |
| .env contents | Never collected |

## Steps

### Step 1 — Check consent

Read `project-manifest.json` and check `findings_reporting.enabled`.

- If the user passed `--enable`: set `findings_reporting.enabled: true` in the manifest and confirm. Exit.
- If the user passed `--disable`: set `findings_reporting.enabled: false` in the manifest and confirm. Exit.
- If `findings_reporting.enabled` is not `true`, print:

  > Findings reporting is not enabled. Run `/report-findings --enable` to opt in.

  Exit.

### Step 2 — Read findings log

Read `.claude/state/harness-findings-log.json`. If the file does not exist or is empty, print:

> No findings recorded yet. Findings are collected automatically during gate runs when reporting is enabled.

Exit.

### Step 3 — Filter unreported entries

Filter the array to entries where `reported: false`. If none remain, print:

> All findings have already been reported.

Exit.

### Step 4 — Sanitize

Apply the same sanitization patterns used by `detect-secrets.js` and `pii-scan.js`:

1. Strip anything matching `/sk-[a-zA-Z0-9]{20,}/g` (OpenAI keys)
2. Strip anything matching `/ghp_[a-zA-Z0-9]{36,}/g` (GitHub PATs)
3. Strip anything matching `/[A-Za-z0-9+\/]{40,}={0,2}/g` (long base64 blobs)
4. Strip emails matching `/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g`
5. Strip IPs matching `/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g`
6. Strip file paths matching `/\/[^\s:]+\.(ts|js|py|go|rs|java|json|yaml|yml|toml)/g`
7. Truncate any remaining `pattern` field to 200 characters

If sanitization removes all meaningful content from an entry, drop it.

### Step 5 — Generate report

Write `harness-findings.md` in the project root using the template from `.claude/templates/harness-findings.template.md`.

Populate the following sections:

- **Header:** forge version, stack type, mode (full/lean/solo/turbo), date
- **Gate Outcomes table:** one row per gate with pass/fail/skip, iteration count
- **Recurring Patterns:** group entries that appear 2+ times, show count and truncated pattern
- **Hook Violations table:** category, count, example pattern
- **Learned Rules Created:** list any learned rules triggered during the run
- **Suggestions:** auto-generated improvement suggestions based on failure clusters

### Step 6 — Show to user

Display the full content of `harness-findings.md` to the user.

- If `--dry-run` was passed: print "Dry run complete. No issue created." and exit.
- Otherwise, ask: **"Confirm, edit, or cancel?"**
  - **Confirm:** proceed to Step 7
  - **Edit:** let the user modify the content, then re-display and re-ask
  - **Cancel:** delete the staging file, exit

### Step 7 — Submit

Run:

```bash
gh issue create \
  --repo {target_repo} \
  --title "Harness Findings: {stack_type} {date}" \
  --body-file harness-findings.md \
  --label "harness-finding"
```

Where `{target_repo}` is read from `findings_reporting.target_repo` in the manifest (defaults to the forge repo).

If `gh` is not installed or not authenticated, print:

> GitHub CLI is not available or not authenticated. You can install it at https://cli.github.com/ and run `gh auth login`.
> The report has been saved to `harness-findings.md` — you can submit it manually.

Do not fail the skill.

### Step 8 — Cleanup

1. Update `findings_reporting.last_reported` in the manifest to the current ISO timestamp
2. Mark all submitted entries in `harness-findings-log.json` as `reported: true`
3. Delete `harness-findings.md` (the staging file)

## Gotchas

- This skill **never runs automatically**. The user must invoke it explicitly.
- The `--dry-run` flag is useful for reviewing what would be submitted without creating an issue.
- If the findings log grows very large (500+ entries), only the most recent 200 unreported entries are included. Older entries are marked as `reported: true` with a note.
- The `harness-finding` label must exist on the target repo. If it does not, `gh` will prompt to create it — accept the prompt.
- Entries with identical `category + pattern` are deduplicated in the report (counted, not repeated).
