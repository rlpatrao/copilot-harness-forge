#!/usr/bin/env node
// Export forge skills → Copilot project skills (BRD v3.5 §6 / discovery).
//
//   Reads:  skills/<name>/SKILL.md (+ any sibling files the skill bundles)
//   Writes: .github/skills/<name>/… (mirror)
//
// Copilot CLI 1.0.73 discovers project skills from .github/skills/,
// .agents/skills/, or .claude/skills/ — verified during the v3.5 dogfood
// (`copilot skill list` surfaced a skill placed at .github/skills/). The
// SKILL.md format is shared, so skills port as-is; they just need to live where
// Copilot looks. We mirror the whole skill directory so reference files travel
// with SKILL.md.
//
// Idempotent. Exit 0 on success, 1 on structural error.

const fs = require('fs');
const path = require('path');
const { ROOT, OUT, ensureDir } = require('./lib/copilot-export.js');

function copyTree(srcDir, destDir) {
  ensureDir(destDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) copyTree(src, dest);
    else if (entry.isFile()) fs.copyFileSync(src, dest);
  }
}

function main() {
  const skillsDir = path.join(ROOT, 'skills');
  if (!fs.existsSync(skillsDir)) { process.stdout.write('export-skills: no skills/ dir — skipped\n'); return; }

  // Fresh mirror so a deleted skill doesn't linger.
  fs.rmSync(OUT.skills, { recursive: true, force: true });
  ensureDir(OUT.skills);

  let count = 0;
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const src = path.join(skillsDir, entry.name);
    if (!fs.existsSync(path.join(src, 'SKILL.md'))) continue; // only real skills
    copyTree(src, path.join(OUT.skills, entry.name));
    count++;
  }
  process.stdout.write(`export-skills: ${count} skill(s) → .github/skills/*/SKILL.md\n`);
}

if (require.main === module) {
  try { main(); } catch (e) { process.stderr.write(`export-skills FAILED: ${e.message}\n`); process.exit(1); }
}
module.exports = { copyTree };
