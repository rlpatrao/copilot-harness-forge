#!/usr/bin/env node

'use strict';


// Cleanup-plan Phase 2 (2026-07-21): fire-log instrumentation.
try { require('./lib/fire-log.js')('correction-detector'); } catch (_) {}
const { emit } = require('./lib/output.js'); // v3.5 Copilot dual-shape emitter

// Stop-event hook (BRD v3.3 §3.3). Runs AFTER instinct-extractor.js
// in the same curation pass. Reads state/rejections.jsonl (produced
// by Critic BLOCK verdicts, e2e-gate rejections, feature-edit-guard
// rejections, and ratchet gate failures), groups by normalized
// reason+source, and emits a candidate under state/rule-candidates/
// for any group seen >= 2 times.
//
// The candidate includes a *proposed* check spec:
//   - If we can lift a stable pattern from the `excerpt` field
//     (regex or substring), it's a "pattern" candidate — a strong
//     lead for a hard-block rule.
//   - Else, the candidate is "semantic" — the reason text becomes the
//     NL test the Critic will evaluate.
//
// Dedup via state/.rule-candidate-hashes.txt (mirrors
// instincts/.seen-hashes.txt).
//
// Defensive: exit 0 on any error. Never writes to compiled-rules.json
// or skills/ — only to state/rule-candidates/.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let input;
try {
  input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
} catch (_) {
  process.exit(0);
}

const cwd = input.cwd || process.cwd();
const projectRoot = findProjectRoot(cwd);
if (!projectRoot) process.exit(0);

const rejectionsPath = path.join(projectRoot, 'state', 'rejections.jsonl');
const candidatesDir = path.join(projectRoot, 'state', 'rule-candidates');
const seenHashesPath = path.join(projectRoot, 'state', '.rule-candidate-hashes.txt');

if (!fs.existsSync(rejectionsPath)) process.exit(0);
try { fs.mkdirSync(candidatesDir, { recursive: true }); } catch (_) {}

// Load rejections (all-time — we mine across sessions)
let rejections = [];
try {
  rejections = fs.readFileSync(rejectionsPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch (_) { return null; }
    })
    .filter(Boolean);
} catch (_) { process.exit(0); }

if (rejections.length === 0) process.exit(0);

// Load seen hashes
const seenHashes = new Set();
if (fs.existsSync(seenHashesPath)) {
  try {
    fs.readFileSync(seenHashesPath, 'utf8')
      .split('\n').filter(Boolean).forEach(h => seenHashes.add(h.trim()));
  } catch (_) {}
}

// Group by (source, normalized reason).
// Normalization: lowercase, strip file/line references, strip common
// prefixes ("BLOCKED:", "FAIL:"), collapse whitespace, cap at 200 chars.
const groups = new Map();

for (const r of rejections) {
  const source = r.source || 'unknown';
  const norm = normalizeReason(r.reason || '');
  if (!norm) continue;
  const key = `${source}::${norm}`;
  if (!groups.has(key)) {
    groups.set(key, { source, normalized: norm, records: [], sessions: new Set() });
  }
  const g = groups.get(key);
  g.records.push(r);
  if (r.session_id) g.sessions.add(r.session_id);
}

// Threshold: >= 2 OCCURRENCES. Sessions are informational.
// (Plan §3.3: "a group seen >= 2 times becomes a candidate".)
const MIN_OCCURRENCES = 2;
const candidatesEmitted = [];

for (const [key, g] of groups) {
  if (g.records.length < MIN_OCCURRENCES) continue;
  const hash = sha1_12(key);
  if (seenHashes.has(hash)) continue;   // already promoted or already emitted

  // Try to synthesize a pattern from the excerpts.
  const proposal = proposeCheck(g.records);

  const candidate = {
    candidate_id: hash,
    proposed_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    source: g.source,
    normalized_reason: g.normalized,
    occurrences: g.records.length,
    sessions_seen: g.sessions.size,
    proposed_statement: proposal.statement,
    proposed_check: proposal.check,
    proposed_applies_when: proposal.applies_when,
    sample_records: g.records.slice(0, 5).map(r => ({
      ts: r.ts, file: r.file, tool: r.tool, excerpt: r.excerpt, verdict: r.verdict
    })),
    lifecycle_status: 'candidate',
    critic_verdict: null,
  };

  const outPath = path.join(candidatesDir, `${hash}.json`);
  try {
    fs.writeFileSync(outPath, JSON.stringify(candidate, null, 2));
    seenHashes.add(hash);
    candidatesEmitted.push({ hash, key: g.normalized });
  } catch (_) {}
}

// Persist seen hashes
try {
  fs.writeFileSync(seenHashesPath, [...seenHashes].join('\n') + '\n');
} catch (_) {}

if (candidatesEmitted.length === 0) process.exit(0);

// Emit an additionalContext note so the user/model notices new candidates
const output = {
  hookSpecificOutput: {
    hookEventName: 'Stop',
    additionalContext: `**correction-detector (BRD v3.3):** wrote ${candidatesEmitted.length} new rule candidate(s) to state/rule-candidates/. Run \`/rules status\` to inspect and \`/rules promote-candidates\` to run them through the Critic.\n\n${candidatesEmitted.slice(0, 5).map(c => `- ${c.hash}: ${truncate(c.key, 80)}`).join('\n')}`,
  },
};
emit(output);
process.exit(0);

// -- helpers --

