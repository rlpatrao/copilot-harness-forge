// Shared helpers for the v3.5 Copilot exporters (BRD v3.5 §6b–6e).
//
// Pure Node, stdlib only. Consumed by:
//   scripts/export-hooks-to-copilot.js
//   scripts/export-agents-to-copilot.js
//   scripts/export-commands-to-copilot.js
//   scripts/export-to-copilot.js (orchestrator)
//
// All Copilot-specific naming assumptions (model slugs, tool names, hook
// event names, output paths) are centralized here as editable tables so a
// first-run mismatch during dogfood (BRD v3.5 §7) is a one-line fix, not a
// hunt across four scripts.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const yamlMini = require(path.join(ROOT, 'scripts', 'yaml-mini.js'));

// ── Frontmatter ────────────────────────────────────────────────────────────
// Split a Markdown file into { attrs, body }. attrs is a flat string map;
// list-ish values (`Read, Write` or `[a, b]`) are returned as raw strings and
// interpreted by the caller (tools/model need different handling).
function parseFrontmatter(src) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  if (!m) return { attrs: {}, body: src };
  const attrs = {};
  for (const raw of m[1].split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line || /^\s*#/.test(line)) continue;
    const kv = /^([A-Za-z0-9_-]+):\s?(.*)$/.exec(line);
    if (!kv) continue;
    let val = kv[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    attrs[kv[1]] = val;
  }
  return { attrs, body: src.slice(m[0].length) };
}

// ── Model routing (BRD v3.5 §4 / §6c) ────────────────────────────────────────
// workflows.yaml is the source of truth; agents reference it via
// {{model:<workflow>}} placeholders or carry a literal opus/sonnet/haiku.
// Copilot has its own inference (no BYOK), so we resolve to a Copilot family
// slug. Family-level slugs are deliberate: Copilot resolves the family to its
// latest available member, so the port doesn't rot when a point release lands.
let _workflows = null;
function loadWorkflows() {
  if (_workflows) return _workflows;
  const doc = yamlMini.parse(fs.readFileSync(path.join(ROOT, 'config', 'workflows.yaml'), 'utf8'));
  _workflows = doc.workflows || {};
  return _workflows;
}

// The actual Copilot CLI 1.0.73 model roster (from `copilot help config`).
// Used to validate every resolved slug so a bad mapping is caught at export
// time, not at Copilot runtime. Update when `copilot help config` changes.
const VALID_MODELS = new Set([
  'claude-sonnet-5', 'claude-sonnet-4.6', 'claude-sonnet-4.5', 'claude-haiku-4.5',
  'claude-fable-5', 'claude-opus-4.8', 'claude-opus-4.8-fast', 'claude-opus-4.7',
  'claude-opus-4.6', 'claude-opus-4.5', 'gpt-5.6-sol', 'gpt-5.6-terra',
  'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4', 'gpt-5.3-codex', 'gpt-5.4-mini',
  'gpt-5-mini', 'gemini-3.1-pro-preview', 'gemini-3.5-flash', 'kimi-k2.7-code',
]);

// Provider/model string → a REAL Copilot model id (verified against the roster
// above during the v3.5 dogfood). Versioned Anthropic ids convert dash→dot
// (claude-opus-4-7 → claude-opus-4.7, all three families are in the roster);
// bare family literals map to a sensible current default. Edit if the roster
// shifts (BRD v3.5 §7).
const MODEL_MAP = [
  [/claude-opus-4-7/i, 'claude-opus-4.7'],
  [/claude-opus-4-6/i, 'claude-opus-4.6'],
  [/claude-opus-4-5/i, 'claude-opus-4.5'],
  [/opus/i, 'claude-opus-4.8'],                 // bare "opus" → latest opus
  [/claude-sonnet-4-6/i, 'claude-sonnet-4.6'],
  [/claude-sonnet-4-5/i, 'claude-sonnet-4.5'],
  [/sonnet/i, 'claude-sonnet-4.6'],             // bare "sonnet"
  [/haiku/i, 'claude-haiku-4.5'],
  [/kimi/i, 'kimi-k2.7-code'],
  [/gpt-5-mini/i, 'gpt-5-mini'],
  [/gpt-5/i, 'gpt-5.5'],                          // no bare gpt-5 in roster → 5.5
  [/gemini.*flash/i, 'gemini-3.5-flash'],
  [/gemini/i, 'gemini-3.1-pro-preview'],
];

