---
description: Propose a new feature_list.json entry. Spawns the Critic subagent to validate the proposal before merge.
argument-hint: <one-sentence feature description>
# generated-from: commands/feature-add.md
---

# /feature-add

Per BRD §3.2, entries in `feature_list.json` are append-only via this command. Direct edits that add or remove entries are blocked by `hooks/feature-edit-guard.js`.

## Workflow

1. You describe the proposed feature in `$ARGUMENTS`.
2. The orchestrator spawns the Critic subagent (`agents/critic.md`) with the current `feature_list.json`, the proposed entry, and the relevant BRD section.
3. The Critic returns VERDICT: pass | block | needs-revision.
4. On `pass`, the orchestrator appends the new entry with `passes: false` to the array. The `feature-edit-guard` hook recognizes the append (length grew by exactly 1, all existing entries unchanged) and allows it.
5. On `block` or `needs-revision`, the proposal is rejected with the Critic's rationale.

## What the Critic checks

- Is this actually a new feature, or an aspect of an existing entry that should be folded into its `steps[]` instead?
- Does the description name a verifiable success criterion? ("User can log in" is verifiable; "Auth works well" is not.)
- Are `steps[]` decomposed enough that an E2E run can confirm each?
- Does `verification_artifact_path` follow the `verification/<id>.{png,json}` convention?
- Are `depends_on[]` entries that already exist in the list?

## Note on auto-add by Initializer

The Initializer agent (BRD §3.1) produces the initial seed without going through `/feature-add` — that path is for additions *after* project genesis. The feature-edit-guard hook allows initial seeding (first-time Write) when every entry has `passes: false`.
