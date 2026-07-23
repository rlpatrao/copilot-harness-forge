---
name: model-card
description: Generate a model card by extracting model metadata, metrics, dataset info, and bias analysis from training and evaluation code.
---

# Model Card Skill

Generate a comprehensive model card by introspecting the project's ML training, evaluation, and data loading code.

## Usage

```
/model-card
```

Also invoked post-build for ML projects.

---

## Prerequisites

- ML training code exists in the project.
- Evaluation code with metrics exists.
- `project-manifest.json` exists with `ml_models` section (if applicable).

---

## Step 1 — Read Training Code

Extract from training scripts:
- Model type and architecture (e.g., XGBoost, BERT fine-tune, CNN)
- Framework (PyTorch, TensorFlow, scikit-learn, Hugging Face)
- Hyperparameters (learning rate, epochs, batch size, optimizer)
- Training infrastructure (GPU type, training duration)
- Loss function and optimization objective

---

## Step 2 — Read Evaluation Code

Extract from evaluation scripts:
- Performance metrics (accuracy, F1, AUC-ROC, RMSE, etc.)
- Evaluation dataset description
- Cross-validation strategy
- Confidence intervals or variance across runs

---

## Step 3 — Read Data Loading Code

Extract from data pipelines:
- Dataset name and source
- Dataset size (rows, features)
- Feature descriptions and types
- Train/val/test split ratios
- Preprocessing and augmentation steps
- Known data quality issues or exclusions

---

## Step 4 — Read Fairness Tests

Extract from fairness/bias evaluation:
- Protected attributes evaluated (race, gender, age, etc.)
- Subgroup performance breakdowns
- Disparate impact ratios
- Fairness metric results (demographic parity, equalized odds)
- Identified biases and mitigations

---

## Step 5 — Fill Model Card Template

Read `.claude/templates/model-card.template.md` and fill all sections:
- Model details (type, version, framework, date)
- Intended use and out-of-scope uses
- Training data summary
- Evaluation metrics with subgroup breakdowns
- Ethical considerations and limitations
- Recommendations for deployment

---

## Step 6 — Present for Human Review

Display the completed model card for human review before writing. Highlight:
- Any sections with incomplete data (could not be extracted)
- Subgroup performance gaps above threshold
- Missing fairness evaluations

---

## Outputs

| File | Description |
|------|-------------|
| `docs/model-card.md` | Completed model card |

---

## Template

- `.claude/templates/model-card.template.md`

---

## Gate Behavior

- **BLOCK** if any template section still contains `{{PLACEHOLDER}}` markers
- **BLOCK** if performance metrics do not include subgroup breakdowns
- **WARN** if fairness tests were not found in the codebase
- **WARN** if training data source is not documented

---

## Gotchas

- **No placeholders in output.** Every `{{PLACEHOLDER}}` must be filled or explicitly marked as "Not available — [reason]".
- **Subgroup breakdowns are required.** Aggregate metrics alone are insufficient. If fairness tests don't exist, flag this prominently.
- **Model cards are living documents.** Include a "Last updated" date and version number.
- **Don't fabricate metrics.** If a metric cannot be extracted from code, state that it was not found rather than guessing.
