#!/usr/bin/env node
// Export forge slash commands → Copilot custom slash commands (BRD v3.5 §6d).
//
//   Reads:  commands/*.md
//   Writes: .github/commands/<name>.md
//
// Copilot custom commands are Markdown with frontmatter. Our frontmatter
// (description, argument-hint, name) already aligns; $ARGUMENTS is the shared
// substitution token. Body is copied verbatim except {{model:<wf>}} placeholders
// are resolved (same reasoning as agents). The command's slash name is its
// filename stem, matching Copilot's discovery convention.
//
// Idempotent. Exit 0 on success, 1 on structural error.

const fs = require('fs');
const path = require('path');
const { ROOT, OUT, parseFrontmatter, ensureDir } = require('./lib/copilot-export.js');
const { resolveBodyPlaceholders } = require('./export-agents-to-copilot.js');

function buildCommand(src, stem) {
  const { attrs, body } = parseFrontmatter(src);
  const fm = ['---'];
  if (attrs.name) fm.push(`name: ${attrs.name}`);
  if (attrs.description) fm.push(`description: ${attrs.description}`);
  if (attrs['argument-hint']) fm.push(`argument-hint: ${attrs['argument-hint']}`);
  fm.push(`# generated-from: commands/${stem}.md`);
  fm.push('---');
  return fm.join('\n') + '\n' + resolveBodyPlaceholders(body).replace(/^\n+/, '\n');
}

function main() {
  const cmdDir = path.join(ROOT, 'commands');
  const files = fs.readdirSync(cmdDir).filter((f) => f.endsWith('.md'));

  ensureDir(OUT.commands);
  for (const f of fs.readdirSync(OUT.commands).filter((f) => f.endsWith('.md'))) {
    fs.unlinkSync(path.join(OUT.commands, f));
  }

  let written = 0;
  for (const f of files) {
    const stem = path.basename(f, '.md');
    const src = fs.readFileSync(path.join(cmdDir, f), 'utf8');
    fs.writeFileSync(path.join(OUT.commands, f), buildCommand(src, stem));
    written++;
  }
  process.stdout.write(`export-commands: ${written} command(s) → .github/commands/*.md\n`);
}

if (require.main === module) {
  try { main(); } catch (e) { process.stderr.write(`export-commands FAILED: ${e.message}\n`); process.exit(1); }
}
module.exports = { buildCommand };
