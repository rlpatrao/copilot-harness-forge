#!/usr/bin/env node

'use strict';


// Cleanup-plan Phase 2 (2026-07-21): fire-log instrumentation.
try { require('./lib/fire-log.js')('graph-refresh'); } catch (_) {}
const { emit } = require('./lib/output.js'); // v3.5 Copilot dual-shape emitter

// Stop-event hook (BRD v3.1 §4, v3.1.9). Drains state/dirty-files.jsonl
// and calls scripts/build-code-graph.js --files <deduped list> to
// re-index only what changed since the last Stop. Truncates the ledger
// on success.
//
// Never blocks Stop. Emits a system reminder with the refresh summary
// via additionalContext. Silent on errors.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let input;
try {
  input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
} catch (_) {
  process.exit(0);
}

const cwd = input.cwd || process.cwd();
const root = findProjectRoot(cwd);
if (!root) process.exit(0);

const ledger = path.join(root, 'state', 'dirty-files.jsonl');
if (!fs.existsSync(ledger)) process.exit(0);

let raw = '';
try { raw = fs.readFileSync(ledger, 'utf8'); } catch (_) { process.exit(0); }
if (!raw.trim()) process.exit(0);

const seen = new Set();
for (const line of raw.split('\n')) {
  if (!line.trim()) continue;
  try {
    const rec = JSON.parse(line);
    if (rec.path) seen.add(rec.path);
  } catch (_) {}
}
if (seen.size === 0) process.exit(0);

const files = [...seen];
const builder = path.join(root, 'scripts', 'build-code-graph.js');
if (!fs.existsSync(builder)) {
  // Nothing to do — script not scaffolded yet
  process.exit(0);
}

let refreshOut = '';
try {
  refreshOut = execFileSync('node', [builder, '--files', ...files], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
  });
} catch (e) {
  // On failure, don't truncate ledger — next Stop will retry
  process.stderr.write(`graph-refresh: build-code-graph.js failed (${e.message}); ledger preserved for retry\n`);
  process.exit(0);
}

// Success — truncate ledger
try { fs.writeFileSync(ledger, ''); } catch (_) {}

const output = {
  hookSpecificOutput: {
    hookEventName: 'Stop',
    additionalContext: `**graph-refresh (BRD v3.1 §4 v3.1.9):** re-indexed ${files.length} file${files.length === 1 ? '' : 's'} into state/code-graph.json and state/symbol-map.md.\n\n${refreshOut.trim().split('\n').slice(-3).map(l => '  ' + l).join('\n')}`,
  },
};

emit(output);
process.exit(0);

function findProjectRoot(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    if (
      fs.existsSync(path.join(current, 'feature_list.json')) ||
      fs.existsSync(path.join(current, '.claude')) ||
      fs.existsSync(path.join(current, '.git'))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
