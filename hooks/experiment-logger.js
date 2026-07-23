#!/usr/bin/env node

'use strict';


// Cleanup-plan Phase 2 (2026-07-21): fire-log instrumentation.
try { require('./lib/fire-log.js')('experiment-logger'); } catch (_) {}
const { emit } = require('./lib/output.js'); // v3.5 Copilot dual-shape emitter

// PostToolUse hook (BRD §4.8). Fires after Bash invocations that
// finish `scripts/validate-evals.sh`. Compares the latest eval
// snapshot in `state/eval-scores.json` against the previous one,
// applies the user-configured keep-or-revert policy, and appends the
// decision to `experiments/log.jsonl`.
//
// Default policy: revert if any dimension regressed. Override via
// state/monotonic-policy.json:
//   { "policy": "keep-on-any-improvement" | "revert-on-any-regression" | "keep-always",
//     "tolerances": { "<dimension>": <epsilon> } }
//
// Defensive: exit 0 if anything fails. We never block the Bash exit
// itself; the policy decision is advisory and surfaced via stdout
// (additionalContext) for the orchestrator to act on.

const fs = require('fs');
const path = require('path');

let input;
try {
  input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
} catch (_) {
  process.exit(0);
}

const toolName = input.tool_name || '';
if (toolName !== 'Bash') process.exit(0);

const ti = input.tool_input || {};
const cmd = (ti.command || '').toString();
if (!/validate-evals\.sh/.test(cmd)) process.exit(0);

const cwd = input.cwd || process.cwd();

function findProjectDir(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, '.claude')) ||
        fs.existsSync(path.join(current, 'feature_list.json'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

const projectDir = findProjectDir(cwd);
if (!projectDir) process.exit(0);

const scoresPath = path.join(projectDir, 'state', 'eval-scores.json');
const logPath = path.join(projectDir, 'experiments', 'log.jsonl');
const policyPath = path.join(projectDir, 'state', 'monotonic-policy.json');

if (!fs.existsSync(scoresPath)) process.exit(0);

let scoresFile;
try {
  scoresFile = JSON.parse(fs.readFileSync(scoresPath, 'utf8'));
} catch (_) {
  process.exit(0);
}

// Expected schema: array of snapshots, latest last. Each snapshot:
//   { checkpoint_id, git_sha, feature_list_hash,
//     scores: { coverage, typecheck, lint, build, e2e_pass_rate, ... },
//     decision: keep|revert|pending,
//     diff_path?: string }
const snapshots = Array.isArray(scoresFile) ? scoresFile : (scoresFile.snapshots || []);
if (snapshots.length < 2) process.exit(0); // nothing to compare

const latest = snapshots[snapshots.length - 1];
const previous = snapshots[snapshots.length - 2];

if (!latest || !previous || !latest.scores || !previous.scores) process.exit(0);

let policy = { policy: 'revert-on-any-regression', tolerances: {} };
try {
  if (fs.existsSync(policyPath)) {
    policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  }
} catch (_) {}

const tolerances = policy.tolerances || {};
const regressions = [];
const improvements = [];
const allKeys = new Set([...Object.keys(latest.scores), ...Object.keys(previous.scores)]);
for (const k of allKeys) {
  const a = typeof previous.scores[k] === 'number' ? previous.scores[k] : null;
  const b = typeof latest.scores[k] === 'number' ? latest.scores[k] : null;
  if (a === null || b === null) continue;
  const tol = typeof tolerances[k] === 'number' ? tolerances[k] : 0;
  const delta = b - a;
  if (delta < -tol) regressions.push({ dimension: k, previous: a, latest: b, delta });
  else if (delta > tol) improvements.push({ dimension: k, previous: a, latest: b, delta });
}

let decision;
if (policy.policy === 'keep-always') {
  decision = 'keep';
} else if (policy.policy === 'keep-on-any-improvement') {
  decision = improvements.length > 0 ? 'keep' : 'revert';
} else {
  decision = regressions.length > 0 ? 'revert' : 'keep';
}

// Stamp the latest snapshot
latest.decision = decision;
try {
  fs.writeFileSync(scoresPath, JSON.stringify(snapshots, null, 2));
} catch (_) {}

const entry = {
  ts: new Date().toISOString(),
  policy: policy.policy,
  decision,
  checkpoint_id: latest.checkpoint_id || null,
  git_sha: latest.git_sha || null,
  regressions,
  improvements,
};

try {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
} catch (_) {}

const output = {
  hookSpecificOutput: {
    hookEventName: 'PostToolUse',
    additionalContext: [
      `## Monotonic-improvement guard (BRD §4.8)`,
      ``,
      `policy: ${policy.policy}`,
      `decision: ${decision}`,
      regressions.length ? `regressions:\n  ${regressions.map(r => `- ${r.dimension}: ${r.previous} → ${r.latest} (Δ ${r.delta.toFixed(3)})`).join('\n  ')}` : 'regressions: none',
      improvements.length ? `improvements:\n  ${improvements.map(r => `- ${r.dimension}: ${r.previous} → ${r.latest} (Δ +${r.delta.toFixed(3)})`).join('\n  ')}` : 'improvements: none',
      ``,
      decision === 'revert'
        ? `Recommendation: \`git revert HEAD\` and try a different approach. The decision is logged to experiments/log.jsonl.`
        : `Recommendation: keep — advance to the next feature.`,
    ].join('\n'),
  },
};

emit(output);
process.exit(0);
