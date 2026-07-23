---
name: comply-patterns
description: Reference patterns for AI compliance — OWASP Agentic Top 10, bias detection, fairness testing, PII scanning, GDPR/HIPAA/SOC2 checklists, model cards, and content filtering.
---

# Compliance Patterns

Reference material for the compliance-reviewer agent and any developer building compliant AI systems.

## OWASP Agentic Top 10 (ASI01-ASI10)

| ID | Name | Description | Mitigation |
|----|------|-------------|------------|
| **ASI01** | **Excessive Agency** | Agent takes actions beyond intended scope | Enforce least-privilege tool access; require confirmation for destructive actions; implement allowlists for permitted operations |
| **ASI02** | **Prompt Injection** | Malicious input manipulates agent behavior | Sanitize inputs; separate data from instructions; use system prompts to resist injection; validate outputs before execution |
| **ASI03** | **Insecure Output Handling** | Agent output executed without validation | Treat all agent output as untrusted; sanitize before rendering/executing; validate against expected schema |
| **ASI04** | **Tool Misuse** | Agent uses tools in unintended ways | Validate tool parameters; enforce parameter types and ranges; log all tool calls; rate limit tool usage |
| **ASI05** | **Insufficient Access Control** | Agent accesses resources beyond authorization | Implement per-agent RBAC; enforce resource scoping; validate access at tool level, not just agent level |
| **ASI06** | **Improper Error Handling** | Errors expose internals or cause unsafe states | Never expose raw errors to users; implement fallback behaviors; log errors securely; maintain safe state on failure |
| **ASI07** | **Data Leakage** | Agent exposes sensitive data across contexts | Enforce context isolation between users/sessions; filter PII from logs and responses; implement data classification |
| **ASI08** | **Denial of Wallet** | Attacker triggers expensive agent operations | Set cost limits per user/session; monitor token usage; implement circuit breakers on spending; rate limit requests |
| **ASI09** | **Supply Chain Compromise** | Malicious tools, plugins, or dependencies | Vet all tools and plugins; pin versions; audit tool behavior; sandbox untrusted tools |
| **ASI10** | **Insufficient Monitoring** | Lack of observability into agent behavior | Log all decisions, tool calls, and outputs; implement anomaly detection; set up alerts for unusual patterns |

## Bias Detection Methods

### Statistical Parity (Demographic Parity)

The probability of a positive outcome should be the same across groups.

```
P(Y=1 | group=A) = P(Y=1 | group=B)
```

**Acceptable threshold:** Ratio within 0.8-1.25 (the 80% rule / four-fifths rule).

### Equalized Odds

True positive rate and false positive rate should be equal across groups.

```
P(Y_hat=1 | Y=1, group=A) = P(Y_hat=1 | Y=1, group=B)  # equal TPR
P(Y_hat=1 | Y=0, group=A) = P(Y_hat=1 | Y=0, group=B)  # equal FPR
```

### Disparate Impact Ratio

```
DIR = P(positive | unprivileged) / P(positive | privileged)
```

**Legal threshold:** DIR >= 0.8 (from US EEOC four-fifths rule).

### Calibration

Among those given a score of X%, roughly X% should have a positive outcome, regardless of group.

## Fairness Testing Code Patterns

### Python with fairlearn

```python
from fairlearn.metrics import MetricFrame, demographic_parity_difference, equalized_odds_difference
from sklearn.metrics import accuracy_score, precision_score, recall_score

metric_frame = MetricFrame(
    metrics={
        "accuracy": accuracy_score,
        "precision": precision_score,
        "recall": recall_score,
    },
    y_true=y_test,
    y_pred=y_pred,
    sensitive_features=sensitive_features,
)

# Check demographic parity
dp_diff = demographic_parity_difference(y_test, y_pred, sensitive_features=sensitive_features)
assert dp_diff < 0.1, f"Demographic parity difference too high: {dp_diff}"

# Check equalized odds
eo_diff = equalized_odds_difference(y_test, y_pred, sensitive_features=sensitive_features)
assert eo_diff < 0.1, f"Equalized odds difference too high: {eo_diff}"

# Print per-group metrics
print(metric_frame.by_group)
```

### Python with AIF360

