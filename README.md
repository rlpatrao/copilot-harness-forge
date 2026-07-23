# Harness Forge

> A harness that builds software the way a well-run engineering team would — from requirements to production, with independent verification at every step and rules that acquire themselves from what the system rejects. **Runs on both Claude Code and GitHub Copilot CLI.**

> **v3.5** (July 2026) is the current line — the **GitHub Copilot CLI port**. The same agents, skills, hooks, and commands run under both runtimes: Claude Code loads the forge as a plugin; Copilot CLI loads a generated `.github/` install tree. Port design: [`brd/v3.5-copilot-port-analysis.md`](brd/v3.5-copilot-port-analysis.md); live-verified runbook + findings: [`brd/v3.5-copilot-dogfood-runbook.md`](brd/v3.5-copilot-dogfood-runbook.md). Full spec chain: [`brd/v3.0.md`](brd/v3.0.md) → [`v3.1`](brd/v3.1-implementation-plan.md) → [`v3.2`](brd/v3.2-implementation-plan.md) → [`v3.3`](brd/v3.3-trace-compiled-rules-plan.md) → [`v3.4`](brd/v3.4-headless-dogfood.md) → **v3.5 (Copilot)**. Machine-readable inventory: [`HARNESS.md`](HARNESS.md) + [`harness-manifest.json`](harness-manifest.json). Live punch list: [`feature_list.json`](feature_list.json) (82 entries).

> **Counts as of v3.5:** 20 agents · 36 hooks · 53 skills · 28 commands · 46 scripts · 82 feature_list entries. Each is exported 1:1 into the Copilot install tree under `.github/` (`agents/`, `skills/`, `commands/`, `hooks/`, `mcp.json`).

