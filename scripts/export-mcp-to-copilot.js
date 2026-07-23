#!/usr/bin/env node
// Export MCP server declarations → Copilot MCP config (BRD v3.5 §6e / §5e).
//
//   Reads:  .claude-plugin/plugin.json  (the `mcpServers` block)
//   Writes: .github/copilot-mcp.json
//
// Copilot supports MCP servers with auto-approve at server + tool level. We
// translate our declarations to Copilot's config and default the browser MCP
// (Playwright) to auto-approved, since the E2E gate (BRD §3.8) is non-interactive
// and cloud-agent runs cannot answer Y/N prompts (BRD v3.5 §5).
//
// Idempotent. Exit 0 on success, 1 on structural error.

const fs = require('fs');
const path = require('path');
const { ROOT, OUT } = require('./lib/copilot-export.js');

function toCopilotServer(name, decl) {
  return {
    command: decl.command,
    args: decl.args || [],
    // Auto-approve the whole server: the forge's MCP use is verification
    // automation with no interactive confirmation available (BRD v3.5 §5).
    tools: ['*'],
    autoApprove: true,
    _purpose: decl.purpose || undefined,
  };
}

function main() {
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  const servers = plugin.mcpServers || {};

  const mcpServers = {};
  const notes = [];
  for (const [name, decl] of Object.entries(servers)) {
    mcpServers[name] = toCopilotServer(name, decl);
    // Preserve documented alternatives (e.g. puppeteer) as commented siblings.
    for (const alt of decl.alternatives || []) {
      notes.push(`alternative for ${name}: ${alt.name} (${alt.command} ${(alt.args || []).join(' ')}) — ${alt.rationale || ''}`);
    }
  }

  const doc = {
    $generated: 'scripts/export-mcp-to-copilot.js from .claude-plugin/plugin.json — do not edit by hand',
    $notes: notes,
    mcpServers,
  };
  fs.writeFileSync(OUT.mcp, JSON.stringify(doc, null, 2) + '\n');
  process.stdout.write(`export-mcp: ${Object.keys(mcpServers).length} MCP server(s) → .github/copilot-mcp.json\n`);
}

if (require.main === module) {
  try { main(); } catch (e) { process.stderr.write(`export-mcp FAILED: ${e.message}\n`); process.exit(1); }
}
module.exports = { toCopilotServer };