```python
from aif360.datasets import BinaryLabelDataset
from aif360.metrics import BinaryLabelDatasetMetric, ClassificationMetric

dataset = BinaryLabelDataset(
    df=df,
    label_names=['outcome'],
    protected_attribute_names=['gender', 'race'],
)

metric = BinaryLabelDatasetMetric(dataset, unprivileged_groups=[{'gender': 0}], privileged_groups=[{'gender': 1}])
print(f"Disparate impact: {metric.disparate_impact()}")
print(f"Statistical parity difference: {metric.statistical_parity_difference()}")
```

### Manual Disparate Impact Calculation

```python
def disparate_impact_ratio(y_pred, sensitive_feature, unprivileged_value, privileged_value):
    unprivileged_mask = sensitive_feature == unprivileged_value
    privileged_mask = sensitive_feature == privileged_value
    rate_unprivileged = y_pred[unprivileged_mask].mean()
    rate_privileged = y_pred[privileged_mask].mean()
    return rate_unprivileged / rate_privileged if rate_privileged > 0 else float('inf')

dir_value = disparate_impact_ratio(y_pred, df['gender'], 'female', 'male')
assert dir_value >= 0.8, f"Disparate impact ratio {dir_value} below 0.8 threshold"
```

## PII Scanning Patterns

### Regex Patterns

```python
PII_PATTERNS = {
    "ssn": r"\b\d{3}-\d{2}-\d{4}\b",
    "credit_card": r"\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b",
    "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
    "phone_us": r"\b(?:\+1[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}\b",
    "ip_address": r"\b(?:\d{1,3}\.){3}\d{1,3}\b",
    "date_of_birth": r"\b(?:0[1-9]|1[0-2])/(?:0[1-9]|[12]\d|3[01])/(?:19|20)\d{2}\b",
    "passport": r"\b[A-Z]{1,2}\d{6,9}\b",
}

def scan_for_pii(text: str) -> list[dict]:
    findings = []
    for pii_type, pattern in PII_PATTERNS.items():
        for match in re.finditer(pattern, text):
            findings.append({
                "type": pii_type,
                "match": match.group(),
                "position": match.start(),
            })
    return findings
```

### What to Scan

- Data models and schemas (field names: email, phone, ssn, address, dob)
- API response serializers
- Log statements (log.info, logger.debug, console.log)
- Error messages and stack traces
- Database seed files and fixtures
- Configuration files

## GDPR Compliance Checklist

| # | Requirement | How to Check |
|---|-------------|-------------|
| 1 | **Lawful basis** for processing | Check for consent mechanism or legitimate interest documentation |
| 2 | **Consent** is freely given, specific, informed, unambiguous | Verify consent UI with granular opt-in (not pre-checked boxes) |
| 3 | **Right to access** | Verify data export endpoint exists (e.g., GET /api/user/data) |
| 4 | **Right to deletion** | Verify deletion endpoint and cascade logic (e.g., DELETE /api/user) |
| 5 | **Right to portability** | Verify data export in machine-readable format (JSON, CSV) |
| 6 | **Data processing records** | Check for processing activity documentation |
| 7 | **DPO contact** | Verify Data Protection Officer contact info is accessible |
| 8 | **Breach notification** | Check for incident response procedure (72-hour notification) |
| 9 | **Privacy by design** | Verify data minimization — collect only what is needed |
| 10 | **Cross-border transfers** | Check if data leaves EU/EEA, verify adequacy or SCCs |

## HIPAA Compliance Checklist

| # | Requirement | How to Check |
|---|-------------|-------------|
| 1 | **PHI encryption at rest** | Verify database encryption, file encryption for any PHI storage |
| 2 | **PHI encryption in transit** | Verify TLS for all PHI transmission, no HTTP endpoints |
| 3 | **Access logging** | Verify immutable audit log for all PHI access |
| 4 | **Minimum necessary** | Verify APIs return only required PHI fields, not full records |
| 5 | **BAA references** | Check for Business Associate Agreements with all vendors handling PHI |
| 6 | **Access controls** | Verify role-based access, unique user IDs, automatic logoff |
| 7 | **Backup and recovery** | Verify PHI backup procedures and disaster recovery plan |
| 8 | **Integrity controls** | Verify mechanisms to detect unauthorized PHI alteration |
| 9 | **Transmission security** | Verify integrity controls for PHI in transit |
| 10 | **Device controls** | Verify policies for workstations and devices accessing PHI |

