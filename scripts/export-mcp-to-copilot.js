#!/usr/bin/env node
// Export MCP server declarations → Copilot workspace MCP config (BRD v3.5 §6e).
//
//   Reads:  .claude-plugin/plugin.json  (the `mcpServers` block)
//   Writes: .github/mcp.json
//
// Schema verified against Copilot CLI 1.0.73 during the v3.5 dogfood
// (`copilot mcp add … --json` round-trip + `copilot mcp list` confirming the
// workspace file loads):
//
//   { "mcpServers": { "<name>": { "type": "local", "command": …, "args": […],
//                                 "tools": ["*"] } } }
//
// `tools: ["*"]` auto-approves every tool on the server — the forge's MCP use is
// non-interactive verification automation (BRD §3.8 / v3.5 §5). No `autoApprove`
// key exists in Copilot's schema; `tools:["*"]` is the mechanism.
//
// Idempotent. Exit 0 on success, 1 on structural error.

const fs = require('fs');
const path = require('path');
const { ROOT, OUT } = require('./lib/copilot-export.js');

function toCopilotServer(decl) {
  const server = { type: 'local', command: decl.command, args: decl.args || [], tools: ['*'] };
  return server;
}

function main() {
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  const servers = plugin.mcpServers || {};

  const mcpServers = {};
  for (const [name, decl] of Object.entries(servers)) {
    mcpServers[name] = toCopilotServer(decl);
  }

  // Copilot parses this file strictly — keep it to the exact schema, no banner
  // keys. Provenance lives in AGENTS.md / the exporter, not the JSON.
  fs.writeFileSync(OUT.mcp, JSON.stringify({ mcpServers }, null, 2) + '\n');
  process.stdout.write(`export-mcp: ${Object.keys(mcpServers).length} MCP server(s) → .github/mcp.json\n`);
}

if (require.main === module) {
  try { main(); } catch (e) { process.stderr.write(`export-mcp FAILED: ${e.message}\n`); process.exit(1); }
}
module.exports = { toCopilotServer };
