# Copilot instructions — Claude Harness Forge

GitHub Copilot reads this file as custom instructions for every session in this
repo. It is intentionally thin: the operating contract is not duplicated here.

**Read, in order:**

1. [`AGENTS.md`](../AGENTS.md) — the Copilot runtime layer: install, the
   `COPILOT=1` output switch, model routing, how to regenerate the `.github/`
   tree.
2. [`CLAUDE.md`](../CLAUDE.md) — the full forge contract (12-gate ratchet,
   `feature_list.json`, GAN architecture, agents/skills/hooks inventory). Source
   of truth.

## Copilot-native install surface

This repo ships as a Copilot install, not only a `claude --plugin-dir` plugin:

- **Agents** → `.github/agents/*.agent.md`
- **Slash commands** → `.github/commands/*.md`
- **Hooks** → `.github/hooks/*.json`
- **MCP servers** → `.github/copilot-mcp.json` (Playwright, auto-approved)

Everything under `.github/` is **generated** from the forge's Claude-Code
sources and carries a `# generated-from:` banner. Do not hand-edit it. After
changing any hook, agent, command, `settings.json`, or `.claude-plugin/plugin.json`:

```bash
node scripts/export-to-copilot.js
```

then commit the regenerated `.github/` tree.

## Runtime note

Hooks emit a flat output shape under Copilot; the generated hook commands set
`COPILOT=1` themselves. For a headless, cloud-agent-compatible session:

```bash
COPILOT=1 AUTO_ADVANCE_ON_ARCHITECTURE_APPROVED=1 copilot --print /auto
```