## SOC2 Compliance Checklist

| # | Requirement | How to Check |
|---|-------------|-------------|
| 1 | **Audit trail** | Verify immutable log of all system changes, access, and data modifications |
| 2 | **Access controls** | Verify RBAC, MFA, least privilege, regular access reviews |
| 3 | **Change management** | Verify documented change process, peer review, rollback capability |
| 4 | **Incident response** | Verify documented IR plan, escalation matrix, post-mortem process |
| 5 | **Availability monitoring** | Verify uptime monitoring, alerting, SLAs defined |
| 6 | **Encryption** | Verify encryption at rest and in transit for all sensitive data |
| 7 | **Vulnerability management** | Verify regular scanning, patching cadence, dependency updates |
| 8 | **Vendor management** | Verify third-party risk assessment process |
| 9 | **Data classification** | Verify data is classified and handled according to sensitivity |
| 10 | **Employee security** | Verify security training, background checks, offboarding procedures |

## Model Card Template

Reference the template at `templates/model-card.template.md`. A model card must include:

1. **Model Details** — name, version, type, framework, date
2. **Intended Use** — primary use cases, out-of-scope uses
3. **Training Data** — description, size, source, preprocessing, demographic breakdown
4. **Evaluation Data** — description, relationship to training data
5. **Performance Metrics** — accuracy, precision, recall, F1, AUC — broken down by subgroup
6. **Bias Testing** — fairness metrics measured, disparate impact ratio, subgroup performance gaps
7. **Limitations** — known failure modes, data gaps, deployment constraints
8. **Ethical Considerations** — potential harms, mitigations implemented
9. **Recommendations** — dos and don'ts for users of this model

## Data Retention Policy Template

```markdown
# Data Retention Policy — {Project Name}

## Categories

| Data Category | Retention Period | Deletion Method | Legal Basis |
|--------------|-----------------|-----------------|-------------|
| User account data | Duration of account + 30 days | Hard delete | Contract |
| Usage logs | 90 days | Automated purge | Legitimate interest |
| ML training data | Duration of model lifecycle | Secure wipe | Consent |
| Payment records | 7 years | Archive then delete | Legal obligation |
| Support tickets | 2 years | Soft delete then purge | Legitimate interest |

## Automated Enforcement

- Daily cron job checks retention periods and queues deletions
- Deletion jobs run in off-peak hours with audit logging
- Failed deletions trigger alerts to the data team

## User-Initiated Deletion

- DELETE /api/user triggers full account deletion
- Cascade: user data → usage logs → ML features → payment anonymization
- Confirmation email sent; 30-day grace period before irreversible deletion
```

## Content Filtering Patterns

### Toxicity Detection

```python
# Option 1: Perspective API
def check_toxicity(text: str) -> float:
    response = perspective_client.analyze(text, attributes=["TOXICITY"])
    return response["attributeScores"]["TOXICITY"]["summaryScore"]["value"]

# Option 2: Local model
from transformers import pipeline
toxicity_classifier = pipeline("text-classification", model="unitary/toxic-bert")

def check_toxicity_local(text: str) -> float:
    result = toxicity_classifier(text)[0]
    return result["score"] if result["label"] == "toxic" else 1 - result["score"]
```

### PII Redaction in Outputs

```python
import re

def redact_pii(text: str) -> str:
    """Redact PII from model outputs before returning to user."""
    for pii_type, pattern in PII_PATTERNS.items():
        text = re.sub(pattern, f"[REDACTED_{pii_type.upper()}]", text)
    return text

# Apply to all LLM outputs
raw_response = await llm.generate(prompt)
safe_response = redact_pii(raw_response)
```

### Rules

- Filter both inputs (prevent injection of harmful content) and outputs (prevent leaking PII or generating harmful content).
- Log filtered content for review (but redact PII in the logs themselves).
- Set toxicity thresholds per use case: customer-facing chat (strict, <0.3) vs internal tool (moderate, <0.6).
- Never rely solely on the model's built-in refusals — add application-level filtering.
