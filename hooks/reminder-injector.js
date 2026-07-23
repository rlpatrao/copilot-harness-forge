#!/usr/bin/env node

'use strict';


// Cleanup-plan Phase 2 (2026-07-21): fire-log instrumentation.
try { require('./lib/fire-log.js')('reminder-injector'); } catch (_) {}
const { emit } = require('./lib/output.js'); // v3.5 Copilot dual-shape emitter

// PreToolUse hook (BRD §4.2). Inspects the tool name + arguments and
// injects a targeted reminder snippet from prompts/reminders/ when a
// decision-point trigger fires. The reminder rides as
// hookSpecificOutput.additionalContext so it surfaces for the one call,
// not the entire session.
//
// Triggers:
//   - destructive-bash:        Bash with rm | dd | mkfs | >/dev/
//   - feature-passes-flip:     Edit/Write that flips passes:false→true
//   - edit-production-code:    Edit outside tests/, docs/, scratch/
//   - subagent-spawn:          Agent tool invocation
//   - checkpoint-due:          25+ turns since last git commit (tracked
//                              in /tmp/claude-harness-checkpoint/<sid>)
//
// Defensive: exit 0 on any infra failure.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

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
        fs.existsSync(path.join(current, 'feature_list.json')) ||
        fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

const projectDir = findProjectDir(cwd);
if (!projectDir) process.exit(0);

const remindersDir = path.join(projectDir, 'prompts', 'reminders');

function readSnippet(name) {
  const p = path.join(remindersDir, `${name}.md`);
  try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; }
}

const tool = input.tool_name || '';
const ti = input.tool_input || {};
const triggered = [];

// destructive-bash
if (tool === 'Bash') {
  const cmd = (ti.command || '').toString();
  if (/(^|\s)rm\s+/.test(cmd) ||
      /(^|\s)dd\s+/.test(cmd) ||
      /(^|\s)mkfs\b/.test(cmd) ||
      />\s*\/dev\//.test(cmd)) {
    triggered.push('destructive-bash');
  }
}

// feature-passes-flip
if ((tool === 'Edit' || tool === 'Write') &&
    typeof ti.file_path === 'string' &&
    path.basename(ti.file_path) === 'feature_list.json') {
  // Inspect for false→true flip without re-running the gate logic
  if (tool === 'Edit') {
    const oldStr = ti.old_string || '';
    const newStr = ti.new_string || '';
    if (/"passes"\s*:\s*false/.test(oldStr) && /"passes"\s*:\s*true/.test(newStr)) {
      triggered.push('feature-passes-flip');
    }
  } else if (tool === 'Write') {
    const content = ti.content || '';
    if (/"passes"\s*:\s*true/.test(content)) {
      triggered.push('feature-passes-flip');
    }
  }
}

// edit-production-code: Edit on a file outside tests/, docs/, scratch/, .claude/, etc.
if (tool === 'Edit' && typeof ti.file_path === 'string') {
  const rel = path.relative(projectDir, path.resolve(ti.file_path));
  const skip = /^(tests?|docs?|scratch|\.claude|\.git|sessions|verification|experiments|instincts|scripts)\//.test(rel) ||
               /^feature_list\.json$/.test(rel) ||
               /^harness-progress\.txt$/.test(rel);
  if (!skip && !rel.startsWith('..')) {
    triggered.push('edit-production-code');
  }
}

// subagent-spawn
if (tool === 'Agent' || tool === 'Task') {
  triggered.push('subagent-spawn');
}

// checkpoint-due: 25+ turns since last commit. Track per session.
try {
  const sid = input.session_id || 'unknown';
  const stateDir = path.join(os.tmpdir(), 'claude-harness-checkpoint');
  fs.mkdirSync(stateDir, { recursive: true });
  const turnPath = path.join(stateDir, `${sid}.turn`);
  let turn = 0;
  if (fs.existsSync(turnPath)) {
    turn = parseInt(fs.readFileSync(turnPath, 'utf8'), 10) || 0;
  }
  turn += 1;
  fs.writeFileSync(turnPath, String(turn));

  if (turn % 25 === 0) {
    // Check if the most recent commit was within this session — if not, fire the reminder.
    let lastCommitAge = Infinity;
    try {
      const epoch = execSync('git log -1 --format=%ct', {
        cwd: projectDir, encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 3000,
      }).trim();
      lastCommitAge = Math.floor(Date.now() / 1000) - parseInt(epoch, 10);
    } catch (_) {}
    if (lastCommitAge > 900) { // > 15 min
      triggered.push('checkpoint-due');
    }
  }
} catch (_) {}

if (triggered.length === 0) process.exit(0);

const parts = [];
for (const name of triggered) {
  const body = readSnippet(name);
  if (body) parts.push(body.trim());
}

if (parts.length === 0) process.exit(0);

const output = {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    additionalContext: parts.join('\n\n---\n\n'),
    triggered_reminders: triggered,
  },
};

emit(output);
process.exit(0);
