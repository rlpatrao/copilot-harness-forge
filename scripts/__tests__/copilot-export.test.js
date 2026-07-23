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
  const { toCopilotModel, resolveAgentModel, toCopilotTools, isValidModel } = require('../lib/copilot-export.js');
  // Real Copilot 1.0.73 roster ids (verified via `copilot help config`).
  assert.strictEqual(toCopilotModel('anthropic/claude-opus-4-7'), 'claude-opus-4.7');
  assert.strictEqual(toCopilotModel('anthropic/claude-sonnet-4-6'), 'claude-sonnet-4.6');
  assert.strictEqual(toCopilotModel('anthropic/claude-haiku-4-5'), 'claude-haiku-4.5');
  assert.strictEqual(toCopilotModel('openai/gpt-5'), 'gpt-5.5');
  assert.strictEqual(toCopilotModel('google/gemini-2.5-pro'), 'gemini-3.1-pro-preview');
  // every mapped id must be a real roster entry
  for (const raw of ['anthropic/claude-opus-4-7', 'anthropic/claude-sonnet-4-6', 'anthropic/claude-haiku-4-5', 'opus', 'sonnet', 'haiku']) {
    assert.ok(isValidModel(toCopilotModel(raw)), `${raw} → valid roster id`);
  }

  // placeholder resolves via workflows.yaml
  const critic = resolveAgentModel('{{model:critic}}', null);
  assert.strictEqual(critic.model, 'claude-opus-4.7', 'critic placeholder → claude-opus-4.7');
  // literal short name → latest of family
  const lit = resolveAgentModel('opus', null);
  assert.strictEqual(lit.model, 'claude-opus-4.8', 'literal opus → latest opus');
  // model_preference fallback
  const pref = resolveAgentModel(null, 'sonnet');
  assert.strictEqual(pref.model, 'claude-sonnet-4.6', 'model_preference sonnet → claude-sonnet-4.6');

  assert.deepStrictEqual(
    toCopilotTools('Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch'),
    ['read', 'write', 'edit', 'shell', 'glob', 'grep', 'web_search', 'fetch'],
    'tool names mapped + lowercased'
  );
  assert.deepStrictEqual(toCopilotTools('Read, Read'), ['read'], 'dedup');
  console.log('  ✓ model + tool mapping');
}

// ── 3. Hook exporter: name extraction, matcher-group union, bash wrapper ─────
{
  const { hookScriptName, collectHookNames, wrapperScript } = require('../export-hooks-to-copilot.js');
  assert.strictEqual(hookScriptName('node x/y/ralph-loop.js'), 'ralph-loop', 'basename without .js');
  // Union across matcher groups, de-duped, order-preserved (Copilot has no matcher).
  const names = collectHookNames([
    { matcher: 'Edit|Write', hooks: [{ command: 'node a/foo.js' }, { command: 'node a/bar.js' }] },
    { matcher: 'Bash', hooks: [{ command: 'node a/bar.js' }, { command: 'echo no-js' }] },
  ]);
  assert.deepStrictEqual(names, ['foo', 'bar'], 'union de-dups bar, drops non-js');
  const w = wrapperScript('session-start');
  assert.ok(w.includes('COPILOT=1 exec node "hooks/session-start.js"'), 'wrapper sets COPILOT=1 + execs node hook');
  assert.ok(w.includes('git rev-parse --show-toplevel'), 'wrapper cds to repo root');
  console.log('  ✓ hook name extraction + matcher-group union + bash wrapper');
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
  assert.ok(content.includes('model: claude-opus-4.7'), 'frontmatter model resolved to roster id');
  assert.ok(content.includes('tools: read, glob, grep'), 'frontmatter tools mapped');
  assert.ok(!content.includes('{{model:'), 'no unresolved placeholder leaks');
  assert.ok(resolveBodyPlaceholders('x {{model:compactor}} y').includes('claude-haiku-4.5'), 'body placeholder resolved');
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

// ── 6. MCP exporter (schema verified against Copilot 1.0.73) ─────────────────
{
  const { toCopilotServer } = require('../export-mcp-to-copilot.js');
  const s = toCopilotServer({ command: 'npx', args: ['-y', 'x'], purpose: 'p' });
  assert.deepStrictEqual(s, { type: 'local', command: 'npx', args: ['-y', 'x'], tools: ['*'] },
    'exact Copilot mcp.json server schema (type/command/args/tools, no autoApprove)');
  console.log('  ✓ MCP server translation');
}

console.log('PASS: copilot-export unit tests');
