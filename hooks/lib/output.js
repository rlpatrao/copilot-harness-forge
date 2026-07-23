// Dual-format hook output emitter (v3.5 Copilot port — BRD v3.5 §6a).
//
// Claude Code and GitHub Copilot CLI agree on hook *semantics* (exit codes,
// decision:"block"+reason, permissionDecision) but differ on the *envelope*
// for injected context:
//
//   Claude Code (default):
//     { hookSpecificOutput: { hookEventName, additionalContext, ...extras },
//       decision, reason, permissionDecision, ... }
//
//   Copilot CLI (COPILOT=1) — flat, no hookSpecificOutput wrapper:
//     { additionalContext, ...extras, decision, reason, permissionDecision, ... }
//
// Hooks already build the Claude-shaped object. They now hand that object to
// emit() instead of writing it directly. Under Claude Code emit() is a
// pass-through (byte-for-byte identical to the previous behavior); under
// COPILOT=1 it lifts hookSpecificOutput's fields to the top level and drops
// the wrapper (Copilot has no hookEventName field — the event is already known
// from which hook file fired).
//
// Field groups handled, in BOTH shapes:
//   1. additionalContext        — injected note text
//   2. decision / reason        — Stop / PreToolUse block (ralph-loop, rule-gate)
//   3. permissionDecision /     — PreToolUse permission verdict
//      permissionDecisionReason
//   4. arbitrary extras nested under hookSpecificOutput (compaction-stage's
//      spawn_subagent / subagent_input / checkpoint_required / handoff_to)
//
// Top-level decision/reason/permissionDecision are never rewrapped — they are
// already the same shape in both runtimes, so they pass through untouched.

function isCopilot() {
  return process.env.COPILOT === '1';
}

// Transform a Claude-shaped hook output object into the runtime's wire shape.
// Pure — returns a new object, does not mutate the input or perform I/O. Split
// out so tests can assert the mapping without capturing stdout.
function shape(output) {
  if (!isCopilot()) return output;
  if (!output || typeof output !== 'object' || output.hookSpecificOutput == null) {
    return output;
  }
  const { hookSpecificOutput, ...rest } = output;
  // Drop hookEventName (Copilot has no such field); hoist every other nested
  // field to the top level alongside the already-top-level decision/reason.
  const { hookEventName, ...nested } = hookSpecificOutput;
  void hookEventName;
  return { ...rest, ...nested };
}

// Emit a hook result to stdout in the active runtime's shape. Accepts the
// Claude-shaped object the hook already constructs. Optional leading eventName
// is accepted for call-site readability / parity with BRD §6a's sketch but is
// not required — the event is carried inside hookSpecificOutput.hookEventName
// when present.
function emit(eventNameOrOutput, maybeOutput) {
  const output = maybeOutput === undefined ? eventNameOrOutput : maybeOutput;
  process.stdout.write(JSON.stringify(shape(output)));
}

module.exports = { emit, shape, isCopilot };
