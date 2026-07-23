# Architect — Synthesis Mode (BRD v3.1 §3)

This is a mode of the architect skill. It runs when `specs/design/.imported` exists (written by `scaffold-import` during scaffold Q0 Branch B) or when the human explicitly passes `--from-import` to `/architect`.

## What synthesis mode does

- **Does NOT** run the 11-round stack interrogation
- Reads the imported `specs/design/architecture.md`
- Extracts stack decisions, data model, component boundaries, deployment topology from the imported doc
- Consults `.claude/learnings/stack-decisions/` for prior-project cross-references (informational only — the imported architecture is authoritative)
- Produces the same set of downstream design artifacts that interview mode produces (`architecture.md` derived form, `api-contracts.md`, `data-models.md`, `component-map.md`, `folder-structure.md`, `deployment.md`)
- Fills in `project-manifest.json` stack / evaluation / verification fields from the imported doc
- Presents everything as an architecture-review v1 document for human approval (see [`templates/architecture-review.md`](templates/architecture-review.md))

## Decision tree

```
Step 0 — Mode detection (runs on every /architect invocation):

  IF `--restart` flag passed:
    → interview mode (regardless of sentinels)

  ELSE IF `specs/design/.imported` exists AND `--from-import` flag passed (or scaffold set it):
    → synthesis mode

  ELSE IF `specs/design/.imported` exists AND no explicit flag:
    → prompt human: "Architecture was imported at {timestamp}. Run in synthesis mode (recommended) or restart with interview? [S/r]"
    → synthesis mode on S, interview mode on r

  ELSE:
    → interview mode (existing behavior)
```

## Synthesis steps

### Step 1 — Read imported architecture

```bash
test -f specs/design/architecture.md || { echo "ERROR: expected imported architecture at specs/design/architecture.md"; exit 1; }
test -f specs/design/.imported     || { echo "ERROR: --from-import set but no sentinel"; exit 1; }
test -f specs/brd/app_spec.md      || { echo "ERROR: no BRD at specs/brd/app_spec.md — synthesis needs both"; exit 1; }

cat specs/brd/app_spec.md         # source of requirements
cat specs/design/architecture.md  # source of technical design
cat specs/design/.imported        # imported metadata
```

### Step 2 — Consult learnings (informational)

```bash
ls .claude/learnings/stack-decisions/ 2>/dev/null
ls .claude/learnings/integration-notes/ 2>/dev/null
cat .claude/learnings/failure-patterns/common-failures.md 2>/dev/null
```

If prior projects made similar stack choices with recorded outcomes, cite them in the review doc's rationale. Do NOT use learnings to override the imported architecture.

### Step 3 — Extract structured decisions

From the imported architecture doc, extract into a JSON scratch structure:

```json
{
  "backend": "...",
  "frontend": "...",
  "database": "...",
  "deployment": "...",
  "llm_routing": {"strategy": "...", "primary_reasoning": "...", "primary_codegen": "..."},
  "verification_mode": "...",
  "components": [{"name": "...", "responsibility": "...", "consumes": [...], "produces": [...]}, ...],
  "data_entities": [{"name": "...", "fields": [...], "relationships": [...]}, ...]
}
```

If the imported doc is missing any of these, mark the field as `"UNSPECIFIED"` and list it in the review doc's "Open questions" section (§7 of the template) — do NOT ask the human inline. Batching questions into the review doc is intentional: it's the single-doc review loop, not another interview.

### Step 4 — Generate derived design artifacts

Produce the same artifacts as interview mode, in the same schemas:

- `specs/design/architecture.md` — leave the imported doc in place; do NOT overwrite
- `specs/design/architecture-derived.md` — the architect's structured re-rendering; annotated with `<!-- synthesized from specs/design/architecture.md -->`
- `specs/design/api-contracts.md` + `specs/design/api-contracts.schema.json`
- `specs/design/data-models.md` + `specs/design/data-models.schema.json`
- `specs/design/component-map.md`
- `specs/design/folder-structure.md`
- `specs/design/deployment.md`

### Step 5 — Fill project-manifest.json

Update `project-manifest.json` stack / evaluation / verification fields from the extracted decisions. If a field is `UNSPECIFIED`, leave it `null` in the manifest and flag it in the review doc.

### Step 6 — Generate README.md and Makefile

Same as interview mode Step 3: use `templates/README.project.template.md` and `templates/Makefile.template` with the extracted stack.

### Step 7 — Emit architecture-review v1

Fill [`templates/architecture-review.md`](templates/architecture-review.md) and write to `specs/design/architecture-review-v1.md`. This kicks off the review loop (see main SKILL.md Step 5).

## What NOT to do in synthesis mode

- Do NOT ask the human any of the 11 interview questions
- Do NOT overwrite the imported `specs/design/architecture.md`
- Do NOT invent decisions for fields the imported doc left unspecified — flag them in "Open questions"
- Do NOT persist learnings via `.claude/learnings/stack-decisions/` in this mode (interview mode does that; synthesized decisions are derivative)

## Fallback triggers

If any of these hold, abort synthesis and hand back to the human with a clear message:

- `specs/design/architecture.md` is empty or invalid Markdown
- Fewer than 3 stack-relevant fields extractable (backend, frontend, database, deployment, verification_mode)
- User re-invokes with `/architect --restart`
