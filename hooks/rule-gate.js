#!/usr/bin/env node

'use strict';


// Cleanup-plan Phase 2 (2026-07-21): fire-log instrumentation.
try { require('./lib/fire-log.js')('rule-gate'); } catch (_) {}
const { emit } = require('./lib/output.js'); // v3.5 Copilot dual-shape emitter

// PreToolUse hook — the enforcement half of the TRACE compiled-rule
// pipeline (BRD v3.3 §3.5). Loads state/compiled-rules.json and for
// each rule where check.kind === "pattern" and applies_when matches
// the pending tool + target path:
//   - severity "block"  → exit 2 with { decision: "block", reason }
//   - severity "warn"   → exit 0 with an advisory reminder in
//                          hookSpecificOutput.additionalContext
//   - anything else     → skip
//
// False-positive escape hatch (BRD v3.3 §3.5):
//   If RULE_GATE_OVERRIDE=<rule_id> is set in the environment when a
//   BLOCKing rule fires, the block is downgraded to an audit-only
//   PASS, and false_positive_overrides on that rule is incremented in
//   compiled-rules.json. The next /rules promote-tentative pass will
//   see the override count and refuse to auto-promote that rule to
//   confirmed/block. Warns are always overridable — an override on a
//   warn also increments the counter.
//
// Semantic rules (check.kind === "semantic") are NOT evaluated here.
// They flow through agents/critic.md via the learned-rules injection
// path — see BRD v3.3 §3.7. This hook stays synchronous and cheap.
//
// Defensive: on any parse / I/O / regex-compile error, exit 0 (fail
// open). The rest of the PreToolUse chain still runs. A bad
// compiled-rules.json must never brick the forge.

const fs = require('fs');
const path = require('path');

let input;
try {
  input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
} catch (_) {
  process.exit(0);
}

const toolName = input.tool_name || '';
if (!['Edit', 'Write', 'Bash'].includes(toolName)) process.exit(0);

const cwd = input.cwd || process.cwd();
const projectRoot = findProjectRoot(cwd) || cwd;

const rulesPath = path.join(projectRoot, 'state', 'compiled-rules.json');
if (!fs.existsSync(rulesPath)) process.exit(0);

let doc;
try {
  doc = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
} catch (_) {
  process.exit(0);
}
if (!doc || !Array.isArray(doc.rules) || doc.rules.length === 0) process.exit(0);

// Extract candidate check inputs from the tool_input.
const ti = input.tool_input || {};
let subjectPath = null;
let subjectContent = '';

if (toolName === 'Edit') {
  subjectPath = ti.file_path || null;
  // Edit's new content is new_string; also consider replace_all body if present
  subjectContent = String(ti.new_string || '');
} else if (toolName === 'Write') {
  subjectPath = ti.file_path || null;
  subjectContent = String(ti.content || '');
} else if (toolName === 'Bash') {
  subjectPath = null;   // bash has no target file per se
  subjectContent = String(ti.command || '');
}

const relPath = subjectPath ? path.relative(projectRoot, path.resolve(cwd, subjectPath)) : null;

const overrideId = (process.env.RULE_GATE_OVERRIDE || '').trim();

const warns = [];
const blocks = [];

for (const rule of doc.rules) {
  if (!rule || typeof rule !== 'object') continue;
  if (rule.status !== 'confirmed' && rule.status !== 'tentative') continue;
  if (!rule.check || rule.check.kind !== 'pattern') continue;

  // Tool filter
  const appliesTo = (rule.applies_when && Array.isArray(rule.applies_when.tools))
    ? rule.applies_when.tools
    : ['Edit', 'Write'];   // default sensible: Edit/Write only
  if (!appliesTo.includes(toolName)) continue;

  // Path filter (Edit/Write only)
  if (relPath && rule.applies_when && rule.applies_when.path_glob) {
    if (!globMatch(rule.applies_when.path_glob, relPath)) continue;
  }

  // Pattern evaluation
  let hit = false;
  try {
    if (rule.check.test === 'regex') {
      const re = new RegExp(rule.check.value, rule.check.flags || '');
      hit = re.test(subjectContent);
    } else if (rule.check.test === 'substring') {
      hit = subjectContent.indexOf(rule.check.value) !== -1;
    } else if (rule.check.test === 'forbid-substring') {
      hit = subjectContent.indexOf(rule.check.value) !== -1;
    } else {
      continue;  // unknown test kind — skip
    }
  } catch (_) {
    continue;  // malformed regex etc. — never crash
  }

  if (!hit) continue;

  // Match. Decide severity.
  const sev = rule.severity || (rule.status === 'confirmed' ? 'block' : 'warn');
  if (sev === 'block') {
    if (overrideId && overrideId === rule.rule_id) {
      // Escape hatch: downgrade to audit, increment counter
      incrementFalsePositive(rulesPath, rule.rule_id);
      process.stderr.write(`OVERRIDE (rule-gate): rule ${rule.rule_id} block downgraded via RULE_GATE_OVERRIDE. false_positive_overrides incremented; rule cannot auto-promote until Critic re-validates.\n`);
    } else {
      blocks.push(rule);
    }
  } else if (sev === 'warn') {
    // Warn overrides also count (informative — helps /rules see noisy rules)
    if (overrideId && overrideId === rule.rule_id) {
      incrementFalsePositive(rulesPath, rule.rule_id);
    }
    warns.push(rule);
  }
}

