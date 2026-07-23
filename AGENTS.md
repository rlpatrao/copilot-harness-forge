# AGENTS.md — Claude Harness Forge

GitHub Copilot CLI, Cursor, and other AGENTS.md-aware agents read this file as
custom instructions. The forge's full operating contract lives in
[`CLAUDE.md`](CLAUDE.md) — **read it first; it is the source of truth.** This
file adds only the Copilot-specific install and runtime notes layered on top.

> Copilot CLI reads `AGENTS.md`, `CLAUDE.md`, and `.github/copilot-instructions.md`
> all as custom instructions. `CLAUDE.md` therefore ports for free — nothing in
> it needs restating here.

## What this repo is

A GAN-inspired autonomous SDLC scaffold: a Generator writes code, an independent
Evaluator/Critic verifies it by running the app, and a 12-gate ratchet plus a
`feature_list.json` contract keep quality monotonic. Full architecture:
[`CLAUDE.md`](CLAUDE.md) and [`brd/v3.0.md`](brd/v3.0.md).

## Running under GitHub Copilot CLI (v3.5 port)

The forge was authored for Claude Code and ported to Copilot CLI. The port is a
translation layer, not a fork — the same hook logic, agents, commands, and
skills run under both runtimes. See
[`brd/v3.5-copilot-port-analysis.md`](brd/v3.5-copilot-port-analysis.md) for the
design.

### Use on your own project (plugin — recommended)

The forge ships as a Copilot plugin (`plugin.json` at the root), the direct
equivalent of Claude Code's `--plugin-dir`:

```bash
npm install -g @github/copilot
git clone https://github.com/rlpatrao/copilot-harness-forge.git ~/harness-forge
mkdir my-app && cd my-app && git init
copilot --plugin-dir ~/harness-forge     # accept the folder-trust prompt
> /scaffold                              # or: say hi, then /auto
```

The plugin's hooks reference their bundled scripts via `${COPILOT_PLUGIN_ROOT}`,
so they run from any project; Copilot passes *your* project's cwd in each hook's
stdin, so the forge operates on your app. Verified live: skills load in-session
and hooks fire (`session-start` + Stop-event hooks) in a separate project.
`copilot plugin install rlpatrao/copilot-harness-forge` makes it permanent.

### Install (forge development — regenerate the tree)

Prerequisites: Node.js 22+, npm 10+, an active GitHub Copilot seat.

```bash
npm install -g @github/copilot     # the agentic Copilot CLI (not `gh copilot`)
copilot --version
```

### Generate / refresh the Copilot install tree

The `.github/` tree is **generated** from the forge's Claude-Code sources. After
editing any hook, agent, command, `settings.json`, or `.claude-plugin/plugin.json`,
regenerate and commit:

```bash
node scripts/export-to-copilot.js       # runs all four exporters
git add .github/ && git commit -m "chore: regenerate Copilot export tree"
```

This produces:

| Path | Generated from | Exporter |
|---|---|---|
| `.github/hooks/*.json` | `settings.json` `hooks` block | `export-hooks-to-copilot.js` |
| `.github/agents/*.agent.md` | `agents/*.md` (+ `config/workflows.yaml` model routing) | `export-agents-to-copilot.js` |
| `.github/commands/*.md` | `commands/*.md` | `export-commands-to-copilot.js` |
| `.github/skills/*/SKILL.md` | `skills/*/` (mirrored) | `export-skills-to-copilot.js` |
| `.github/mcp.json` | `.claude-plugin/plugin.json` `mcpServers` | `export-mcp-to-copilot.js` |

Paths and schemas were verified against **Copilot CLI 1.0.73** during the v3.5
dogfood (`copilot mcp list` and `copilot skill list` load the workspace tree;
see [`brd/v3.5-copilot-dogfood-runbook.md`](brd/v3.5-copilot-dogfood-runbook.md)
§ Dogfood findings).

Do not hand-edit files under `.github/` — they carry a `# generated-from:` banner
and are overwritten on the next export. Edit the forge source and re-run.

### The one behavioral switch: `COPILOT=1`

Claude Code and Copilot agree on hook semantics (exit codes, `decision:"block"`
+ `reason`, permission verdicts) but differ on the envelope for injected
context. Claude Code wraps it in `hookSpecificOutput`; Copilot expects a flat
object. [`hooks/lib/output.js`](hooks/lib/output.js) emits both — flat when the
environment has `COPILOT=1`, wrapped otherwise. Each generated hook is a bash
wrapper under `.github/hooks/run/<name>.sh` that sets `COPILOT=1` and execs the
node hook, so no manual export is needed.

> **Hooks require a trusted folder.** Copilot only runs repo hooks when the
> folder is trusted. On first interactive run, accept the trust prompt; for
> headless use, seed `~/.copilot/settings.json` → `trustedFolders: ["<repo abs
> path>"]`. Without trust, hooks silently don't fire. (Verified live: with trust
> + the correct schema, a session drove `state/fire-log.jsonl` from 53 → 418
> across 35 hooks.)

For the CLI session itself:

```bash
# headless, non-interactive (cloud-agent-compatible):
COPILOT=1 AUTO_ADVANCE_ON_ARCHITECTURE_APPROVED=1 copilot --print /auto
```

### Model routing (no BYOK)

Copilot runs models through its own inference — you cannot bring your own key, so
`config/workflows.yaml`'s per-workflow provider/failover routing does not apply
at runtime. The agent exporter reads `workflows.yaml` and bakes a **static**,
**real Copilot roster** model id (e.g. `claude-opus-4.7`, `claude-sonnet-4.6`,
`claude-haiku-4.5`) into each `.agent.md`'s `model:` field. Every resolved id is
validated against Copilot 1.0.73's roster at export time; an unknown id prints a
`WARN`. `workflows.yaml` remains the human-readable per-workflow spec and the
source of truth the exporter resolves from. To adjust the map, edit `MODEL_MAP` /
`VALID_MODELS` in [`scripts/lib/copilot-export.js`](scripts/lib/copilot-export.js).

### Cloud coding agent (optional)

The v3.4 headless design (`--brd --arch --auto-approve` +
`AUTO_ADVANCE_ON_ARCHITECTURE_APPROVED=1`) already fits Copilot's cloud-agent
constraints (single writable `/workspace`, `bash`-only hooks, no interactive
prompts). Wiring an autonomous-PR GitHub Actions workflow is deferred to a v3.5.7
follow-up.

## Verifying a Copilot run against Claude Code

After a Copilot dogfood run, compare hook-firing parity against a Claude Code
baseline:

```bash
node scripts/copilot-parity-check.js state/fire-log.jsonl
```

Runbook: [`brd/v3.5-copilot-dogfood-runbook.md`](brd/v3.5-copilot-dogfood-runbook.md).
