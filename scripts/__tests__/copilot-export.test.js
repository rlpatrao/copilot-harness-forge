'use strict';
// Unit tests for the v3.5 Copilot port (BRD v3.5). Plain node assert, run with:
//   node scripts/__tests__/copilot-export.test.js
const assert = require('assert');

// ── 1. Output adapter: hooks/lib/output.js ───────────────────────────────────
{
  const { shape } = require('../../hooks/lib/output.js');
  const g1 = { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'hi' } };
  const g2 = { decision: 'block', reason: 'stay' };
  const g3 = { hookSpecificOutput: { hookEventName: 'PreCompact', spawn_subagent: 'compactor', checkpoint_required: true }, decision: 'continue' };

  delete process.env.COPILOT; // Claude Code
  assert.deepStrictEqual(shape(g1), g1, 'CC g1 passthrough');
  assert.deepStrictEqual(shape(g2), g2, 'CC g2 passthrough');
  assert.deepStrictEqual(shape(g3), g3, 'CC g3 passthrough');

  process.env.COPILOT = '1'; // Copilot flat
  assert.deepStrictEqual(shape(g1), { additionalContext: 'hi' }, 'CP g1 flattened, hookEventName dropped');
  assert.deepStrictEqual(shape(g2), { decision: 'block', reason: 'stay' }, 'CP g2 no wrapper => unchanged');
  assert.deepStrictEqual(shape(g3), { decision: 'continue', spawn_subagent: 'compactor', checkpoint_required: true }, 'CP g3 extras hoisted');
  delete process.env.COPILOT;
  console.log('  ✓ output adapter: 3 field groups × 2 runtimes');
}

// ── 2. Shared helpers: model + tools mapping ─────────────────────────────────
{
  const { toCopilotModel, resolveAgentModel, toCopilotTools } = require('../lib/copilot-export.js');
  assert.strictEqual(toCopilotModel('anthropic/claude-opus-4-7'), 'claude-opus');
  assert.strictEqual(toCopilotModel('anthropic/claude-sonnet-4-6'), 'claude-sonnet');
  assert.strictEqual(toCopilotModel('anthropic/claude-haiku-4-5'), 'claude-haiku');
  assert.strictEqual(toCopilotModel('openai/gpt-5'), 'gpt-5');
  assert.strictEqual(toCopilotModel('google/gemini-2.5-pro'), 'gemini-2.5-pro');

  // placeholder resolves via workflows.yaml
  const critic = resolveAgentModel('{{model:critic}}', null);
  assert.strictEqual(critic.model, 'claude-opus', 'critic placeholder → claude-opus');
  // literal short name
  const lit = resolveAgentModel('opus', null);
  assert.strictEqual(lit.model, 'claude-opus', 'literal opus → claude-opus');
  // model_preference fallback
  const pref = resolveAgentModel(null, 'sonnet');
  assert.strictEqual(pref.model, 'claude-sonnet', 'model_preference sonnet → claude-sonnet');

  assert.deepStrictEqual(
    toCopilotTools('Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch'),
    ['read', 'write', 'edit', 'shell', 'glob', 'grep', 'web_search', 'fetch'],
    'tool names mapped + lowercased'
  );
  assert.deepStrictEqual(toCopilotTools('Read, Read'), ['read'], 'dedup');
  console.log('  ✓ model + tool mapping');
}

// ── 3. Hook exporter: command rewrite + TaskCompleted fold-in ────────────────
{
  const { rewriteCommand, hookScriptName, convertMatcherGroup } = require('../export-hooks-to-copilot.js');
  assert.strictEqual(
    rewriteCommand('node "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.js"'),
    'COPILOT=1 node hooks/session-start.js',
    'command rewritten with COPILOT=1 + relative path'
  );
  assert.strictEqual(hookScriptName('node x/y/ralph-loop.js'), 'ralph-loop.js');
  const grp = convertMatcherGroup({ matcher: 'Edit|Write', hooks: [{ command: 'node a/foo.js' }, { command: 'echo no-js' }] });
  assert.strictEqual(grp.hooks.length, 1, 'non-.js command dropped');
  assert.strictEqual(grp.hooks[0].command, 'COPILOT=1 node hooks/foo.js');
  console.log('  ✓ hook command rewrite + matcher conversion');
}

// ── 4. Agent exporter: frontmatter build + placeholder resolution ────────────
{
  const { buildAgent, resolveBodyPlaceholders } = require('../export-agents-to-copilot.js');
  const src = [
    '---',
    'name: critic',
    'description: judge',
    'model: "{{model:critic}}"',
    'tools: Read, Glob, Grep',
    '---',
    '',
    'Body uses {{model:critic}} inline.',
  ].join('\n');
  const { name, content } = buildAgent(src);
  assert.strictEqual(name, 'critic');
  assert.ok(content.includes('model: claude-opus'), 'frontmatter model resolved');
  assert.ok(content.includes('tools: read, glob, grep'), 'frontmatter tools mapped');
  assert.ok(!content.includes('{{model:'), 'no unresolved placeholder leaks');
  assert.ok(resolveBodyPlaceholders('x {{model:compactor}} y').includes('claude-haiku'), 'body placeholder resolved');
  console.log('  ✓ agent frontmatter build + placeholder resolution');
}

// ── 5. Command exporter ──────────────────────────────────────────────────────
{
  const { buildCommand } = require('../export-commands-to-copilot.js');
  const src = ['---', 'description: do a thing', 'argument-hint: <id>', '---', '', 'Run on $ARGUMENTS'].join('\n');
  const out = buildCommand(src, 'plan');
  assert.ok(out.includes('description: do a thing'));
  assert.ok(out.includes('argument-hint: <id>'));
  assert.ok(out.includes('$ARGUMENTS'), 'argument token preserved');
  assert.ok(out.includes('generated-from: commands/plan.md'));
  console.log('  ✓ command export');
}

// ── 6. MCP exporter ──────────────────────────────────────────────────────────
{
  const { toCopilotServer } = require('../export-mcp-to-copilot.js');
  const s = toCopilotServer('playwright', { command: 'npx', args: ['-y', 'x'], purpose: 'p' });
  assert.strictEqual(s.command, 'npx');
  assert.deepStrictEqual(s.args, ['-y', 'x']);
  assert.strictEqual(s.autoApprove, true, 'auto-approved for non-interactive E2E');
  console.log('  ✓ MCP server translation');
}

console.log('PASS: copilot-export unit tests');
