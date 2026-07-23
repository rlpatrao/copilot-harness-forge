---
name: comply
description: Run compliance review — PII handling, audit trails, data retention, and ML fairness checks with model card generation.
---

# Comply Skill

Run a comprehensive compliance review covering data privacy, audit requirements, and ML fairness.

## Usage

```
/comply
```

---

## Prerequisites

- `project-manifest.json` exists with `regulations` and optionally `ml_models` sections.
- Application code exists to review.

---

## Step 1 — Read Configuration

Read `project-manifest.json`. Extract:
- `regulations` — applicable regulations (GDPR, HIPAA, SOC2, etc.)
- `ml_models` — model definitions, if present
- `stack` — to locate source code paths

---

## Step 2 — Spawn Compliance Reviewer

Spawn `compliance-reviewer` agent to perform the review. The agent checks:
- Applicable regulatory requirements from manifest
- Code patterns against compliance rules
- Data flow for PII exposure

---

## Step 3 — ML Fairness Checks (if ML)

If `ml_models` is present in the manifest:
- Check fairness metrics across protected attributes (race, gender, age)
- Verify training data balance across subgroups
- Check subgroup performance parity (accuracy, FPR, FNR)
- Flag disparate impact above configured thresholds

---

## Step 4 — PII Handling Review

- Identify all PII fields in data models and API contracts
- Verify encryption at rest and in transit
- Check access controls on PII endpoints
- Verify PII is excluded from logs and traces
- Generate `docs/data-privacy-policy.md` if PII is detected and no policy exists

---

## Step 5 — Audit Trail Review

- Verify mutation endpoints produce audit log entries
- Check audit logs include: who, what, when, from_value, to_value
- Verify audit logs are append-only (no update/delete)

---

## Step 6 — Data Retention Review

- Check for data retention policies in code or config
- Verify soft-delete vs hard-delete aligns with regulations
- Check for automated cleanup of expired data

---

## Step 7 — Generate Model Card (if ML)

If ML models are present and `docs/model-card.md` does not exist:
- Invoke `/model-card` skill, which extracts model metadata, metrics, dataset info, fairness analysis, and fills the template.
- Do NOT duplicate model card generation inline — `/model-card` is the single source of truth for this artifact.

---

## Step 8 — Present Findings

Generate `specs/reviews/compliance-report.md` with:
- BLOCK findings (must fix before deploy)
- WARN findings (should fix, not blocking)
- PASS items (compliant)
- Recommendations

---

## Outputs

| File | Condition |
|------|-----------|
| `specs/reviews/compliance-report.md` | Always |
| `docs/model-card.md` | ML projects, if missing |
| `docs/data-privacy-policy.md` | If PII detected, if missing |

---

## Gate Behavior

- **BLOCK** if any critical compliance finding is unresolved
- **BLOCK** if ML project has no model card
- **BLOCK** if PII handling is undocumented
- **WARN** for advisory findings (missing retention policy, incomplete audit trail)

---

## Gotchas

- **Compliance is not optional for ML projects that make decisions about people.** Don't skip fairness checks just because "the dataset is public."
- **PII scope is broad.** Email, IP address, device fingerprint, and location data all count as PII under GDPR.
- **Audit trails must survive deployments.** Don't store audit logs only in application memory or ephemeral containers.
