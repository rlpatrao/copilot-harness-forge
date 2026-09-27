#!/usr/bin/env bash
# dogfood-setup.sh — headless dogfood target setup (BRD v3.4).
#
# Runs the v3.1.1 scaffold-import Branch B path end-to-end against a
# fixture BRD + Architecture-as-Code, then jumps straight to
# architect synthesis-mode + auto-approve, leaving the target project
# with:
#   - specs/brd/app_spec.md          (copied from fixture)
#   - specs/design/architecture.md   (Markdown rendered from DSL)
#   - specs/design/architecture-ir.json  (parsed IR)
#   - specs/design/.imported + specs/brd/.imported sentinels
#   - state/architecture-approved.flag
#   - project-manifest.json + calibration-profile.json
#   - .claude/ scaffold copy
#   - state/learned-rules.md + state/compiled-rules.json seed
#   - feature_list.json seed with a headless-dogfood entry
#
# The resulting project state is "READY for /auto". An interactive
# Claude Code session started with AUTO_ADVANCE_ON_ARCHITECTURE_APPROVED=1
# will invoke /auto automatically per BRD v3.4 § coding-agent step 3a.
#
# Usage:
#   scripts/dogfood-setup.sh [--target <dir>] [--fixture <name>]
#
# Defaults:
#   --target ./test-projects/<fixture>
#   --fixture salary-dashboard
#
# Exit codes:
#   0 = success, project state ready
#   1 = missing fixture / prerequisite

set -euo pipefail

FORGE="$(cd "$(dirname "$0")/.." && pwd)"
TARGET=""
FIXTURE="salary-dashboard"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)   TARGET="$2"; shift 2;;
    --fixture)  FIXTURE="$2"; shift 2;;
    -h|--help)
      echo "Usage: $0 [--target <dir>] [--fixture <name>]"
      exit 0;;
    *) echo "unknown arg: $1"; exit 1;;
  esac
done

FIXTURE_DIR="${FORGE}/templates/dogfood-fixtures/${FIXTURE}"
if [[ ! -d "$FIXTURE_DIR" ]]; then
  echo "ERROR: fixture dir does not exist: $FIXTURE_DIR" >&2
  exit 1
fi
if [[ ! -f "${FIXTURE_DIR}/BRD.md" ]]; then
  echo "ERROR: no BRD.md in fixture: $FIXTURE_DIR" >&2
  exit 1
fi
[[ -z "$TARGET" ]] && TARGET="${FORGE}/test-projects/${FIXTURE}"

# Optional per-fixture metadata (name, description, project_type, seed_features).
# Absent -> the salary-dashboard defaults below are used.
FIXTURE_META="${FIXTURE_DIR}/fixture.json"
fixture_field() {
  [[ -f "$FIXTURE_META" ]] || return 0
  python3 -c 'import json,sys; v=json.load(open(sys.argv[1])).get(sys.argv[2]); print(v if isinstance(v,str) else json.dumps(v, indent=2)) if v is not None else None' "$FIXTURE_META" "$1"
}
PROJ_NAME="$(fixture_field name)"; PROJ_NAME="${PROJ_NAME:-salary-dashboard}"
PROJ_DESC="$(fixture_field description)"
PROJ_DESC="${PROJ_DESC:-Employee salary dashboard + NL Q&A chatbot over US DOL OFLC/H1B LCA disclosure data. Headless dogfood target (BRD v3.4).}"
PROJ_TYPE="$(fixture_field project_type)"; PROJ_TYPE="${PROJ_TYPE:-saas}"
SEED_FEATURES="$(fixture_field seed_features)"

# --- 1. Prepare target dir ---
mkdir -p "$TARGET"
cd "$TARGET"
echo "[dogfood-setup] target: $TARGET"

# --- 2. Init git (needed by feature-edit-guard + e2e-gate tracked-check) ---
if [[ ! -d .git ]]; then
  git init -q -b main
  git config user.email "dogfood@localhost"
  git config user.name  "dogfood"
fi

