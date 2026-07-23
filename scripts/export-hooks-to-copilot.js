#!/usr/bin/env node
// Export Claude Code hook config → Copilot CLI hook config (BRD v3.5 §6b / §3).
//
//   Reads:  settings.json  (the `hooks` block)
//   Writes: .github/hooks/<copilotEvent>.json  (one file per Copilot event)
//
// Transforms applied:
//   1. Event rename           SessionStart → sessionStart, Stop → agentStop, … (EVENT_MAP)
//   2. TaskCompleted fold-in   no Copilot equivalent → postToolUse with a
//                              task-tracking matcher (BRD v3.5 §3 footnote)
//   3. Command rewrite         node "$CLAUDE_PROJECT_DIR/.claude/hooks/x.js"
//                              → COPILOT=1 node hooks/x.js
//                              (forces the flat output shape; relative path
//                               works from repo root / cloud-agent /workspace)
//
// Idempotent: re-run to regenerate. Exit 0 on success, 1 on structural error.

const fs = require('fs');
const path = require('path');
const { ROOT, OUT, EVENT_MAP, ensureDir } = require('./lib/copilot-export.js');

// Matcher applied to the folded-in TaskCompleted hooks. Copilot fires
// postToolUse for the task-tracking tool; this keeps task-completed.js +
// findings-collector.js firing on task completion under Copilot.
const TASK_TRACKING_MATCHER = 'todo|TodoWrite|task';

function hookScriptName(command) {
  // Pull the .js basename out of the Claude command string.
  const m = /([A-Za-z0-9_-]+\.js)/.exec(command);
  return m ? m[1] : null;
}

function rewriteCommand(command) {
  const js = hookScriptName(command);
  if (!js) return null;
  return `COPILOT=1 node hooks/${js}`;
}

function convertMatcherGroup(group) {
  const hooks = (group.hooks || [])
    .map((h) => rewriteCommand(h.command))
    .filter(Boolean)
    .map((command) => ({ type: 'command', command }));
  return { matcher: group.matcher || '', hooks };
}

function main() {
  const settingsPath = path.join(ROOT, 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const hooks = settings.hooks || {};

  // Accumulate per Copilot event so TaskCompleted can merge into postToolUse.
  const byEvent = {}; // copilotEvent -> [matcherGroup]
  const push = (copilotEvent, group) => {
    (byEvent[copilotEvent] || (byEvent[copilotEvent] = [])).push(group);
  };

  for (const [claudeEvent, groups] of Object.entries(hooks)) {
    if (claudeEvent === 'TaskCompleted') {
      // Fold into postToolUse with a task-tracking matcher.
      for (const g of groups) {
        const converted = convertMatcherGroup(g);
        converted.matcher = TASK_TRACKING_MATCHER;
        if (converted.hooks.length) push('postToolUse', converted);
      }
      continue;
    }
    const copilotEvent = EVENT_MAP[claudeEvent];
    if (!copilotEvent) {
      process.stderr.write(`WARN: no Copilot event mapping for "${claudeEvent}" — skipped\n`);
      continue;
    }
    for (const g of groups) {
      const converted = convertMatcherGroup(g);
      if (converted.hooks.length) push(copilotEvent, converted);
    }
  }

  ensureDir(OUT.hooks);
  // Clear stale per-event files so a removed event doesn't linger.
  for (const f of fs.readdirSync(OUT.hooks).filter((f) => f.endsWith('.json'))) {
    fs.unlinkSync(path.join(OUT.hooks, f));
  }

  let written = 0;
  for (const [copilotEvent, matchers] of Object.entries(byEvent)) {
    // Copilot schema (per `copilot help config`): hooks are "keyed by event
    // name (same schema as .github/hooks/*.json)". So each per-event file is an
    // object keyed by the event name whose value is the matcher-group array —
    // identical to a Claude Code settings.json `hooks` sub-block. No banner or
    // `$`-prefixed keys: a strict parser could read them as bogus event names.
    const doc = { [copilotEvent]: matchers };
    const outPath = path.join(OUT.hooks, `${copilotEvent}.json`);
    fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n');
    written++;
    const n = matchers.reduce((a, m) => a + m.hooks.length, 0);
    process.stdout.write(`  .github/hooks/${copilotEvent}.json  (${matchers.length} matcher(s), ${n} hook(s))\n`);
  }
  process.stdout.write(`export-hooks: ${written} Copilot event file(s) written\n`);
}

if (require.main === module) {
  try { main(); } catch (e) { process.stderr.write(`export-hooks FAILED: ${e.message}\n`); process.exit(1); }
}
module.exports = { rewriteCommand, hookScriptName, convertMatcherGroup };
