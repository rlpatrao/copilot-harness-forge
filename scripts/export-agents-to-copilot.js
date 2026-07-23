#!/usr/bin/env node
// Export forge agents → Copilot custom agents (BRD v3.5 §6c / §4).
//
//   Reads:  agents/*.md
//   Writes: .github/agents/<name>.agent.md
//
// Frontmatter mapping:
//   name             → name            (unchanged)
//   description      → description     (unchanged)
//   model / model_preference / {{model:<wf>}}
//                    → model           (resolved to a Copilot family slug via
//                                       workflows.yaml — BRD v3.5 §4, static
//                                       per-agent binding since Copilot has no BYOK)
//   tools            → tools           (Read, Write → read, write — Copilot names)
//
// Body: copied verbatim, except any {{model:<wf>}} placeholders are resolved to
// their workflows.yaml primary so no unresolved templating leaks to Copilot.
//
// Idempotent. Exit 0 on success, 1 on structural error.

const fs = require('fs');
const path = require('path');
const {
  ROOT, OUT, parseFrontmatter, resolveAgentModel, toCopilotTools, loadWorkflows, toCopilotModel, ensureDir,
} = require('./lib/copilot-export.js');

function resolveBodyPlaceholders(body) {
  return body.replace(/\{\{model:([\w-]+)\}\}/g, (whole, wf) => {
    const w = loadWorkflows()[wf];
    return w && w.primary ? toCopilotModel(w.primary) : whole;
  });
}

function buildAgent(src) {
  const { attrs, body } = parseFrontmatter(src);
  const { model, source, primary } = resolveAgentModel(attrs.model, attrs.model_preference);
  const tools = toCopilotTools(attrs.tools);

  const fm = ['---'];
  if (attrs.name) fm.push(`name: ${attrs.name}`);
  if (attrs.description) fm.push(`description: ${attrs.description}`);
  if (model) fm.push(`model: ${model}`);
  if (tools.length) fm.push(`tools: ${tools.join(', ')}`);
  // Provenance so a reader knows where model/tools came from (not read by Copilot).
  fm.push(`# generated-from: agents/${attrs.name || '?'}.md`);
  fm.push(`# model-source: ${source}${primary ? ` (${primary})` : ''}`);
  fm.push('---');

  return { name: attrs.name, content: fm.join('\n') + '\n' + resolveBodyPlaceholders(body).replace(/^\n+/, '\n') };
}

function main() {
  const agentsDir = path.join(ROOT, 'agents');
  const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'));

  ensureDir(OUT.agents);
  for (const f of fs.readdirSync(OUT.agents).filter((f) => f.endsWith('.agent.md'))) {
    fs.unlinkSync(path.join(OUT.agents, f));
  }

  let written = 0;
  for (const f of files) {
    const src = fs.readFileSync(path.join(agentsDir, f), 'utf8');
    const { name, content } = buildAgent(src);
    const outName = `${name || path.basename(f, '.md')}.agent.md`;
    fs.writeFileSync(path.join(OUT.agents, outName), content);
    written++;
  }
  process.stdout.write(`export-agents: ${written} agent(s) → .github/agents/*.agent.md\n`);
}

if (require.main === module) {
  try { main(); } catch (e) { process.stderr.write(`export-agents FAILED: ${e.message}\n`); process.exit(1); }
}
module.exports = { buildAgent, resolveBodyPlaceholders };