# --- 3. Copy scaffold ---
mkdir -p .claude
for sub in agents skills commands hooks templates evals scripts docs; do
  if [[ -d "${FORGE}/${sub}" ]]; then
    rm -rf ".claude/${sub}"
    cp -r "${FORGE}/${sub}" ".claude/${sub}"
  fi
done
cp "${FORGE}/settings.json" ".claude/settings.json"
[[ -f "${FORGE}/architecture.md" ]] && cp "${FORGE}/architecture.md" ".claude/architecture.md"
[[ -f "${FORGE}/program.md"      ]] && cp "${FORGE}/program.md"      ".claude/program.md"

# --- 4. project-manifest.json ---
cat > project-manifest.json <<JSON
{
  "name": "${PROJ_NAME}",
  "description": $(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$PROJ_DESC"),
  "project_type": "${PROJ_TYPE}",
  "stack": { "backend": null, "frontend": null, "database": null, "deployment": null },
  "evaluation": { "api_base_url": null, "ui_base_url": null, "health_check": null },
  "execution": {
    "default_mode": "full",
    "max_self_heal_attempts": 3,
    "max_auto_iterations": 50,
    "coverage_threshold": 80,
    "session_chaining": true,
    "agent_team_size": "auto",
    "teammate_model": "sonnet",
    "model_routing": {
      "strategy": "cloud-only",
      "reasoning_agents": { "model": "claude-opus", "agents": ["architect","evaluator","critic"] },
      "code_gen_agents":  { "model": "claude-sonnet", "agents": ["generator","test-engineer","code-reviewer","security-reviewer","ui-designer","ui-standards-reviewer"] },
      "local_model": null
    }
  },
  "verification": { "mode": null, "dev_bootstrap": null, "dev_teardown": null },
  "dogfood": {
    "is_dogfood": true,
    "mode": "headless (BRD v3.4)",
    "fixture": "${FIXTURE}"
  }
}
JSON

# --- 5. calibration-profile.json ---
cat > calibration-profile.json <<JSON
{
  "project_type": "${PROJ_TYPE}",
  "ui_standards": {
    "responsive_required": true,
    "mobile_breakpoint": 375,
    "desktop_breakpoint": 1280,
    "wcag_level": "AA",
    "min_touch_target": 44,
    "spacing_grid": 8,
    "empty_states_required": true,
    "error_pages_required": true
  }
}
JSON

# --- 6. Stage BRD.md into specs/brd/app_spec.md ---
mkdir -p specs/brd specs/design specs/design/amendments verification state/memory/core-blocks state/memory/sessions state/memory/archival state/rule-candidates
cp "${FIXTURE_DIR}/BRD.md" specs/brd/app_spec.md
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
cat > specs/brd/.imported <<EOF
imported_from: ${FIXTURE_DIR}/BRD.md
imported_at: ${NOW}
scaffold_mode: B
source_format: markdown
EOF

# --- 7. Detect + parse Architecture (Markdown OR AAC) ---
ARCH_SRC=""
ARCH_FMT=""
for cand in architecture.md architecture.dsl architecture.puml architecture.mmd; do
  if [[ -f "${FIXTURE_DIR}/${cand}" ]]; then
    ARCH_SRC="${FIXTURE_DIR}/${cand}"
    case "$cand" in
      *.md)   ARCH_FMT=markdown;;
      *.dsl)  ARCH_FMT=structurizr;;
      *.puml) ARCH_FMT=plantuml-c4;;
      *.mmd)  ARCH_FMT=mermaid-c4;;
    esac
    break
  fi
done

if [[ -z "$ARCH_SRC" ]]; then
  echo "ERROR: no architecture file found in fixture (looked for .md/.dsl/.puml/.mmd)" >&2
  exit 1
fi

echo "[dogfood-setup] architecture: $ARCH_SRC ($ARCH_FMT)"

