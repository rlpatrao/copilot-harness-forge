#!/usr/bin/env node
// Orchestrator for the v3.5 Copilot port (BRD v3.5 §9 increment 2 & 5).
//
// Regenerates the entire .github/ Copilot install tree from forge sources:
//   .github/hooks/*.json         ← settings.json
//   .github/agents/*.agent.md    ← agents/*.md  (+ workflows.yaml model routing)
//   .github/commands/*.md        ← commands/*.md
//   .github/copilot-mcp.json     ← .claude-plugin/plugin.json
//
// Run after editing any forge source, then commit the .github/ tree.
//   node scripts/export-to-copilot.js
//
// Each sub-exporter is independently runnable; this just chains them and fails
// loudly if any one fails.

const { execFileSync } = require('child_process');
const path = require('path');

const steps = [
  'export-hooks-to-copilot.js',
  'export-agents-to-copilot.js',
  'export-commands-to-copilot.js',
  'export-skills-to-copilot.js',
  'export-mcp-to-copilot.js',
  'export-plugin-manifest.js',
];

let failed = 0;
for (const step of steps) {
  try {
    const out = execFileSync('node', [path.join(__dirname, step)], { encoding: 'utf8' });
    process.stdout.write(out);
  } catch (e) {
    failed++;
    process.stderr.write(`FAILED: ${step}\n${e.stdout || ''}${e.stderr || ''}\n`);
  }
}

if (failed) {
  process.stderr.write(`\nexport-to-copilot: ${failed} step(s) failed\n`);
  process.exit(1);
}
process.stdout.write('\nexport-to-copilot: .github/ Copilot install tree regenerated. Commit it.\n');