> **Which runtime?** Claude Code gives you BYO-LLM routing (`config/workflows.yaml`), tree-structured sessions, and the plugin install. GitHub Copilot CLI gives you pooled Copilot Business/Pro billing and a `.github/`-native install, at the cost of BYO-LLM (models run through Copilot's inference). Both drive the same 12-gate ratchet and `feature_list.json` contract. See [Running under GitHub Copilot CLI](#running-under-github-copilot-cli).

You describe what you want to build. The forge runs specialized agents through the pipeline: gathering requirements through Socratic interview (or importing your existing BRD + architecture doc), challenging your architecture decisions, decomposing work into stories, generating code with parallel agent teams, and verifying everything by actually running the application. Not by reading the code and saying "looks good."

One command starts it. Human approval gates the creative decisions (BRD, architecture, design). Everything after that — implementation, testing, verification, self-healing, rule acquisition — runs autonomously, bounded by the [`feature_list.json`](feature_list.json) contract.

### On Claude Code

Two ways to start — pick one based on whether you already have a BRD and architecture doc.

```bash
# INTERACTIVE — the forge interviews you
git clone https://github.com/rlpatrao/copilot-harness-forge.git ~/harness-forge
mkdir my-app && cd my-app
claude --plugin-dir ~/harness-forge
> /scaffold
```

```bash
# HEADLESS — bring your own BRD + Architecture
git clone https://github.com/rlpatrao/copilot-harness-forge.git ~/harness-forge
mkdir my-app && cd my-app
cp /path/to/your/BRD.md ./BRD.md                      # or requirements.md / prd.md
cp /path/to/your/architecture.md ./architecture.md    # or .dsl / .puml / .mmd (AAC)
claude --plugin-dir ~/harness-forge
> /scaffold --branch B --brd BRD.md --arch architecture.md \
            --name my-app --type saas --plugins minimal --yes
```

The headless invocation skips every interactive question — Q0 (source), Q1-Q3 (project info), the 11-round architect interrogation (replaced by synthesis over your imported architecture), and the architect review loop (auto-approved). It ends with `state/architecture-approved.flag` written and the project ready for `/auto`.

### On GitHub Copilot CLI (v3.5)

The forge ships as a **Copilot plugin** — load it into *your own* project the same way Claude Code uses `--plugin-dir`. The forge stays in its own folder; your app lives in yours.

```bash
# 1. Install the agentic Copilot CLI (needs Node 22+ and a Copilot seat)
npm install -g @github/copilot

# 2. Get the forge once (anywhere). It ships with the generated plugin tree.
git clone https://github.com/rlpatrao/copilot-harness-forge.git ~/harness-forge

# 3. In YOUR project, load the forge as a plugin
mkdir my-app && cd my-app && git init
copilot --plugin-dir ~/harness-forge          # accept the folder-trust prompt (enables hooks)
> /scaffold                                    # or: say hi, then /auto
```

The forge's agents, 53 skills, hooks, and MCP config are now available in `my-app/`, and its hooks fire on *your* project (they resolve their bundled scripts via `${COPILOT_PLUGIN_ROOT}` — **live-verified** loading + firing in a separate project). To make the plugin permanent instead of passing `--plugin-dir` each time, add it to `enabledPlugins` in your Copilot config or `copilot plugin install rlpatrao/copilot-harness-forge`.

> **Forge developers** re-run `node scripts/export-to-copilot.js` after editing any `agents/`, `skills/`, `commands/`, `hooks/`, or `settings.json` source and commit the regenerated `.github/` tree + `plugin.json`. End users don't need this — the plugin tree is committed.

Full details — the `COPILOT=1` output switch, folder-trust, model routing, known limits — are in [Running under GitHub Copilot CLI](#running-under-github-copilot-cli) and [`AGENTS.md`](AGENTS.md).

---

## What the Forge Does

### Builds and Verifies Autonomously

The forge doesn't just generate code — it runs your app, hits your API endpoints, drives a browser through Playwright, and checks for console errors. A 200 response with `"Failed to connect"` in the body is a failure. An empty list when data should exist is a failure. If something breaks, it diagnoses the issue, fixes it, and re-verifies — up to 3 attempts per gate before escalating.

Every `passes:false → true` flip on a feature requires a real verification artifact under `verification/<id>.{png,json}` that's committed to git — enforced by [`hooks/e2e-gate.js`](hooks/e2e-gate.js). Since v3.2.2, that flip can additionally require a **3-instance majority vote** from independent Critic spawns ([`scripts/critic-vote.js`](scripts/critic-vote.js)); each vote runs in fresh context so single-verifier variance can't rubber-stamp a broken feature.

### Catches What Tests Miss

Tests pass. The app crashes. This is the most common failure mode in AI-generated code, and the forge addresses it structurally:

- **Three-level verification** — liveness (does it respond?), behavior (does it work correctly?), integration (do features work together?)
- **Smoke launch with real data** — every build group starts the app with actual production data, not test fixtures. This gate cannot be disabled.
- **Spec gaming detection** — catches agents deleting tests to make suites pass, writing tautological assertions, inflating coverage with dead code. Cannot be disabled.
- **Mutation testing** — injects small bugs and verifies your tests actually catch them. Monotonic ratchet: once mutation score reaches 72%, it never drops below 72%.
- **Cross-feature regression** (v3.2.4) — re-runs prior features' E2E steps under a diff-scoped impact selection ([`scripts/regression-gate.js`](scripts/regression-gate.js) + [`scripts/impact-scope.js`](scripts/impact-scope.js)). Catches "this new feature broke a previously-passing one" silently.
- **Structural sensors** — pre-bash-gate blocks bash writes to sensitive paths (`.env`, `.ssh/`, credentials) that Write/Edit hooks would miss. Concurrency-gate caps subagent fan-out at 18. Real git hooks (installed by scaffold) fire on `git commit --amend` too.

### Learns and Rules Acquire Themselves (v3.3 TRACE)

The forge closes the loop between "what the system rejected" and "what it stops permitting":

- **Correction stream** — every Critic BLOCK, security-review finding, e2e-gate rejection, and feature-edit-guard block appends to `state/rejections.jsonl` via [`hooks/lib/log-rejection.js`](hooks/lib/log-rejection.js).
- **Rule mining** — [`hooks/correction-detector.js`](hooks/correction-detector.js) (Stop event) groups repeated rejections and emits candidates to `state/rule-candidates/`. A library of known patterns (AWS/GitHub/Slack tokens, `.only()`, `debugger`, TODO) synthesizes regex checks; unknown patterns get a semantic (Critic-enforced) check.
- **Curation** — `/rules` (backed by [`scripts/rule-compile.js`](scripts/rule-compile.js)) promotes `candidate → tentative(warn) → confirmed(block)` with a Critic-pass gate and an FP-override guard. False positives from `RULE_GATE_OVERRIDE=<rule_id>` block auto-promotion until re-reviewed.
- **Enforcement** — [`hooks/rule-gate.js`](hooks/rule-gate.js) evaluates pattern rules PreToolUse and hard-blocks the offending Edit/Write/Bash *before* the tool call lands. TRACE (arXiv 2606.13174): 70.1% preference compliance for compiled rules vs 55% for context-only injection.

Two rule stores by design:
- **`state/learned-rules.md`** (v3.2.1) — human-edited fast lane, advisory, injected verbatim into every SessionStart reminder.
- **`state/compiled-rules.json`** (v3.3) — machine-executable with `check` spec (pattern → rule-gate hard-blocks; semantic → Critic hard-filters).

### Adapts to Your Project

The architect analyzes your requirements and activates only what's relevant:

| Project Type | What Activates |
|---|---|
| **CRUD** | Standard architecture review, gates 1-8 |
| **ML** | + ML pipeline design, compliance gate, model cards, bias/fairness audits |
| **Agentic** | + Agentic architecture round, OWASP Agentic Top 10, agentic UX patterns |
| **RAG** | + RAG scaffolding, vector DB selection, chunking/embedding guidance |

The architect can also run in **synthesis mode** (v3.1.2) — if you provide BRD.md + architecture.dsl/puml/mmd/md, it skips the 11-round interview and derives design artifacts directly. A single review-loop artifact (`specs/design/architecture-review-v1.md`) then goes through approve/amend/restart with a 3-cycle amend budget.

### Scales with Agent Teams

For large story groups, the generator spawns parallel sub-agents via the Task/Agent tool. Each spawn runs in fresh context with its own LLM (per `config/workflows.yaml`) and its own tool grants (per agent frontmatter). Concurrency is capped at 18 by [`hooks/concurrency-gate.js`](hooks/concurrency-gate.js) with TTL-pruning for leaked spawns.

---

## The Pipeline

```
Phase 1:   Requirements    -> /brd Socratic interview       [HUMAN]
                              OR /scaffold --branch B         [HEADLESS via v3.4 flags]
Phase 2:   Architecture    -> /architect (up to 11 rounds)  [HUMAN]
                              OR /architect --from-import    [SYNTHESIS from imported DSL]
                              OR /architect --auto-approve   [HEADLESS after synthesis]
Phase 3:   Stories         -> Epics + dependency graph      [HUMAN]
Phase 3.5: Test Planning   -> Test plan + traceability      [AUTO]
Phase 4:   Design          -> UI mockups                    [HUMAN]
Phase 5:   Initialize      -> State + changelog + consent
Phases 6-9: Build          -> Autonomous ratcheting loop
Phase 10:  Post-build      -> Learnings + rule mining + findings report
```

**Interactive path:** phases 1-4 pause for approval; 5+ runs autonomously.

**Headless path (v3.4):** provide BRD + architecture as artifacts + set `AUTO_ADVANCE_ON_ARCHITECTURE_APPROVED=1`, and every prompt is answered upfront. The coding-agent's SessionStart step 3a sees the imperative banner and invokes `/auto` as its first action.

---

## 12-Gate Quality Ratchet

Quality is monotonic — it only moves forward. Each gate produces PASS, FAIL, or NOT_RUN. A skipped gate is never treated as a pass.

| Gate | What It Enforces |
|---|---|
| 1. Unit tests | All tests pass |
| 2. Lint + types | Clean static analysis |
| 3. Coverage | >= baseline (ratcheted, never drops) |
| 4. Architecture | Import rules, layer boundaries |
| 5. Evaluator | API + browser + console verification against real running app |
| 6. Code review | Quality principles, story traceability, Balanced Coupling rubric (v3.2.5) |
| 7. UI standards | SaaS/enterprise conformance (UI projects only) |
| 8. Security | OWASP Web Top 10 + OWASP Agentic Top 10 |
| 9. Mutation testing | Tests must catch injected bugs (score ratchets) |
| 10. Compliance | Bias, fairness, PII, data privacy (ML projects only) |
| 11. Spec gaming | Detects agents gaming metrics (always on, cannot disable) |
| 12. Smoke launch | App starts with real data (always on, cannot disable) |

36 enforcement hooks run at 7 distinct lifecycle events (SessionStart, PreToolUse, PostToolUse, PreCompact, Stop, SubagentStop, TaskCompleted). Classified into 4 arbitration levels (v3.2.3: `hard-block` / `self-correct` / `review-focus` / `advisory`), documented in [`docs/sensor-arbitration.md`](docs/sensor-arbitration.md). Hard-blocks support waivers via [`scripts/check-waiver.js`](scripts/check-waiver.js) with mandatory expiry — recorded in `specs/reviews/sensor-waivers.json`.

---

## 20 Agents

| Agent | Role |
|---|---|
| **initializer** (v3.0) | One-shot project genesis — writes `feature_list.json`, `init.sh`, `harness-progress.txt`, first commit |
| **coding-agent** (v3.0) | Per-session feature worker following the 8-step SessionStart sequence |
| **brd-creator** | Socratic requirements interview across 5 dimensions |
| **architect** | Interactive stack decisions (or synthesis mode from imported DSL); challenges weak choices; persists learnings |
| **spec-writer** | Decomposes BRD into epics, stories with acceptance criteria, dependency graph |
| **planner** (v3.0) | Read-only Plan Mode subagent — schema literally lacks Write/Edit |
| **generator** | Code + tests via agent teams, TDD red-green-refactor |
| **critic** (v3.0) | Independent GAN judge — stronger model than generator, sees only the diff |
| **evaluator** | Runs the app, verifies behavior, manages infrastructure lifecycle autonomously |
| **e2e-runner** (v3.0) | Executes feature `steps[]` via Playwright/Puppeteer MCP; captures verification artifact |
| **test-engineer** | Test plans, traceability matrices, Playwright E2E, mutation testing |
| **code-reviewer** | Quality principles, architecture compliance, Balanced Coupling rubric, learned rules |
| **security-reviewer** | OWASP Web Top 10 + OWASP Agentic Top 10 |
| **ui-designer** | React+Tailwind mockups, agentic UX patterns |
| **ui-standards-reviewer** | SaaS/enterprise conformance checklist |
| **compliance-reviewer** | Bias/fairness audits, PII detection, regulatory compliance, model cards |
| **spec-auditor** (v3.0) | Walks back from phase-N failure to the earliest upstream spec gap |
| **compactor** (v3.0) | Stage 3-5 transcript summarizer (Haiku for cost) |
| **doc-updater** (v3.0) | Syncs `docs/` to code changes — Write scope restricted to `docs/` |
| **codebase-explorer** (v3.1.9) | Read-only exploration agent with LSP grant — grounds every claim in `file:line` citations |

The evaluator manages infrastructure autonomously — database migrations, Docker Compose, health checks with exponential backoff, teardown. No "open 3 terminals and start services."

---

## 53 Skills

Executable skills + reference pattern libraries. Notable additions since v3.0:

| Category | Skills |
|---|---|
| **Pipeline** | `brd`, `architect`, `spec`, `test`, `design`, `build`, `auto`, `implement`, `evaluate`, `review` |
| **Operations** | `deploy`, `fix-issue`, `refactor`, `improve`, `change`, `upgrade`, `status`, `dogfood` |
| **AI-Native** | `observe`, `comply`, `rag`, `workflow`, `resilience`, `model-card`, `context-budget`, `tenant`, `lint-drift` |
| **v3.0** | `extended-react`, `spec-backprop`, `instinct-extraction`, `iterative-retrieval`, `tree-sessions`, `cross-provider-handoff` |
| **v3.1** | `scaffold-import` (Branch B artifact import), `code-map` (living code-graph), `triage` (pre-work inbox), `memory-os` (3-tier filesystem: core / recall / archival) |
| **v3.2** | `critic-vote` (3-instance majority vote at merge boundary) |
| **v3.3** | `compiled-rules` (TRACE model doc) |
| **Feedback** | `report-findings` |

---

## 27 Commands

| Category | Commands |
|---|---|
| **Pipeline** | `/brd` `/architect` `/spec` `/design` `/build` `/auto` `/dogfood` `/scaffold` |
| **Planning** | `/plan` `/spec-audit` |
| **Work management** | `/feature-add` `/feature-status` |
| **Session** | `/tree` `/fork` `/branch` `/export` |
| **Instincts** | `/evolve` `/instinct-status` `/instinct-export` `/instinct-import` |
| **v3.1+** | `/context` (Token Governor bounded citations) `/triage` (v3.1.7 inbox) |
| **v3.2+** | `/critic-vote <feature-id>` (3-instance vote at merge) |
| **v3.3** | `/rules` (curate compiled rules through lifecycle) |
| **Operations** | `/model` `/cost` `/recipe-run` |

---

## Execution Modes

| Mode | Gates | When to Use |
|---|---|---|
| **Full** | All 12 | Production SaaS, regulated domains |
| **Lean** | 1-6, 9 | Internal tools, MVPs with quality needs |
| **Solo** | 1-3, 11-12 | Prototypes, weekend projects |
| **Turbo** | All 12 (batched) | Well-specified projects, Opus 4.6+ |

---

## LLM Routing

The forge is **LLM-swappable** at every workflow. Provider choice is thin:

### Where to configure

| Layer | File | Scope |
|---|---|---|
| Per-workflow | [`config/workflows.yaml`](config/workflows.yaml) | Every agent binds via `{{model:<workflow>}}` — 13 workflows × `primary` + `failover[]` + `thinking_level` + `max_iterations` + `tools_filter` |
| Per-project | `project-manifest.json` `execution.model_routing` | Overrides workflows.yaml at the target-repo level |
| Session default | `~/.claude/settings.json` `model` | Main-loop model driving the interactive session |
| Provider proxy | LiteLLM / Bifrost / Vercel AI Gateway | Translation layer for non-Anthropic models |

### Supported strategies

| Strategy | Description |
|---|---|
| **Cloud-only** (default) | Claude Opus for reasoning, Sonnet for code gen |
| **Hybrid** | Claude Opus for reasoning, local model for code gen |
| **Local-only** | All local (Qwen3-Coder, DeepSeek, any OpenAI-compatible API) |

### Third-party LLM support

**Kimi K3** (Moonshot) drops in via Anthropic-native endpoint — zero forge changes:
```bash
export ANTHROPIC_BASE_URL="https://api.moonshot.ai/anthropic"
export ANTHROPIC_AUTH_TOKEN="<moonshot-key>"
export ANTHROPIC_MODEL="kimi-k3"
claude   # /status confirms Kimi K3 is driving
```

**GPT-5 / Codex model** routes via LiteLLM proxy:
```yaml
# config/workflows.yaml
coding-agent:
  primary: openai/gpt-5-codex
  # LiteLLM translates OpenAI tool-call ↔ Anthropic tool_use
```

**GitHub Copilot CLI as runtime**: **supported (v3.5)** — see the section below. Copilot has no BYOK, so `workflows.yaml` routing is baked into each exported agent as a static Copilot model id instead of driving runtime provider selection.

**Codex CLI as runtime replacement**: not supported without porting (~2-4 weeks — different hook event model, different subagent tool). Skills, MCP servers, feature_list.json, and fixtures all port cleanly.

---

## Running under GitHub Copilot CLI

v3.5 ports the forge to **GitHub Copilot CLI** (`@github/copilot`, verified against 1.0.73). It's a *translation layer*, not a fork — the same hook logic, agents, skills, and commands run under both runtimes.

### Two ways to load it

- **As a plugin (use on your own project — the recommended flow).** `plugin.json` at the forge root makes it a Copilot plugin. Run `copilot --plugin-dir ~/harness-forge` inside *your* project (or `copilot plugin install rlpatrao/copilot-harness-forge`). Hooks reference their bundled scripts via `${COPILOT_PLUGIN_ROOT}`, so they run from any project; the hook's stdin carries *your* project's cwd, so the forge operates on your app, not on itself. This is the direct equivalent of Claude Code's `--plugin-dir`.
- **As a workspace (run the forge on itself — dogfood/self-hosted).** Copilot auto-discovers `.github/{agents,skills,commands,hooks}/` + `mcp.json` when you run `copilot` *inside the forge repo*. This is what the exporters primarily target.

Both are **live-verified** against 1.0.73: loaded into a separate empty project via `--plugin-dir`, the forge's skills load in-session and its hooks fire (`session-start` + the Stop-event hooks), writing to *that project's* `state/`.

### Install & generate

```bash
npm install -g @github/copilot        # Node 22+, an active Copilot seat
node scripts/export-to-copilot.js     # regenerate the .github/ tree from forge sources
git add .github/ && git commit -m "chore: regenerate Copilot export tree"
```

The exporters (all under `scripts/`) map forge sources → the paths Copilot actually reads:

| Generated | From | Exporter |
|---|---|---|
| `.github/hooks/*.json` + `hooks/run/*.sh` | `settings.json` hooks | `export-hooks-to-copilot.js` |
| `.github/agents/*.agent.md` | `agents/*.md` (+ `workflows.yaml` model) | `export-agents-to-copilot.js` |
| `.github/skills/*/SKILL.md` | `skills/*/` | `export-skills-to-copilot.js` |
| `.github/commands/*.md` | `commands/*.md` | `export-commands-to-copilot.js` |
| `.github/mcp.json` | `.claude-plugin/plugin.json` | `export-mcp-to-copilot.js` |
| `plugin.json` + `.github/plugin-hooks.json` | manifest + consolidated hooks | `export-plugin-manifest.js` + `export-hooks-to-copilot.js` |

Files under `.github/` carry a `# generated-from:` banner — **don't hand-edit them**; edit the forge source and re-run the exporter.

### Two things that differ from Claude Code

1. **`COPILOT=1` output switch.** Claude Code wraps injected context in `hookSpecificOutput`; Copilot expects a flat object. [`hooks/lib/output.js`](hooks/lib/output.js) emits both — the generated hook wrappers set `COPILOT=1` themselves, so no manual step. Claude Code behavior is byte-identical when the var is unset.
2. **Folder trust is required for hooks.** Copilot only runs repo hooks in a trusted folder. Accept the trust prompt on first interactive run, or seed `~/.copilot/settings.json` → `trustedFolders: ["<repo abs path>"]`. Without trust, hooks silently don't fire.

### Verified working (live, Copilot CLI 1.0.73)

| Component | Evidence |
|---|---|
| **Hooks fire** | one session drove `state/fire-log.jsonl` 53 → 418 across **35 hooks** (SessionStart 1×, Stop-hooks 1×, tool hooks per call) |
| **MCP** | `copilot mcp list` → `playwright (local)` from `.github/mcp.json` |
| **Skills** | `copilot skill list` → 53 project skills |
| **Instructions** | `CLAUDE.md` / [`AGENTS.md`](AGENTS.md) / [`.github/copilot-instructions.md`](.github/copilot-instructions.md) load as custom instructions |
| **Models** | every agent resolves to a real Copilot roster id (validated at export) |

### Model routing (no BYOK)

Copilot runs models through its own inference — you can't bring your own key. The agent exporter reads `config/workflows.yaml` and bakes a **static** Copilot model id into each `.agent.md` (`anthropic/claude-opus-4-7` → `claude-opus-4.7`, etc.), validated against Copilot's roster at export time. `workflows.yaml` stays the human-readable per-workflow spec.

### SessionStart lean mode

Under `COPILOT=1` (and not headless `/auto`), `session-start.js` emits a lean ~250-token status payload and **defers** the full "read everything + start working" startup to an explicit `/auto` — so a casual Copilot session doesn't balloon context or start unprompted work. Claude Code and headless `/auto` keep the full startup.

### Known limits (tracked in the runbook)

- **No hook matcher** in Copilot's schema → every hook fires on every tool call (hooks self-filter). Restoring Edit/Write/Bash gating is an open item.
- **Skill-catalog cost** — the 53 skill bodies are ~111k tokens; trimming the exported set for Copilot is a future lever.
- **Agent discovery** (`copilot --agent <name>`, `.agent.md` vs `.md`) not yet exercised end-to-end.
- **Custom slash commands** aren't auto-discovered by 1.0.73; `.github/commands/` is exported for parity but Copilot surfaces the forge via skills/agents/instructions.
- **Cloud coding agent** (autonomous PRs via GitHub Actions) is deferred to v3.5.7.

### Entitlement

Copilot resolves your seat from your GitHub account. If you're in an org with Copilot Business but no assigned seat, CLI access is denied by org policy — use a **personal** Copilot subscription (Pro/Pro+) or have an org admin assign a seat + enable the CLI/MCP policies. A fine-grained PAT with the "Copilot Requests" permission (`COPILOT_GITHUB_TOKEN`) pins the CLI to a specific account for headless use.

### Verify a run

```bash
node scripts/copilot-parity-check.js state/fire-log.jsonl                 # coverage of which hooks fired
node scripts/copilot-parity-check.js state/fire-log.jsonl --baseline claude.jsonl   # parity vs a Claude baseline
```

---

## Dogfooding

The forge tests itself. For forge development, `scripts/dogfood-setup.sh` seeds a target from a bundled fixture (with `AUTO_ADVANCE_ON_ARCHITECTURE_APPROVED=1` for CI runs):

```bash
# Forge-developer only — seeds a test target from a bundled fixture
./scripts/dogfood-setup.sh --target ./test-projects/salary-dashboard --fixture salary-dashboard
cd ./test-projects/salary-dashboard
AUTO_ADVANCE_ON_ARCHITECTURE_APPROVED=1 claude
```

**End users don't need this** — use Path 2 in the Quick Start above. The dogfood-setup script is a shortcut for the forge team to test the forge itself against bundled fixtures under [`templates/dogfood-fixtures/`](templates/dogfood-fixtures/) (currently `salary-dashboard`, a public H1B/OFLC salary explorer with a chatbot, complete with 5-dim BRD + Structurizr DSL architecture).

Historical dogfood targets ([`test-projects/`](test-projects/), gitignored):

| Project | Type | What It Proved |
|---|---|---|
| Fraud Detection | ML SaaS | Found 9 config-to-execution gaps invisible to code review |
| Agentic Fraud | Agentic | 4 self-healing cycles completed autonomously |
| Vikings Chat | Web + LLM | First browser-verified dogfood |
| Pac-Man CLI | Terminal game | Tests pass on synthetic data, app crashes on real data (led to Gate 12) |
| Task Manager | Web CRUD | Full Playwright MCP pipeline proven end-to-end |
| Salary Dashboard (v3.4) | SaaS + chatbot | Headless artifact-driven scaffold path proven end-to-end |

```bash
# Validate the forge itself
bash scripts/test-hooks.sh                        # 17-test functional smoke suite
node scripts/validate-harness-manifest.js         # 91/91 rows valid, 3 empty cells documented
```

---

## The Three Core Ideas

### 1. The Code That Writes Must Not Evaluate

Inspired by Generative Adversarial Networks, the forge structurally separates generation from verification. Generator writes; evaluator runs the app and checks behavior. They never share context about what "should" happen — the evaluator only knows the contract and what the running application actually does. Eliminates the most common failure mode in single-agent coding: reading your own code, deciding it looks correct, and moving on.

### 2. The Karpathy Ratchet

Quality metrics must be monotonic. Coverage at 80% can never drop to 79%. Mutation score at 72% can never drop to 71%. Test count can never decrease. The ratchet means the system either fixes forward (diagnose, fix, re-verify) or escalates with full context. It never silently skips a broken gate. Never regresses.

### 3. Rules Acquire Themselves (v3.3 TRACE)

The harness's own rejections are its best rule source. Every Critic BLOCK, e2e-gate rejection, and security-review finding flows into `state/rejections.jsonl` via a shared helper. Repeated patterns become candidate rules via `hooks/correction-detector.js`, get validated through a Critic pass, land as tentative rules (warn), and after 2 sessions with no false-positive overrides become confirmed rules (hard-block). `hooks/rule-gate.js` evaluates them PreToolUse and stops the offending Edit/Write/Bash before it lands.

Two rule stores, split by *how* they enforce rather than by *who* wrote them:
- **Pattern rules** run inline in the PreToolUse hook and hard-block a specific tool call
- **Semantic rules** flow to the Critic as an extra hard-filter

Both are mined from what the system already rejected. Both go through the same lifecycle. Both retire when they misfire.

---

## Quick Start

Pick one of two paths based on whether you already have written requirements + architecture.

### Path 1 — Interactive (forge interviews you)

Use this when: you're starting from a rough idea and want the forge to draw out requirements and stack decisions through Socratic dialogue.

```bash
# 1. Clone the forge (one-time, anywhere on your filesystem)
git clone https://github.com/rlpatrao/copilot-harness-forge.git ~/harness-forge

# 2. Create your project folder
mkdir my-app && cd my-app

# 3. Start Claude Code with the forge loaded as a plugin
claude --plugin-dir ~/harness-forge

# 4. Scaffold — the forge asks questions
> /scaffold

# 5. Answer the prompts:
#    - Q0: A (interactive Q&A)
#    - Q1: "What are you building?" — describe the app
#    - Q2: Consumer SaaS / Enterprise / API-only
#    - Q3: Plugin preset (minimal is fine)
#    Then /brd runs (5-dimension interview) and /architect runs
#    (up to 11 rounds of stack decisions). Human approves each step.

# 6. Build
> /build
```

**Expected duration** for a first-time scaffold with interviews: 20-60 minutes depending on how much detail you provide. All decisions are captured under `specs/brd/` and `specs/design/` for review.

### Path 2 — Headless (you bring BRD + Architecture)

Use this when: you already have a written BRD and an architecture document, and you want the forge to just consume them and start building.

```bash
# 1. Clone the forge (one-time, anywhere on your filesystem)
git clone https://github.com/rlpatrao/copilot-harness-forge.git ~/harness-forge

# 2. Create your project folder
mkdir my-app && cd my-app

# 3. Copy YOUR BRD + Architecture into the project folder
cp /path/to/your/BRD.md ./BRD.md
cp /path/to/your/architecture.md ./architecture.md
#    (Architecture can also be Structurizr DSL, PlantUML C4, or Mermaid C4:
#     cp /path/to/architecture.dsl ./architecture.dsl
#     cp /path/to/architecture.puml ./architecture.puml
#     cp /path/to/architecture.mmd ./architecture.mmd
#     The forge auto-detects the format via file extension.)

# 4. Start Claude Code with the forge loaded as a plugin
claude --plugin-dir ~/harness-forge

# 5. Scaffold with flags — no interactive questions asked
> /scaffold --branch B --brd BRD.md --arch architecture.md \
            --name my-app --type saas --plugins minimal --yes

# 6. Build
> /build
```

**What Branch B does:** stages `BRD.md` into `specs/brd/app_spec.md`, parses `architecture.*` (with AAC parsers if applicable) into `specs/design/architecture.md` + `specs/design/architecture-ir.json`, writes `.imported` sentinels, runs the architect in **synthesis mode** (no 11-round interview — it derives design artifacts from your imported architecture), and produces `state/architecture-approved.flag`. Zero interactive prompts.

**Flag reference:**

| Flag | Purpose | Values |
|---|---|---|
| `--branch A\|B\|C` | Requirements source | A = interactive, B = both docs imported, C = BRD only (still interviews for architecture) |
| `--brd <path>` | Path to BRD file | `.md` — relative to project folder |
| `--arch <path>` | Path to Architecture file | `.md`, `.dsl`, `.puml`, or `.mmd` |
| `--name <name>` | Project name | kebab-case |
| `--type saas\|enterprise\|api-only` | Project type (drives UI standards) | one of three |
| `--plugins minimal\|full\|none` | Plugin preset | minimal recommended |
| `--yes` | Accept confirmations | for overwrite prompts, etc. |

**Hybrid variant** — you have a BRD but no architecture yet:

```bash
> /scaffold --branch C --brd BRD.md --name my-app --type saas --plugins minimal --yes
# /brd skips (BRD imported); /architect runs the 11-round interview
```

Or headless via scaffold flags without a fixture:

```bash
claude --plugin-dir ~/harness-forge
> /scaffold --branch B --brd /path/to/BRD.md --arch /path/to/architecture.dsl \
            --name my-app --type saas --plugins minimal --yes
> /architect --from-import --auto-approve
> /auto
```

### Upgrading

Already scaffolded a project? One command pulls the latest forge and upgrades in place — no re-scaffolding, no re-answering setup questions, no manual file copying:

```bash
> /upgrade          # pulls latest, replaces forge files, preserves your project state
> /upgrade --check  # dry-run to see what would change
```

---

## Plugin Ecosystem

The scaffold offers 25+ Claude Code plugins organized by compatibility:

**Safe to install:** firebase, stripe, supabase, terraform, linear, asana, github, gitlab, slack, discord, all LSP plugins, playground, context7, greptile, commit-commands

**Do NOT install** (conflict with forge): feature-dev, frontend-design, hookify, code-review, pr-review-toolkit

---

## Requirements

- **A supported runtime** — either **Claude Code** v2.1.32+ (agent teams support), or **GitHub Copilot CLI** (`@github/copilot`, verified on 1.0.73) with a Copilot seat. Codex CLI needs porting (~2-4 weeks).
- **Node.js 18+** for Claude Code (**22+** for the Copilot CLI) — runs the 36 hooks and orchestration scripts
- **Docker + Docker Compose** (for evaluation, optional if using local verification)
- **Python 3.12+** and/or **Node.js 20+** (for generated projects)
- **Playwright MCP** OR **Puppeteer MCP** (declared in `.claude-plugin/plugin.json` — required for E2E gate)
- **Optional:** vLLM or Ollama (for local LLM routing)
- **Optional:** mutmut / Stryker (for mutation testing)
- **Optional:** LiteLLM / Bifrost (for non-Anthropic model routing)

---

## Repo Structure

```
harness-forge/
  agents/                     20 agent definitions          (Claude Code source)
  skills/                     53 skills (executable + reference libraries)
  hooks/                      36 enforcement hooks
    lib/                        shared helpers (output.js dual-shape emitter, log-rejection.js, …)
  commands/                   28 slash commands
  scripts/                    46 orchestration scripts (validate, compile, generate)
    export-*-to-copilot.js      v3.5 Copilot exporters (hooks/agents/commands/skills/mcp)
    export-to-copilot.js        orchestrator — regenerates the whole .github/ tree
    copilot-parity-check.js     v3.5 fire-log parity checker
    lib/copilot-export.js       shared exporter helpers (model map, tool map, paths)
  .github/                    v3.5 GENERATED Copilot install tree (do not hand-edit)
    agents/  skills/  commands/  hooks/{*.json,run/*.sh}  mcp.json
    copilot-instructions.md     Copilot-native instructions (points to AGENTS.md → CLAUDE.md)
  AGENTS.md                   Copilot/agent runtime layer over CLAUDE.md
  CLAUDE.md                   full forge contract (source of truth, both runtimes)
  evals/                      code reviewer regression tests
  templates/                  17 project templates
    dogfood-fixtures/           v3.4 fixtures (salary-dashboard, etc.)
    git-hooks/                  real git hooks installed by scaffold
    github-workflows/           CI templates (scheduled-triage etc.)
  brd/                        BRD v3.0-v3.5 specs, plans, and the Copilot dogfood runbook
  docs/                       operational docs (sensor-arbitration, token-governor, etc.)
  learnings/                  cross-project knowledge base
  state/                      initial state files
    compiled-rules.json         v3.3 TRACE machine rules
    learned-rules.md            v3.2.1 human fast-lane rules
    memory/                     v3.1.11 three-tier filesystem memory
  config/
    workflows.yaml              per-workflow LLM routing (Claude Code runtime; static export for Copilot)
  recipes/                    YAML deterministic workflows
  instincts/                  v3.0 3-tier promotion (pending/tentative/confirmed)
  verification/               E2E gate artifacts + attestations
  HARNESS.md                  human-readable component registry
  harness-manifest.json       machine-readable component registry
  feature_list.json           82-entry append-only project contract
  harness-progress.txt        cross-session bridge (all v3.0-v3.5 milestones logged)
```

---

## Based On

- [Anthropic: Harness Design for Long-Running Application Development](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- [Anthropic: Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) (Nov 2025 — the v3.0 origin)
- [OpenAI: Harness Engineering](https://openai.com/index/harness-engineering/)
- SWE-agent, AgentCoder, MetaGPT, Reflexion, AlphaCode 2
- [OWASP Agentic Top 10 (2025)](https://owasp.org/www-project-agentic-ai-top-10/)
- METR: Reward Hacking in RLHF (basis for Gate 11)
- **OPENDEV** (arXiv 2603.05344, Mar 2026) — compound AI system, per-workflow LLM routing, dual-agent Plan/Normal modes, five-layer defense-in-depth
- **Pi-mono** (Mario Zechner) — tree-structured sessions, cross-provider handoffs, per-session cost tracking
- **TRACE** (arXiv 2606.13174, v3.3) — Test-time Rule Acquisition + Compiled Enforcement. 70.1% preference compliance vs 55% context-only.
- **Vlad Khononov** — *Balancing Coupling in Software Design* (Addison-Wesley, 2024). v3.2.5 Balanced Coupling rubric.
- **Addy Osmani** — [Loop Engineering](https://addyosmani.com/blog/loop-engineering/). Five primitives that shaped v3.1 loop hardening.
- Selective borrows from [`cwijayasundara/claude_harness_eng_v5`](https://github.com/cwijayasundara/claude_harness_eng_v5) — sensor arbitration, harness registry, defensive triad, Token Governor patterns.

---

## Release History

- **v3.5** (July 2026) — **GitHub Copilot CLI port.** Dual-runtime hook output adapter (`hooks/lib/output.js`, `COPILOT=1` → flat shape, Claude Code byte-identical otherwise); five exporters + orchestrator (`scripts/export-*-to-copilot.js`) that generate the `.github/{agents,skills,commands,hooks}/` + `mcp.json` install tree from forge sources; static per-agent model resolution from `workflows.yaml` validated against Copilot's roster; `AGENTS.md` + `.github/copilot-instructions.md`; `scripts/copilot-parity-check.js`. **Live-verified against Copilot CLI 1.0.73** — hooks fire (fire-log 53→418 across 35 hooks), MCP + 53 skills load, custom instructions load; corrected the real hook schema (`{version,hooks:{…}}` + `bash` wrappers) and the folder-trust requirement; added Copilot SessionStart lean mode. Design + findings: [`brd/v3.5-copilot-port-analysis.md`](brd/v3.5-copilot-port-analysis.md), [`brd/v3.5-copilot-dogfood-runbook.md`](brd/v3.5-copilot-dogfood-runbook.md).
- **v3.4** (July 2026) — Headless scaffold + dogfood setup. `--branch`/`--brd`/`--arch`/`--name`/`--type`/`--plugins`/`--yes` scaffold flags; `--auto-approve` on architect (synthesis mode only); `AUTO_ADVANCE_ON_ARCHITECTURE_APPROVED` env var upgrades SessionStart to imperative; `scripts/dogfood-setup.sh` + `templates/dogfood-fixtures/salary-dashboard/` (5-dim BRD + Structurizr DSL). 5 feature entries. 36/36 smoke checks passed. Spec: [`brd/v3.4-headless-dogfood.md`](brd/v3.4-headless-dogfood.md).
- **v3.3** (July 2026) — TRACE compiled-rule enforcement. `hooks/rule-gate.js` PreToolUse pattern-block; `hooks/correction-detector.js` Stop-event candidate miner; `hooks/lib/log-rejection.js` shared producer wired into e2e-gate, feature-edit-guard, critic, security-reviewer, code-reviewer; `scripts/rule-compile.js` + `/rules` curation with candidate→tentative(warn)→confirmed(block) lifecycle; semantic-path via `agents/critic.md`; `skills/compiled-rules/SKILL.md`. 6 feature entries. 26/26 dogfood checks passed. Spec: [`brd/v3.3-trace-compiled-rules-plan.md`](brd/v3.3-trace-compiled-rules-plan.md).
- **v3.2** (June-July 2026) — Five external-harness borrows: learned-rules propagation (v3.2.1 with security hardening — symlink guard + prompt-injection framing); 3-instance majority vote at merge boundary (v3.2.2); sensor arbitration taxonomy + waiver schema (v3.2.3); cross-feature regression sensor (v3.2.4); Khononov Balanced Coupling rubric (v3.2.5). 5 feature entries. Spec: [`brd/v3.2-implementation-plan.md`](brd/v3.2-implementation-plan.md).
- **v3.1** (June 2026) — Scaffold Q0 split (Q&A vs artifact-import vs hybrid); architect synthesis mode + single-doc review loop; harness registry (`HARNESS.md` + `harness-manifest.json`); defensive triad (pre-bash-gate + concurrency-gate + real git hooks); Token Governor MVP (`/context` + CCR pipeline + token-advisor); triage inbox; scheduled automations; living code-graph (`skills/code-map/` + `hooks/graph-refresh.js` + `codebase-explorer` agent); AAC parsers (Structurizr/PlantUML/Mermaid C4); memory-OS filesystem tier (core/recall/archival). 14 feature entries. Spec: [`brd/v3.1-implementation-plan.md`](brd/v3.1-implementation-plan.md).
- **v3.0** (May 2026) — Retrofit driven by Anthropic Nov-2025 effective-harness paper, OPENDEV, Pi-mono. Initializer/coding-agent split, `feature_list.json` contract, Ralph Loop, per-workflow LLM routing, Plan Mode subagent, Extended ReAct, budget footer, mandatory browser-automation E2E gate, five-layer defense-in-depth, event-driven system reminders, 5-stage adaptive compaction, instinct extraction, tree-structured sessions, three-tier skills hierarchy, spec-gap backpropagation, monotonic-improvement guards, YAML recipes. Spec: [`brd/v3.0.md`](brd/v3.0.md).
- **v2.1** (April 2026) — Gate 12, Phase 3.5, `/upgrade`, `/change`, `/status`, internet research, PTY-based E2E, Playwright MCP pipeline.
- **v2.0** (March 2026) — 15 pillars, mutation testing, compliance reviewer, OWASP Agentic, local LLM routing, RAG/workflow/resilience scaffolding.
- **v1.0** (March 2026) — GAN-inspired architecture, 8-gate ratchet, 4 execution modes, Socratic BRD, interactive architect.

---

## License

MIT
