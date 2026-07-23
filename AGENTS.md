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

### Install

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
| `.github/copilot-mcp.json` | `.claude-plugin/plugin.json` `mcpServers` | `export-mcp-to-copilot.js` |

Do not hand-edit files under `.github/` — they carry a `# generated-from:` banner
and are overwritten on the next export. Edit the forge source and re-run.

### The one behavioral switch: `COPILOT=1`

Claude Code and Copilot agree on hook semantics (exit codes, `decision:"block"`
+ `reason`, permission verdicts) but differ on the envelope for injected
context. Claude Code wraps it in `hookSpecificOutput`; Copilot expects a flat
object. [`hooks/lib/output.js`](hooks/lib/output.js) emits both — flat when the
environment has `COPILOT=1`, wrapped otherwise. The generated hook commands set
`COPILOT=1` themselves, so no manual export is needed for hooks. For the CLI
session itself:

```bash
# headless, non-interactive (cloud-agent-compatible):
COPILOT=1 AUTO_ADVANCE_ON_ARCHITECTURE_APPROVED=1 copilot --print /auto
```

### Model routing (no BYOK)

Copilot runs models through its own inference — you cannot bring your own key, so
`config/workflows.yaml`'s per-workflow provider/failover routing does not apply
at runtime. The agent exporter reads `workflows.yaml` and bakes a **static**
Copilot model family (`claude-opus` / `claude-sonnet` / `claude-haiku` / `gpt-5`
/ `gemini-2.5-pro`) into each `.agent.md`'s `model:` field. `workflows.yaml`
remains the human-readable per-workflow spec and the source of truth the exporter
resolves from. To change a model family map, edit `MODEL_MAP` in
[`scripts/lib/copilot-export.js`](scripts/lib/copilot-export.js).

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
