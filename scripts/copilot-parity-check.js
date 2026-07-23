#!/usr/bin/env node
// Copilot ↔ Claude Code hook-firing parity check (BRD v3.5 §9 increment 6 / §7).
//
// Every hook appends {ts, hook} to state/fire-log.jsonl via hooks/lib/fire-log.js.
// After a Copilot dogfood run, this compares which hooks fired against either:
//   (a) the hooks registered in settings.json (coverage report), or
//   (b) a Claude Code baseline fire-log (parity diff), with --baseline <path>.
//
// Usage:
//   node scripts/copilot-parity-check.js [copilot-fire-log.jsonl]
//   node scripts/copilot-parity-check.js copilot.jsonl --baseline claude.jsonl
//
// Exit 0 = parity OK / full coverage; exit 1 = a hook fired in one run but not
// the other (parity break) — the signal to investigate during §7 convergence.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readFireLog(p) {
  const counts = {};
  if (!fs.existsSync(p)) return counts;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      const rec = JSON.parse(s);
      if (rec && rec.hook) counts[rec.hook] = (counts[rec.hook] || 0) + 1;
    } catch (_) { /* skip malformed */ }
  }
  return counts;
}

// All hook script basenames registered in settings.json (what *could* fire).
function registeredHooks() {
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, 'settings.json'), 'utf8'));
  const names = new Set();
  for (const groups of Object.values(settings.hooks || {})) {
    for (const g of groups) {
      for (const h of g.hooks || []) {
        const m = /([A-Za-z0-9_-]+)\.js/.exec(h.command || '');
        if (m) names.add(m[1]);
      }
    }
  }
  return names;
}

function main() {
  const args = process.argv.slice(2);
  const baselineIdx = args.indexOf('--baseline');
  const baselinePath = baselineIdx >= 0 ? args[baselineIdx + 1] : null;
  const logPath = args.find((a, i) => !a.startsWith('--') && i !== baselineIdx + 1)
    || path.join(ROOT, 'state', 'fire-log.jsonl');

  const fired = readFireLog(logPath);
  const firedSet = new Set(Object.keys(fired));
  process.stdout.write(`Copilot fire-log: ${logPath}\n`);
  process.stdout.write(`  ${firedSet.size} distinct hook(s) fired, ${Object.values(fired).reduce((a, b) => a + b, 0)} total fires\n\n`);

  let broken = 0;

  if (baselinePath) {
    // Parity diff: Copilot vs Claude Code baseline.
    const base = readFireLog(baselinePath);
    const baseSet = new Set(Object.keys(base));
    const onlyClaude = [...baseSet].filter((h) => !firedSet.has(h)).sort();
    const onlyCopilot = [...firedSet].filter((h) => !baseSet.has(h)).sort();
    process.stdout.write(`Parity vs baseline: ${baselinePath}\n`);
    process.stdout.write(`  fired in BOTH: ${[...firedSet].filter((h) => baseSet.has(h)).length}\n`);
    if (onlyClaude.length) { process.stdout.write(`  ONLY Claude Code (missing under Copilot): ${onlyClaude.join(', ')}\n`); broken += onlyClaude.length; }
    if (onlyCopilot.length) { process.stdout.write(`  ONLY Copilot (unexpected): ${onlyCopilot.join(', ')}\n`); broken += onlyCopilot.length; }
    if (!broken) process.stdout.write('  ✓ identical hook-firing sets — parity OK\n');
  } else {
    // Coverage report vs registered hooks.
    const registered = registeredHooks();
    const neverFired = [...registered].filter((h) => !firedSet.has(h)).sort();
    process.stdout.write(`Coverage vs settings.json (${registered.size} registered hooks):\n`);
    for (const h of [...firedSet].sort()) {
      process.stdout.write(`  ✓ ${h} (${fired[h]}×)${registered.has(h) ? '' : '  [not in settings.json]'}\n`);
    }
    if (neverFired.length) {
      process.stdout.write(`\n  ${neverFired.length} registered hook(s) never fired in this run:\n    ${neverFired.join(', ')}\n`);
      process.stdout.write('  (expected for a partial run; on a full dogfood these are delete candidates per the cleanup plan)\n');
    }
  }

  process.exit(broken ? 1 : 0);
}

if (require.main === module) main();
module.exports = { readFireLog, registeredHooks };