case "$ARCH_FMT" in
  markdown)
    cp "$ARCH_SRC" specs/design/architecture.md
    ;;
  structurizr)
    node "${FORGE}/scripts/parse-structurizr.js"  "$ARCH_SRC" > specs/design/architecture-ir.json
    ;;
  plantuml-c4)
    node "${FORGE}/scripts/parse-plantuml-c4.js"  "$ARCH_SRC" > specs/design/architecture-ir.json
    ;;
  mermaid-c4)
    node "${FORGE}/scripts/parse-mermaid-c4.js"   "$ARCH_SRC" > specs/design/architecture-ir.json
    ;;
esac

# For AAC formats, render a Markdown fallback so downstream agents that
# don't yet read the IR still see a valid architecture.md.
if [[ -f specs/design/architecture-ir.json && ! -f specs/design/architecture.md ]]; then
  python3 - <<'PY'
import json
ir = json.load(open('specs/design/architecture-ir.json'))
md = [f"# Architecture — {ir['system_name']}", "",
      f"_Imported from {ir['source_format']}: `{ir['source_file']}`_", ""]
if ir.get('containers'):
    md.append("## Containers")
    for c in ir['containers']:
        md.append(f"- **{c['name']}** ({c.get('technology','?')}) — {c.get('description','')}")
    md.append("")
if ir.get('components'):
    md.append("## Components")
    for c in ir['components']:
        md.append(f"- **{c['name']}** in `{c.get('container_id','?')}` ({c.get('technology','?')}) — {c.get('description','')}")
    md.append("")
if ir.get('relationships'):
    md.append("## Relationships")
    for r in ir['relationships']:
        md.append(f"- `{r['from']}` → `{r['to']}`: {r.get('description','')}" +
                  (f" (via {r['technology']})" if r.get('technology') else ""))
    md.append("")
if ir.get('external_systems'):
    md.append("## External systems / people")
    for e in ir['external_systems']:
        md.append(f"- **{e['name']}** — {e.get('description','')}")
    md.append("")
if ir.get('notes'):
    md.append("## Parser notes")
    for n in ir['notes'][:20]:
        md.append(f"- {n}")
open('specs/design/architecture.md', 'w').write("\n".join(md))
PY
fi

cat > specs/design/.imported <<EOF
imported_from: ${ARCH_SRC}
imported_at: ${NOW}
scaffold_mode: B
source_format: ${ARCH_FMT}
EOF

# --- 8. Write architecture-approved.flag (BRD v3.4 auto-approve equivalent) ---
mkdir -p state
cat > state/architecture-approved.flag <<EOF
approved_at: ${NOW}
version: v1
review_doc: specs/design/architecture.md
mode: synthesis-auto-approved
next_suggested_command: /auto
approved_by: dogfood-setup.sh (BRD v3.4)
source_format: ${ARCH_FMT}
EOF

# --- 9. Seed state files ---
touch state/context-cache/.gitkeep 2>/dev/null || (mkdir -p state/context-cache && touch state/context-cache/.gitkeep)
touch state/memory/core-blocks/.gitkeep state/memory/sessions/.gitkeep state/memory/archival/.gitkeep state/rule-candidates/.gitkeep

# learned-rules.md seed
if [[ ! -f state/learned-rules.md ]]; then
  cat > state/learned-rules.md <<'RULES'
# Learned Rules
<!-- Monotonic — rules are NEVER deleted. Only add new rules. -->
<!-- BRD v3.2.1: injected verbatim into every SessionStart via hooks/session-start.js. -->

## Rules

<!-- Seed for dogfood: no rules yet. Add as they emerge. -->
RULES
fi

# compiled-rules.json seed (empty)
if [[ ! -f state/compiled-rules.json ]]; then
  cat > state/compiled-rules.json <<'RULES'
{
  "version": "3.3.0",
  "comment": "Seeded by dogfood-setup.sh. Empty until correction-detector mines candidates from state/rejections.jsonl.",
  "rules": []
}
RULES
fi

