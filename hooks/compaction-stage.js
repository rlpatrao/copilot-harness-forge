#!/usr/bin/env node

'use strict';


// Cleanup-plan Phase 2 (2026-07-21): fire-log instrumentation.
try { require('./lib/fire-log.js')('compaction-stage'); } catch (_) {}
const { emit } = require('./lib/output.js'); // v3.5 Copilot dual-shape emitter

// Pre-LLM-call compaction hook (BRD §4.3). Reads the SDK's PreCompact
// event input, decides which stage applies, and emits a directive for
// the SDK to:
//   - stage 1 (50%): drop tool outputs older than 20 turns
//   - stage 2 (65%): summarize file-read outputs to 200-char abstracts
//   - stage 3 (75%): spawn the Compactor subagent for older-turn rewrite
//   - stage 4 (85%): aggressive summarization (current-feature scope only)
//   - stage 5 (92%): forced checkpoint — git commit + handoff to Ralph Loop
//
// Stages 1 and 2 are mechanical and handled inline. Stages 3-5 emit a
// hook-output directive that the SDK orchestrator translates into
// spawning agents/compactor.md and/or invoking git+harness-progress.
//
// Defensive: exit 0 on any infra failure so a hook bug never derails a
// session. The SDK falls back to its built-in auto_compact when this
// hook does not respond.

const fs = require('fs');
const path = require('path');

let input;
try {
  input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
} catch (_) {
  process.exit(0);
}

const sessionId = input.session_id || 'unknown';
const cwd = input.cwd || process.cwd();
const totalTokens = input.total_tokens || 0;
const maxTokens = input.max_tokens || 200000;
const messageCount = input.message_count || 0;
const pct = maxTokens > 0 ? totalTokens / maxTokens : 0;

function stageFor(p) {
  if (p < 0.50) return 0;
  if (p < 0.65) return 1;
  if (p < 0.75) return 2;
  if (p < 0.85) return 3;
  if (p < 0.92) return 4;
  return 5;
}

const stage = stageFor(pct);

if (stage === 0) {
  // Below the first threshold — nothing to do. Let the SDK proceed.
  process.exit(0);
}

const stageActions = {
  1: 'drop-stale-tool-outputs',
  2: 'abstract-file-reads',
  3: 'compactor-subagent-older-turns',
  4: 'compactor-subagent-aggressive',
  5: 'forced-checkpoint',
};

const directive = {
  hookSpecificOutput: {
    hookEventName: 'PreCompact',
    stage,
    action: stageActions[stage],
    context_pct: Math.round(pct * 100),
    total_tokens: totalTokens,
    max_tokens: maxTokens,
    message_count: messageCount,
    session_id: sessionId,
  },
};

// For stages 3-5 we attach an explicit instruction to spawn the
// Compactor subagent. The SDK translates this into the actual spawn.
if (stage >= 3) {
  directive.hookSpecificOutput.spawn_subagent = 'compactor';
  directive.hookSpecificOutput.subagent_input = {
    stage,
    archive_path: path.join('sessions', 'archive', String(sessionId)),
    preserve_last_turns: stage === 3 ? 10 : (stage === 4 ? 5 : 3),
  };
}

if (stage === 5) {
  directive.hookSpecificOutput.checkpoint_required = true;
  directive.hookSpecificOutput.handoff_to = 'ralph-loop';
}

emit(directive);
process.exit(0);
