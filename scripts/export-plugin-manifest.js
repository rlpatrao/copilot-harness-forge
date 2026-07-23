#!/usr/bin/env node
// Export the Copilot plugin manifest (BRD v3.5 — plugin packaging).
//
//   Writes: plugin.json at the repo root
//
// Makes the forge repo itself a GitHub Copilot CLI plugin, so it can be loaded
// into ANY project via `copilot --plugin-dir <forge>` (the direct equivalent of
// Claude Code's `--plugin-dir`) or installed with `copilot plugin install
// rlpatrao/copilot-harness-forge`. plugin.json points at the generated .github/
// component trees; hooks resolve their bundled scripts via ${COPILOT_PLUGIN_ROOT}
// (verified live: the plugin's hooks fire in a separate project and receive that
// project's cwd in their stdin payload, so the forge hooks target the user's
// project — not the plugin).
//
// Idempotent. Exit 0 on success, 1 on structural error.

const fs = require('fs');
const path = require('path');
const { ROOT } = require('./lib/copilot-export.js');

function main() {
  let version = '3.5.0';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    if (pkg.version) version = String(pkg.version).replace(/-.*$/, ''); // strip -alpha etc.
  } catch (_) { /* fall back to default */ }

  const manifest = {
    name: 'harness-forge',
    description: 'GAN-inspired autonomous SDLC harness — 20 agents, 53 skills, 36 hooks, a 12-gate quality ratchet, and a feature_list.json contract. Runs on Claude Code and GitHub Copilot CLI.',
    version,
    license: 'MIT',
    repository: 'https://github.com/rlpatrao/copilot-harness-forge',
    keywords: ['sdlc', 'autonomous-agents', 'verification', 'ratchet', 'copilot', 'claude-code'],
    // Component paths — resolved relative to the plugin root by Copilot.
    // - skills point at the canonical root skills/ (already SKILL.md format;
    //   VERIFIED loading in-session cross-project via --plugin-dir).
    // - agents must use the generated .github/agents (Copilot needs .agent.md,
    //   the root agents/ are Claude-format .md).
    agents: '.github/agents',
    skills: 'skills',
    commands: '.github/commands',
    hooks: '.github/plugin-hooks.json',
    mcpServers: '.github/mcp.json',
  };

  fs.writeFileSync(path.join(ROOT, 'plugin.json'), JSON.stringify(manifest, null, 2) + '\n');
  process.stdout.write(`export-plugin-manifest: plugin.json (name=${manifest.name}, v${version})\n`);
}

if (require.main === module) {
  try { main(); } catch (e) { process.stderr.write(`export-plugin-manifest FAILED: ${e.message}\n`); process.exit(1); }
}
module.exports = { main };