function normalizeReason(text) {
  if (!text || typeof text !== 'string') return '';
  let s = text.trim();
  // Strip common prefixes the producers add
  s = s.replace(/^\s*BLOCKED\s*[:\-]\s*/i, '');
  s = s.replace(/^\s*FAIL(?:ED)?\s*[:\-]\s*/i, '');
  s = s.replace(/^\s*ERROR\s*[:\-]\s*/i, '');
  // Strip file:line references so "hardcoded secret in src/auth.ts:42"
  // and "hardcoded secret in src/api.ts:9" group together
  s = s.replace(/\b[\w./-]+\.[a-z]{1,5}:\d+/gi, '<file:line>');
  // Strip lone paths too
  s = s.replace(/\b[\w./-]+\.[a-z]{1,5}\b/gi, '<file>');
  // Strip hex hashes (git shas, etc.)
  s = s.replace(/\b[0-9a-f]{7,40}\b/gi, '<hash>');
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim().toLowerCase();
  return s.slice(0, 200);
}

function proposeCheck(records) {
  const excerpts = records.map(r => r.excerpt).filter(Boolean);
  const files = records.map(r => r.file).filter(Boolean);
  const tools = [...new Set(records.map(r => r.tool).filter(Boolean))];

  // 1. Try to find a common substring across excerpts (>= 6 chars)
  let commonSubstring = null;
  if (excerpts.length >= 2) {
    commonSubstring = longestCommonSubstring(excerpts);
    if (commonSubstring && commonSubstring.length < 6) commonSubstring = null;
    // Filter out purely-whitespace / trivial patterns
    if (commonSubstring && /^[\s\W]+$/.test(commonSubstring)) commonSubstring = null;
  }

  // 2. Try to lift a regex if a well-known pattern appears
  const knownRegex = detectKnownPattern(excerpts);

  const applies_when = {};
  if (tools.length > 0) applies_when.tools = tools;
  const pathGlob = inferPathGlob(files);
  if (pathGlob) applies_when.path_glob = pathGlob;

  const statementBase = records[0].reason || 'unknown correction';

  if (knownRegex) {
    return {
      statement: `Do not use pattern matched by ${knownRegex.name} (recurred: ${statementBase}).`,
      check: { kind: 'pattern', test: 'regex', value: knownRegex.pattern, flags: knownRegex.flags || '' },
      applies_when,
    };
  }
  if (commonSubstring) {
    return {
      statement: `Avoid the recurring substring in ${records[0].source} rejections (${statementBase}).`,
      check: { kind: 'pattern', test: 'substring', value: commonSubstring },
      applies_when,
    };
  }
  // No structural pattern extractable — fall through to semantic
  return {
    statement: statementBase,
    check: { kind: 'semantic', value: statementBase },
    applies_when,
  };
}

function longestCommonSubstring(strings) {
  if (strings.length === 0) return null;
  if (strings.length === 1) return strings[0];
  // Pairwise LCS reduction — cheap for small N
  let acc = strings[0];
  for (let i = 1; i < strings.length; i++) {
    acc = pairLCS(acc, strings[i]);
    if (!acc) return null;
  }
  return acc;
}

function pairLCS(a, b) {
  if (!a || !b) return '';
  const n = a.length, m = b.length;
  // DP for longest common substring (O(n*m))
  let best = '';
  const prev = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    let prevPrev = 0;
    for (let j = 1; j <= m; j++) {
      const tmp = prev[j];
      if (a[i - 1] === b[j - 1]) {
        prev[j] = prevPrev + 1;
        if (prev[j] > best.length) best = a.slice(i - prev[j], i);
      } else {
        prev[j] = 0;
      }
      prevPrev = tmp;
    }
  }
  return best;
}

function detectKnownPattern(excerpts) {
  // Ordered library of common security/quality patterns. First match wins.
  const patterns = [
    { name: 'AWS access key', pattern: 'AKIA[0-9A-Z]{16}', re: /AKIA[0-9A-Z]{16}/ },
    { name: 'Generic private key', pattern: '-----BEGIN [A-Z ]+PRIVATE KEY-----', re: /-----BEGIN [A-Z ]+PRIVATE KEY-----/ },
    { name: 'GitHub token', pattern: 'gh[pousr]_[A-Za-z0-9]{36,}', re: /gh[pousr]_[A-Za-z0-9]{36,}/ },
    { name: 'Slack token', pattern: 'xox[baprs]-[A-Za-z0-9-]{10,}', re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
    { name: '.only in tests', pattern: '\\.only\\(', re: /\.only\(/ },
    { name: 'console.log', pattern: '\\bconsole\\.log\\(', re: /\bconsole\.log\(/ },
    { name: 'debugger statement', pattern: '\\bdebugger\\s*;', re: /\bdebugger\s*;/ },
    { name: 'TODO in committed code', pattern: '\\bTODO\\b', re: /\bTODO\b/ },
  ];
  for (const p of patterns) {
    if (excerpts.every(ex => p.re.test(ex))) return p;
  }
  return null;
}

function inferPathGlob(files) {
  if (files.length === 0) return null;
  // Take the common leading directory
  const parts = files.map(f => f.split('/').slice(0, -1));
  if (parts.length === 0 || parts[0].length === 0) return null;
  let common = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const other = parts[i];
    let k = 0;
    while (k < common.length && k < other.length && common[k] === other[k]) k++;
    common = common.slice(0, k);
    if (common.length === 0) break;
  }
  if (common.length === 0) return null;
  return common.join('/') + '/**';
}

function sha1_12(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
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