# --- 10. Seed feature_list.json (one entry — the dogfood target itself) ---
if [[ -n "$SEED_FEATURES" ]] && { [[ ! -f feature_list.json ]] || [[ $(cat feature_list.json) == '[]' ]]; }; then
  printf '%s\n' "$SEED_FEATURES" > feature_list.json
elif [[ ! -f feature_list.json ]] || [[ $(cat feature_list.json) == '[]' ]]; then
  cat > feature_list.json <<'FL'
[
  {
    "id": "dogfood-mvp-shell",
    "category": "feature",
    "description": "Bootstrap the salary-dashboard MVP shell: FastAPI backend + Next.js frontend + DuckDB stub. Sanity check that /auto can drive scaffold-import artifacts through generator + evaluator + E2E gate.",
    "steps": [
      "Backend serves GET /health returning 200 OK with a JSON body {status: ok}",
      "Frontend renders index page containing text 'Salary Dashboard'",
      "Playwright/Puppeteer MCP session verifies the index page loads and /health returns 200"
    ],
    "passes": false,
    "source_section": "BRD v3.4 dogfood, Salary Dashboard fixture AC1",
    "depends_on": [],
    "verification_artifact_path": "verification/dogfood-mvp-shell.json"
  }
]
FL
fi

# --- 11. harness-progress.txt seed ---
if [[ ! -f harness-progress.txt ]]; then
  cat > harness-progress.txt <<EOF
================================================================
${PROJ_NAME} — harness progress log
================================================================

Project: ${PROJ_NAME} (headless dogfood, BRD v3.4)
Source: ${FORGE}/templates/dogfood-fixtures/${FIXTURE}
Set up by: scripts/dogfood-setup.sh at ${NOW}

Initial state:
- BRD imported from ${FIXTURE_DIR}/BRD.md
- Architecture imported from ${ARCH_SRC} (${ARCH_FMT})
- architecture-approved.flag written (auto-approved by dogfood-setup)
- feature_list.json seeded ($(python3 -c 'import json; print(", ".join(f["id"] for f in json.load(open("feature_list.json"))))'))
- state/{compiled-rules,learned-rules}.md seeded empty

Next: an interactive Claude Code session started with
  AUTO_ADVANCE_ON_ARCHITECTURE_APPROVED=1 claude
will read SessionStart's imperative form and invoke /auto as first
action, per BRD v3.4 § coding-agent step 3a.

================================================================
EOF
fi

# --- 12. .gitignore ---
if [[ ! -f .gitignore ]]; then
  cat > .gitignore <<'GITIGNORE'
node_modules/
.next/
__pycache__/
*.pyc
.pytest_cache/
.venv/
dist/
build/
htmlcov/
.coverage
playwright-report/
test-results/
state/context-cache/*/
state/dirty-files.jsonl
state/concurrency-ledger.jsonl
state/token-advisor-session.json
!state/context-cache/README.md
GITIGNORE
fi

# --- 13. Initial commit ---
git add -A
if ! git diff --cached --quiet; then
  git commit -q -m "chore: dogfood-setup seed (BRD v3.4, fixture=${FIXTURE})"
fi

# --- 14. Report ---
echo ""
echo "[dogfood-setup] READY."
echo ""
echo "  target:       $TARGET"
echo "  fixture:      $FIXTURE"
echo "  brd:          specs/brd/app_spec.md ($(wc -l < specs/brd/app_spec.md) lines)"
echo "  architecture: specs/design/architecture.md ($(wc -l < specs/design/architecture.md) lines)"
echo "  sentinels:    specs/brd/.imported + specs/design/.imported"
echo "  approved:     state/architecture-approved.flag"
echo "  first commit: $(git log --oneline -1)"
echo ""
echo "  To drive the build (interactive session, headless mode):"
echo ""
echo "    cd $TARGET"
echo "    AUTO_ADVANCE_ON_ARCHITECTURE_APPROVED=1 claude"
echo ""
echo "  On session start, the coding-agent sees the imperative"
echo "  'auto-advance ON' banner and invokes /auto as its first action."
echo "  Downstream is fully autonomous — no prompts."
