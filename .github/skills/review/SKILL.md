---
name: review
description: Run code review and security review concurrently. Checks quality principles, architecture compliance, test coverage, story traceability, and OWASP vulnerabilities.
---

# Review Skill

Spawns `code-reviewer` and `security-reviewer` agents concurrently for comprehensive quality and security verification.

## Usage

```
/review
/review path/to/file.py     # Review specific file
```

## Agents

| Agent | What It Checks | Output |
|-------|---------------|--------|
| `code-reviewer` | Quality principles (6), architecture compliance, test coverage, story traceability, learned rules violations | `specs/reviews/code-review.md` |
| `security-reviewer` | OWASP top 10, injection, auth bypass, hardcoded secrets, SSRF, path traversal, CSRF | `specs/reviews/security-review.md` |

Both agents run in parallel. Results are merged into a combined report.

## Gate Behavior

- **BLOCK** if any critical finding (architecture violation, security vulnerability, missing tests for a story)
- **WARN** for advisory findings (function length, missing docstrings)

## Eval Validation

After review, if the code-reviewer's rules or learned-rules have been modified since the last eval run, automatically run the eval samples (`.claude/evals/`) to verify the reviewer still catches known violations. Report any regressions.