function toCopilotModel(raw) {
  if (!raw) return null;
  for (const [re, slug] of MODEL_MAP) if (re.test(raw)) return slug;
  // Unknown — strip any provider/ prefix and pass through so it's visible.
  return raw.includes('/') ? raw.split('/').pop() : raw;
}

// True when a slug is a real Copilot model id (for export-time validation).
function isValidModel(slug) {
  return VALID_MODELS.has(slug);
}

// Resolve an agent's model: field to a Copilot slug. Handles both the
// {{model:<workflow>}} placeholder and a literal short name.
function resolveAgentModel(modelField, modelPreference) {
  const field = modelField || modelPreference || '';
  const ph = /\{\{model:([\w-]+)\}\}/.exec(field);
  if (ph) {
    const wf = loadWorkflows()[ph[1]];
    const primary = wf && wf.primary ? wf.primary : null;
    return { model: toCopilotModel(primary), source: `workflows.yaml:${ph[1]}.primary`, primary };
  }
  if (field) return { model: toCopilotModel(field), source: 'literal', primary: field };
  return { model: null, source: 'unspecified', primary: null };
}

// ── Tool names (BRD v3.5 §6c) ────────────────────────────────────────────────
// Claude tool names → Copilot tool names. Copilot uses lowercase; a few names
// differ. Unknown tools are lowercased as a safe default.
const TOOL_MAP = {
  Read: 'read', Write: 'write', Edit: 'edit', Bash: 'shell', Glob: 'glob',
  Grep: 'grep', WebSearch: 'web_search', WebFetch: 'fetch', Agent: 'agent',
  Task: 'agent', NotebookEdit: 'edit', TodoWrite: 'todo',
};

function toCopilotTools(toolsField) {
  if (!toolsField) return [];
  const names = toolsField.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const n of names) {
    const mapped = TOOL_MAP[n] || n.toLowerCase();
    if (!seen.has(mapped)) { seen.add(mapped); out.push(mapped); }
  }
  return out;
}

// ── Hook event names (BRD v3.5 §3) ───────────────────────────────────────────
// Claude Code settings.json event key → Copilot CLI event name. TaskCompleted
// has no Copilot equivalent; it folds into postToolUse with a task-tracking
// matcher (handled by the hook exporter, not this table).
const EVENT_MAP = {
  SessionStart: 'sessionStart',
  PreToolUse: 'preToolUse',
  PostToolUse: 'postToolUse',
  PreCompact: 'preCompact',
  Stop: 'agentStop',
  SubagentStop: 'subagentStop',
};

// ── Paths ────────────────────────────────────────────────────────────────────
const OUT = {
  hooks: path.join(ROOT, '.github', 'hooks'),
  agents: path.join(ROOT, '.github', 'agents'),
  commands: path.join(ROOT, '.github', 'commands'),
  skills: path.join(ROOT, '.github', 'skills'),
  // Copilot CLI 1.0.73 reads workspace MCP config from .github/mcp.json (or
  // .mcp.json) — verified during the v3.5 dogfood (`copilot mcp list`).
  mcp: path.join(ROOT, '.github', 'mcp.json'),
};

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

// A short generated-file banner so exports are never hand-edited by mistake.
function banner(sourceRel) {
  return `# GENERATED by scripts/export-*-to-copilot.js from ${sourceRel}. Do not edit by hand — re-run the exporter.`;
}

module.exports = {
  ROOT, OUT, EVENT_MAP, TOOL_MAP, MODEL_MAP, VALID_MODELS,
  parseFrontmatter, toCopilotModel, isValidModel, resolveAgentModel, toCopilotTools,
  loadWorkflows, ensureDir, banner,
};