// Hard block wins.
if (blocks.length > 0) {
  const primary = blocks[0];
  const others = blocks.slice(1);
  process.stderr.write(`BLOCKED (rule-gate, BRD v3.3): ${primary.statement}\n`);
  process.stderr.write(`  rule_id: ${primary.rule_id}\n`);
  if (primary.why) process.stderr.write(`  why: ${primary.why}\n`);
  if (relPath) process.stderr.write(`  target: ${relPath}\n`);
  process.stderr.write(`  pattern: ${primary.check.test}=/${primary.check.value}/${primary.check.flags || ''}\n`);
  if (others.length > 0) {
    process.stderr.write(`  (+ ${others.length} more rule(s) also matched: ${others.map(r => r.rule_id).join(', ')})\n`);
  }
  process.stderr.write('\nEscape hatch (documented in BRD v3.3 §3.5):\n');
  process.stderr.write(`  RULE_GATE_OVERRIDE=${primary.rule_id} <original command>\n`);
  process.stderr.write('  Increments false_positive_overrides on the rule; the rule cannot auto-promote to confirmed/block until Critic re-validates.\n');
  process.exit(2);
}

// Warns → advisory context injection
if (warns.length > 0) {
  const lines = warns.map(w => `- **${w.rule_id}** (${w.status}, warn): ${w.statement}` + (w.why ? ` — ${w.why}` : ''));
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: `**Rule warnings (rule-gate, BRD v3.3):** the pending ${toolName}${relPath ? ` on \`${relPath}\`` : ''} matches ${warns.length} tentative rule(s):\n\n${lines.join('\n')}\n\n_These are TENTATIVE rules — they warn but do not block. If a warn is a false positive, use \`RULE_GATE_OVERRIDE=<rule_id>\` (increments the counter and blocks auto-promotion to confirmed/block until Critic re-validates)._`,
    },
  };
  emit(output);
}

process.exit(0);

// -- helpers --

function incrementFalsePositive(rulesPath, ruleId) {
  try {
    const raw = fs.readFileSync(rulesPath, 'utf8');
    const doc = JSON.parse(raw);
    if (!Array.isArray(doc.rules)) return;
    for (const r of doc.rules) {
      if (r && r.rule_id === ruleId) {
        r.false_positive_overrides = (r.false_positive_overrides || 0) + 1;
        r.last_override_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      }
    }
    fs.writeFileSync(rulesPath, JSON.stringify(doc, null, 2) + '\n');
  } catch (_) { /* defensive — never crash */ }
}

// Minimal glob matcher — supports **, *, and literal segments.
// Not a full picomatch, but covers "src/**", "**/*.ts", "docs/*.md".
function globMatch(pattern, subject) {
  if (!pattern) return true;
  const re = globToRegExp(pattern);
  return re.test(subject);
}

function globToRegExp(pattern) {
  // Escape regex metacharacters except * and ?
  let re = '';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      // ** — match anything including /
      if (pattern[i + 2] === '/') { re += '(?:.*/)?'; i += 3; }
      else { re += '.*'; i += 2; }
    } else if (c === '*') {
      re += '[^/]*';
      i++;
    } else if (c === '?') {
      re += '[^/]';
      i++;
    } else if ('/.+^$(){}[]|\\'.includes(c)) {
      re += '\\' + c;
      i++;
    } else {
      re += c;
      i++;
    }
  }
  return new RegExp('^' + re + '$');
}

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
