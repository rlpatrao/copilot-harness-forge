#!/usr/bin/env node

'use strict';


// Cleanup-plan Phase 2 (2026-07-21): fire-log instrumentation.
try { require('./lib/fire-log.js')('token-advisor'); } catch (_) {}
const { emit } = require('./lib/output.js'); // v3.5 Copilot dual-shape emitter

// PreToolUse(Read|Bash|Glob|Grep) advisory hook (BRD v3.1 §4, v3.1.6).
// Warns the agent — via additionalContext in the hook result — when a
// Read/Bash/Glob/Grep call looks like avoidable broad exploration that
// /context or the CCR pipeline could handle more cheaply.
//
// NEVER blocks. Advisory only. Emits a system-reminder-like note that
// surfaces in the tool result so the model sees it.
//
// Triggers:
//   - Read of a file >5000 lines OR a file already read this session
//   - Bash with `find` / `rg` / `grep` on the whole repo without filters
//   - Glob with pattern "**/*" and no specific dir
//
// State: per-session counter at state/token-advisor-session.json —
// reset when session_id changes. Prevents nagging the model repeatedly.

const fs = require('fs');
const path = require('path');

let input;
try {
  input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
} catch (_) {
  process.exit(0);
}

const toolName = input.tool_name || '';
const ti = input.tool_input || {};
const cwd = input.cwd || process.cwd();
const sessionId = input.session_id || 'unknown';

const ROOT = findProjectRoot(cwd);
if (!ROOT) process.exit(0);
const stateDir = path.join(ROOT, 'state');
try { fs.mkdirSync(stateDir, { recursive: true }); } catch (_) {}
const stateFile = path.join(stateDir, 'token-advisor-session.json');

let state = { session: sessionId, seen_reads: [], warn_count: 0 };
try {
  const s = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  if (s.session === sessionId) state = s;
} catch (_) {}

// Cap warnings per session — after N warnings, be quiet
const WARN_CAP = 3;
if (state.warn_count >= WARN_CAP) process.exit(0);

let advice = null;

if (toolName === 'Read') {
  const fp = ti.file_path;
  if (!fp) process.exit(0);
  // 1. Duplicate read
  if (state.seen_reads.includes(fp)) {
    advice = `You already Read \`${fp}\` earlier this session. If you need part of it fresh, use a targeted \`Read\` with offset+limit, or run \`/context "<question>"\` to see if the answer is derivable from what you've already loaded.`;
  }
  state.seen_reads.push(fp);
  if (state.seen_reads.length > 200) state.seen_reads = state.seen_reads.slice(-200);
  // 2. Huge file without limit
  try {
    const st = fs.statSync(fp);
    const lines = fs.readFileSync(fp, 'utf8').split('\n').length;
    if (lines > 5000 && !ti.limit) {
      advice = advice ? advice + '\n\n' : '';
      advice += `\`${fp}\` is ${lines} lines. Reading the whole file will cost significant tokens. Consider using \`offset\` + \`limit\`, or run \`/context "<question>"\` to see citations first.`;
    }
    void st;
  } catch (_) {}
}

if (toolName === 'Bash') {
  const cmd = ti.command || '';
  // Wide find without common filters
  if (/^\s*find\s+\.\s/.test(cmd) && !/-name|-type|-path|\|\s*head/.test(cmd)) {
    advice = `\`find\` on the whole repo without filters can be huge. Add \`-name\`, \`-type\`, or pipe to \`head\`. Or use \`/context "<question>"\` — it uses a scoped search.`;
  }
  // Wide rg/grep on whole repo
  if (/^\s*(rg|grep\s+-r)\s+(?!.*(--glob|--include|--exclude|-t\s))/.test(cmd) && cmd.length < 200) {
    if (!/head|tail|\|\s*wc/.test(cmd)) {
      advice = advice ? advice + '\n\n' : '';
      advice += `Broad ${cmd.match(/^\s*(rg|grep)/)[1]} without \`--glob\`, \`--include\`, or \`-t\` filters can dump a lot into your context. Either add filters, pipe through \`node scripts/search-compact.js\` to get a digest, or use \`/context "<question>"\`.`;
    }
  }
}

if (toolName === 'Glob') {
  const pat = ti.pattern || '';
  if (pat === '**/*' || pat === '**/*.*') {
    advice = `Glob pattern \`${pat}\` matches everything. Narrow it (\`src/**/*.ts\`, \`hooks/*.js\`) or use \`/context "<question>"\`.`;
  }
}

// Persist state on every invocation so seen_reads accumulates across calls
// (not just when we emit advice).
try { fs.writeFileSync(stateFile, JSON.stringify(state)); } catch (_) {}

if (!advice) process.exit(0);

// Emit as PreToolUse additionalContext — the model sees it before the tool runs
const output = {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    additionalContext: `**Token advisor (BRD v3.1 §4 v3.1.6):** ${advice}\n\n_This is advisory, not blocking. Proceed if you're sure; the note appears at most ${WARN_CAP} times per session._`,
  },
};

state.warn_count++;
try { fs.writeFileSync(stateFile, JSON.stringify(state)); } catch (_) {}

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
