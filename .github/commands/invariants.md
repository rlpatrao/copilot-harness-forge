---
description: Check forge invariants (config/invariants.yaml) and print a PASS/FAIL table.
# generated-from: commands/invariants.md
---

# /invariants

Run the declarative invariant checker and render the result.

Steps:
1. Run `node scripts/check-invariants.js` from the repo root.
2. Render the PASS/FAIL/WARN table verbatim.
3. If exit code is 1, summarize the failing `required` invariants and stop — do not proceed with other work until they are resolved or explicitly waived by the user.
4. `--json` is available for machine-readable output; `--file <path>` checks an alternate invariants file.
