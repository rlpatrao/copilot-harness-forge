---
name: agentic-ux
description: UX patterns for agentic AI applications — intent preview, autonomy dial, confidence signals, audit trails, escalation, streaming, multi-agent dashboards, and error recovery.
---

# Agentic UX Patterns

Patterns for building user interfaces that make AI agents transparent, controllable, and trustworthy. Based on emerging best practices for agentic applications.

## 1. Intent Preview

Show the user what the agent intends to do before executing. Builds trust and prevents unwanted actions.

### Pattern

- Agent analyzes request, produces a plan
- Plan is displayed as a checklist of concrete actions
- User can approve, edit, or reject the plan
- Only approved actions are executed

### React + Tailwind Component

```tsx
interface IntentAction {
  id: string;
  description: string;
  target: string;        // file, API, database, etc.
  operation: 'create' | 'modify' | 'delete' | 'read';
  risk: 'low' | 'medium' | 'high';
  approved: boolean;
}

function IntentPreview({ actions, onApprove, onReject, onApproveAll }: {
  actions: IntentAction[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onApproveAll: () => void;
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-amber-600 font-semibold">Agent wants to:</span>
      </div>
      <ul className="space-y-2">
        {actions.map((action) => (
          <li key={action.id} className="flex items-center justify-between p-2 rounded bg-white border">
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded font-mono ${
                action.risk === 'high' ? 'bg-red-100 text-red-700' :
                action.risk === 'medium' ? 'bg-amber-100 text-amber-700' :
                'bg-green-100 text-green-700'
              }`}>{action.operation}</span>
              <span className="text-sm">{action.description}</span>
              <span className="text-xs text-gray-400">{action.target}</span>
            </div>
            <div className="flex gap-1">
              <button onClick={() => onApprove(action.id)}
                className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200">
                Approve
              </button>
              <button onClick={() => onReject(action.id)}
                className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200">
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button onClick={onApproveAll}
        className="mt-3 w-full py-2 rounded bg-green-600 text-white text-sm font-medium hover:bg-green-700">
        Approve All
      </button>
    </div>
  );
}
```

## 2. Autonomy Dial

Let users control how much freedom the agent has. Different tasks warrant different levels of autonomy.

### Levels

| Level | Name | Behavior | Use When |
|-------|------|----------|----------|
| 1 | **Suggest** | Agent suggests, user executes | High-risk operations, new users |
| 2 | **Confirm** | Agent prepares, user confirms each action | Standard operations |
| 3 | **Notify** | Agent executes, notifies after each action | Trusted repetitive tasks |
| 4 | **Autonomous** | Agent executes silently, reports summary at end | Low-risk batch operations |

### React + Tailwind Component

```tsx
function AutonomyDial({ level, onChange }: { level: 1|2|3|4; onChange: (l: 1|2|3|4) => void }) {
  const levels = [
    { value: 1, label: 'Suggest', desc: 'You decide, agent advises', color: 'bg-blue-500' },
    { value: 2, label: 'Confirm', desc: 'Agent acts, you approve each step', color: 'bg-green-500' },
    { value: 3, label: 'Notify', desc: 'Agent acts, you get notified', color: 'bg-amber-500' },
    { value: 4, label: 'Autonomous', desc: 'Agent acts independently', color: 'bg-red-500' },
  ] as const;

  return (
    <div className="flex flex-col gap-2 p-4 rounded-lg border bg-gray-50">
      <label className="text-sm font-medium text-gray-700">Agent Autonomy</label>
      <div className="flex gap-1">
        {levels.map((l) => (
          <button key={l.value} onClick={() => onChange(l.value)}
            className={`flex-1 py-2 px-3 rounded text-xs font-medium transition-colors ${
              level === l.value ? `${l.color} text-white` : 'bg-white text-gray-600 border hover:bg-gray-100'
            }`}>
            <div>{l.label}</div>
            <div className="text-[10px] opacity-80 mt-0.5">{l.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

### Rules

- Default to level 2 (Confirm) for new users.
- Allow per-task autonomy settings (coding = level 3, deployment = level 1).
- Never allow level 4 for irreversible operations (delete, deploy, payment).
- Persist user preference but reset to level 2 when context changes significantly.

## 3. Confidence Signal

Show how certain the agent is about its response or action.

### Visual Design

| Confidence | Visual | Behavior |
|------------|--------|----------|
| **High** (>0.9) | Green dot, solid border | Agent proceeds normally |
| **Medium** (0.6-0.9) | Amber dot, dashed border | Agent flags uncertainty, suggests verification |
| **Low** (<0.6) | Red dot, dotted border, warning icon | Agent pauses, asks for clarification or escalates |

### React + Tailwind Component

```tsx
function ConfidenceSignal({ confidence, explanation }: {
  confidence: number;
  explanation: string;
}) {
  const level = confidence > 0.9 ? 'high' : confidence > 0.6 ? 'medium' : 'low';
  const styles = {
    high:   { dot: 'bg-green-500', border: 'border-green-200', bg: 'bg-green-50', text: 'text-green-700' },
    medium: { dot: 'bg-amber-500', border: 'border-amber-200 border-dashed', bg: 'bg-amber-50', text: 'text-amber-700' },
    low:    { dot: 'bg-red-500',   border: 'border-red-200 border-dotted',  bg: 'bg-red-50',   text: 'text-red-700' },
  };
  const s = styles[level];

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs ${s.bg} ${s.text} border ${s.border}`}>
      <span className={`w-2 h-2 rounded-full ${s.dot}`} />
      <span>{Math.round(confidence * 100)}% confident</span>
      <span className="opacity-60">— {explanation}</span>
    </div>
  );
}
```

### Rules

- Derive confidence from concrete signals: retrieval score, number of sources, model logprobs.
- Do not invent confidence scores — if you cannot measure it, do not display it.
- Low confidence should change the UX: require confirmation, offer alternatives, show sources.

## 4. Action Audit Trail

Show what was done and provide undo capability.

### React + Tailwind Component

```tsx
interface AuditEntry {
  id: string;
  timestamp: string;
  agent: string;
  action: string;
  target: string;
  status: 'completed' | 'undone' | 'failed';
  undoable: boolean;
}

function AuditTrail({ entries, onUndo }: { entries: AuditEntry[]; onUndo: (id: string) => void }) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 border-b">
        Action History
      </div>
      <ul className="divide-y">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-center justify-between px-4 py-2 text-sm">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 font-mono">{entry.timestamp}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">{entry.agent}</span>
              <span>{entry.action}</span>
              <span className="text-gray-400">{entry.target}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs ${
                entry.status === 'completed' ? 'text-green-600' :
                entry.status === 'undone' ? 'text-gray-400 line-through' :
                'text-red-600'
              }`}>{entry.status}</span>
              {entry.undoable && entry.status === 'completed' && (
                <button onClick={() => onUndo(entry.id)}
                  className="text-xs px-2 py-0.5 rounded border text-gray-600 hover:bg-gray-100">
                  Undo
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Rules

- Log every agent action (not just user actions).
- Make destructive actions undoable for at least 30 seconds.
- Include: who (agent), what (action), where (target), when (timestamp), why (reasoning).
- Persist the audit trail — it is the user's evidence of what happened.

## 5. Escalation Pathway

Hand off to a human when the agent is stuck, uncertain, or facing a decision above its authority.

### Triggers for Escalation

- Confidence below threshold (configurable, default <0.5)
- Error after N retries (default 3)
- Decision requires human judgment (policy, ethics, ambiguity)
- User explicitly requests human involvement
- Cost threshold exceeded

### React + Tailwind Component

```tsx
function EscalationBanner({ reason, context, onTakeOver, onProvideGuidance, onDismiss }: {
  reason: string;
  context: string;
  onTakeOver: () => void;
  onProvideGuidance: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-amber-600 font-semibold">Agent needs your help</span>
      </div>
      <p className="text-sm text-gray-700 mb-1"><strong>Reason:</strong> {reason}</p>
      <p className="text-sm text-gray-600 mb-3">{context}</p>
      <div className="flex gap-2">
        <button onClick={onTakeOver}
          className="px-3 py-1.5 rounded bg-amber-600 text-white text-sm hover:bg-amber-700">
          I'll handle this
        </button>
        <button onClick={onProvideGuidance}
          className="px-3 py-1.5 rounded border border-amber-300 text-amber-700 text-sm hover:bg-amber-100">
          Give guidance
        </button>
        <button onClick={onDismiss}
          className="px-3 py-1.5 rounded text-gray-500 text-sm hover:bg-gray-100">
          Skip for now
        </button>
      </div>
    </div>
  );
}
```

### Rules

- Escalation is not failure — it is the agent being responsible.
- Always provide context (what was attempted, what went wrong, what options exist).
- After human resolution, agent should learn from the guidance for next time.

## 6. Streaming Response

Token-by-token display with thinking indicators. Users should never stare at a blank screen.

### States

| State | Display |
|-------|---------|
| **Thinking** | Pulsing dots or animated icon, "Analyzing your request..." |
| **Tool use** | "Searching codebase...", "Running tests...", "Reading file X..." |
| **Generating** | Tokens appear incrementally, cursor blinks at end |
| **Complete** | Cursor disappears, action buttons appear |

### React + Tailwind Component

```tsx
function StreamingResponse({ status, content, toolCalls }: {
  status: 'thinking' | 'tool_use' | 'generating' | 'complete';
  content: string;
  toolCalls: { name: string; status: string }[];
}) {
  return (
    <div className="space-y-2">
      {/* Tool call indicators */}
      {toolCalls.map((tool, i) => (
        <div key={i} className="flex items-center gap-2 text-xs text-gray-500 px-3 py-1 bg-gray-50 rounded">
          <span className={`w-1.5 h-1.5 rounded-full ${
            tool.status === 'running' ? 'bg-blue-500 animate-pulse' : 'bg-green-500'
          }`} />
          <span className="font-mono">{tool.name}</span>
          <span>{tool.status}</span>
        </div>
      ))}

      {/* Response content */}
      <div className="prose prose-sm">
        {content}
        {status === 'generating' && (
          <span className="inline-block w-2 h-4 bg-gray-800 animate-pulse ml-0.5" />
        )}
      </div>

      {/* Thinking indicator */}
      {status === 'thinking' && (
        <div className="flex items-center gap-1.5 text-sm text-gray-400">
          <span className="flex gap-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{animationDelay: '0ms'}} />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{animationDelay: '150ms'}} />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{animationDelay: '300ms'}} />
          </span>
          Thinking...
        </div>
      )}
    </div>
  );
}
```

## 7. Multi-Agent Status Dashboard

When multiple agents work in parallel, show their states, assignments, and communication.

### React + Tailwind Component

```tsx
interface AgentStatus {
  name: string;
  role: string;
  status: 'idle' | 'working' | 'blocked' | 'done' | 'error';
  currentTask: string | null;
  progress: number; // 0-100
  messages: { to: string; summary: string; timestamp: string }[];
}

function AgentDashboard({ agents }: { agents: AgentStatus[] }) {
  const statusColors = {
    idle: 'bg-gray-100 text-gray-600',
    working: 'bg-blue-100 text-blue-700',
    blocked: 'bg-amber-100 text-amber-700',
    done: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {agents.map((agent) => (
        <div key={agent.name} className="rounded-lg border p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-sm">{agent.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[agent.status]}`}>
              {agent.status}
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-2">{agent.role}</p>
          {agent.currentTask && (
            <p className="text-xs text-gray-700 mb-2 truncate">{agent.currentTask}</p>
          )}
          {agent.status === 'working' && (
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div className="bg-blue-500 h-1.5 rounded-full transition-all"
                style={{ width: `${agent.progress}%` }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

## 8. Explainability UI

Show the agent's chain of thought, tool calls, and source attribution.

### React + Tailwind Component

```tsx
interface ThoughtStep {
  type: 'reasoning' | 'tool_call' | 'observation' | 'decision';
  content: string;
  sources?: { title: string; url: string; relevance: number }[];
  collapsed?: boolean;
}

function ExplainabilityPanel({ steps }: { steps: ThoughtStep[] }) {
  const icons = {
    reasoning: 'text-purple-500',
    tool_call: 'text-blue-500',
    observation: 'text-green-500',
    decision: 'text-amber-500',
  };
  const labels = {
    reasoning: 'Thinking',
    tool_call: 'Tool Call',
    observation: 'Observation',
    decision: 'Decision',
  };

  return (
    <div className="border rounded-lg divide-y">
      <div className="px-4 py-2 bg-gray-50 text-sm font-medium text-gray-700">
        How I reached this answer
      </div>
      {steps.map((step, i) => (
        <details key={i} open={!step.collapsed} className="group">
          <summary className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-gray-50 text-sm">
            <span className={`font-mono text-xs ${icons[step.type]}`}>{labels[step.type]}</span>
            <span className="text-gray-600 truncate">{step.content.slice(0, 80)}...</span>
          </summary>
          <div className="px-4 pb-3 text-sm text-gray-700">
            <p>{step.content}</p>
            {step.sources && (
              <div className="mt-2 space-y-1">
                {step.sources.map((src, j) => (
                  <div key={j} className="flex items-center gap-2 text-xs">
                    <div className="w-12 bg-gray-200 rounded-full h-1">
                      <div className="bg-green-500 h-1 rounded-full"
                        style={{ width: `${src.relevance * 100}%` }} />
                    </div>
                    <a href={src.url} className="text-blue-600 hover:underline">{src.title}</a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
```

## 9. Error Recovery UX

What to show when an agent fails mid-task. The goal is: explain, offer options, preserve state.

### Error Display Rules

1. **Never show raw stack traces** to end users. Show a human-readable summary.
2. **Explain what was happening** when the error occurred (not just "something went wrong").
3. **Show what was completed** before the failure (partial progress is valuable).
4. **Offer recovery options:** retry, retry with different approach, undo completed steps, escalate.
5. **Preserve state** so the user does not lose work.

### React + Tailwind Component

```tsx
function AgentErrorRecovery({ error, completedSteps, onRetry, onRetryDifferent, onUndo, onEscalate }: {
  error: { summary: string; detail: string; step: string };
  completedSteps: string[];
  onRetry: () => void;
  onRetryDifferent: () => void;
  onUndo: () => void;
  onEscalate: () => void;
}) {
  return (
    <div className="rounded-lg border-2 border-red-200 bg-red-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-red-600 font-semibold">Agent encountered an issue</span>
      </div>
      <p className="text-sm text-gray-700">
        While <strong>{error.step}</strong>: {error.summary}
      </p>
      {completedSteps.length > 0 && (
        <div className="text-sm">
          <p className="text-gray-600 mb-1">Completed before failure:</p>
          <ul className="list-disc list-inside text-gray-600 text-xs space-y-0.5">
            {completedSteps.map((step, i) => (
              <li key={i} className="text-green-700">{step}</li>
            ))}
          </ul>
        </div>
      )}
      <details className="text-xs text-gray-500">
        <summary className="cursor-pointer hover:text-gray-700">Technical details</summary>
        <pre className="mt-1 p-2 bg-white rounded border text-xs overflow-x-auto">{error.detail}</pre>
      </details>
      <div className="flex flex-wrap gap-2">
        <button onClick={onRetry}
          className="px-3 py-1.5 rounded bg-red-600 text-white text-sm hover:bg-red-700">
          Retry
        </button>
        <button onClick={onRetryDifferent}
          className="px-3 py-1.5 rounded border border-red-300 text-red-700 text-sm hover:bg-red-100">
          Try different approach
        </button>
        <button onClick={onUndo}
          className="px-3 py-1.5 rounded border text-gray-600 text-sm hover:bg-gray-100">
          Undo all
        </button>
        <button onClick={onEscalate}
          className="px-3 py-1.5 rounded border text-gray-600 text-sm hover:bg-gray-100">
          Get help
        </button>
      </div>
    </div>
  );
}
```

### Rules

- Save agent state before displaying the error — the user may want to resume.
- "Try different approach" should use a different strategy, not just retry the same thing.
- Track error frequency — if the same error happens repeatedly, surface it as a systemic issue.
