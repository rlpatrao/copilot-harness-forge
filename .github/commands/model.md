---
description: Switch the active model mid-session. Preserves thinking blocks across providers (BRD §6.2).
argument-hint: <provider/model-id>
# generated-from: commands/model.md
---

# /model

Switches the active LLM mid-session. Uses the `skills/cross-provider-handoff` skill to preserve thinking blocks across the conversion.

## Examples

- `/model anthropic/claude-opus-4-7` — switch to Opus
- `/model openai/gpt-5` — switch to GPT-5 (Anthropic thinking blocks → reasoning_content)
- `/model google/gemini-2.5-pro` — switch to Gemini
- `/model bedrock/anthropic.claude-sonnet-4-6` — same Claude family, different provider (no thinking-block conversion needed)

## When to use

- A workflow declared in `config/workflows.yaml` is rate-limited on its primary; you want to fail over manually.
- You started in Sonnet to save cost; the task got harder and you want to escalate to Opus.
- A specific provider has a capability the current one lacks (e.g., longer context, specific tool).

## Hard rules

- **At most one switch per turn.** If the new model also fails, surface the error rather than chain.
- **Cost is logged at the new provider's rate.** `hooks/cost-tracker.js` picks up the active provider from session metadata.
- **Anthropic prompt-cache is invalidated on switch.** Be deliberate.

See `skills/cross-provider-handoff/SKILL.md` for conversion semantics and BRD §6.2 for failover policy.
