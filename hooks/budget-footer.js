#!/usr/bin/env node

'use strict';


// Cleanup-plan Phase 2 (2026-07-21): fire-log instrumentation.
try { require('./lib/fire-log.js')('budget-footer'); } catch (_) {}
const { emit } = require('./lib/output.js'); // v3.5 Copilot dual-shape emitter

// PostToolUse hook (BRD §3.7). Appends a budget-regime footer to every
// tool result so the agent has a per-call signal of context budget
// status. Pattern from Stripe Minions and Google BATS research.
//
// Output format (appended to existing tool-result stdout):
//   ---
//   budget: <used> / <total> tokens (<pct>%) | turn <n> / <max> | regime: NORMAL | CONSERVE | HIGH | CRITICAL
//
// Regime transitions:
//   NORMAL    (  0-60%): no special instructions
//   CONSERVE  ( 60-80%): "prefer reading over searching, prefer targeted edits over rewrites"
//   HIGH      ( 80-95%): "wrap up current feature, do not start new exploration"
//   CRITICAL  ( 95+  %): "commit current state, write progress note, terminate"
//
// Defensive: exit 0 on any infra failure. If state/cost-log.json is
// unreadable we skip rather than block. Order requirement: registered
// AFTER cost-tracker.js so the regime calculation sees fresh tokens.

const fs = require('fs');
const path = require('path');

let input;
try {
  input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
} catch (_) {
  process.exit(0);
}

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

// Read cumulative tokens from state/cost-log.json (existing forge state file).
// Schema is forge-defined; we tolerate either an aggregate object or a JSONL.
const costLogPath = path.join(projectDir, 'state', 'cost-log.json');
let totalTokens = 0;
let maxTokens = 200000;
let turn = 0;
let maxTurn = 40;

try {
  if (fs.existsSync(costLogPath)) {
    const raw = fs.readFileSync(costLogPath, 'utf8');
    // Try JSON-array / object shape first
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const e of parsed) {
          if (e && typeof e.tokens === 'number') totalTokens += e.tokens;
          else if (e && typeof e.input_tokens === 'number') totalTokens += (e.input_tokens + (e.output_tokens || 0));
        }
        turn = parsed.length;
      } else if (parsed && typeof parsed === 'object') {
        totalTokens = parsed.total_tokens || parsed.tokens || 0;
        turn = parsed.turn || parsed.call_count || 0;
        maxTokens = parsed.max_tokens || maxTokens;
        maxTurn = parsed.max_turn || maxTurn;
      }
    } catch (_) {
      // Try JSONL
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        try {
          const o = JSON.parse(line);
          if (o && typeof o.tokens === 'number') totalTokens += o.tokens;
          else if (o && typeof o.input_tokens === 'number') totalTokens += (o.input_tokens + (o.output_tokens || 0));
          turn += 1;
        } catch (_) {}
      }
    }
  }
} catch (_) {}

// Allow the hook input to override with fresher per-call values if provided.
if (typeof input.total_tokens === 'number') totalTokens = input.total_tokens;
if (typeof input.max_tokens === 'number') maxTokens = input.max_tokens;
if (typeof input.turn === 'number') turn = input.turn;
if (typeof input.max_turn === 'number') maxTurn = input.max_turn;

const pct = maxTokens > 0 ? totalTokens / maxTokens : 0;

function regimeFor(p) {
  if (p < 0.60) return { name: 'NORMAL', advice: '' };
  if (p < 0.80) return { name: 'CONSERVE', advice: 'prefer reading over searching; prefer targeted edits over rewrites' };
  if (p < 0.95) return { name: 'HIGH', advice: 'wrap up current feature; do not start new exploration' };
  return { name: 'CRITICAL', advice: 'commit current state, append a progress note to harness-progress.txt, terminate' };
}

const regime = regimeFor(pct);
const pctDisplay = (pct * 100).toFixed(1);
const tokensDisplay = totalTokens.toLocaleString('en-US');
const maxDisplay = maxTokens.toLocaleString('en-US');

const footerLines = [
  '---',
  `budget: ${tokensDisplay} / ${maxDisplay} tokens (${pctDisplay}%) | turn ${turn} / ${maxTurn} | regime: ${regime.name}`,
];
if (regime.advice) footerLines.push(`regime guidance: ${regime.advice}`);

const output = {
  hookSpecificOutput: {
    hookEventName: 'PostToolUse',
    appendToToolResult: '\n' + footerLines.join('\n'),
    metadata: {
      budget_pct: pct,
      regime: regime.name,
      total_tokens: totalTokens,
      turn,
    },
  },
};

emit(output);
process.exit(0);
