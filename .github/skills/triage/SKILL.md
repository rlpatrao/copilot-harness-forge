---
name: triage
description: Manage the triage inbox (specs/triage/inbox.md) — a pre-work queue where discovery automations, drift sensors, and user notes drop candidate items. Distinct from feature_list.json (committed work). Items get promoted to feature_list.json via /feature-add or archived.
brd_ref: v3.1 §4 (v3.1.7)
argument-hint: "[add \"<note>\" | list | promote <id> | archive <id>]"
---

# triage — Triage Inbox

The triage inbox is a pre-work queue at `specs/triage/inbox.md`. Items live here **before** they become tracked work in `feature_list.json`.

Adapted from Addy Osmani's loop-engineering "Triage inbox" pattern per BRD v3.1 §4 (v3.1.7).

## Why triage

`feature_list.json` is append-only and every entry demands verification. It's expensive to add. But agents and automations discover candidate work all the time — findings, drift, "interesting things I noticed" — that don't yet warrant a committed feature entry.

The triage inbox is where those go. Humans (or a periodic promotion pass) skim the inbox and:
- **Promote** actionable items to `feature_list.json` via `/feature-add`
- **Archive** already-fixed / no-longer-relevant / duplicate items
- **Leave in place** if the item is a note or reminder that doesn't need to become work

## Format

`specs/triage/inbox.md` is a Markdown file. One item per subsection. Frontmatter is a YAML block for machine parsing.

```markdown
# Triage inbox

## T-2026-06-11-01 · session-start hook overwrites existing state on re-scaffold
```yaml
source: user-note
discovered_at: 2026-06-11T15:00:00Z
severity: medium
tags: [scaffold, state, regression]
suggested_next: /feature-add
```

If a project re-runs /scaffold in an already-scaffolded directory, hooks/session-start.js
receives an empty state/ dir because scaffold Step 8 rewrites state seeds. Consider a
guard: skip state seeds if state/ has any file older than 24h.

## T-2026-06-11-02 · triage entry template ready
...
```

IDs are `T-YYYY-MM-DD-NN`. Sources: `user-note`, `drift-sensor`, `agent-finding`, `automation`, `code-review`.

## Sub-commands

### `/triage add "<note>"`

Append a new item. Auto-assigns an ID. Sets `source: user-note`, `discovered_at: <now>`, `severity: medium`, `tags: []`, `suggested_next: /feature-add`.

The full note text becomes the body of the item.

### `/triage list [--severity high|medium|low] [--tag TAG] [--limit N]`

Print the current inbox, optionally filtered. Default: last 20 items sorted by `discovered_at` desc.

### `/triage promote <id>`

Move item `<id>` into `feature_list.json` via `/feature-add`. Spawns the Critic subagent (existing feature-add flow). On successful append to `feature_list.json`, marks the triage item with `status: promoted → <feature-id>` and moves it into a "Promoted" section at the bottom.

### `/triage archive <id> [--reason "<text>"]`

Mark item as archived. Moves it into an "Archived" section at the bottom with `archived_at`, `archived_reason`.

## Where inputs come from

| Source | Populated by |
|---|---|
| `user-note` | This skill, when the human runs `/triage add` |
| `drift-sensor` | v3.1.9 code-graph drift (when it lands), `spec-auditor` outputs |
| `agent-finding` | `findings-collector.js` opt-in feedback pipeline |
| `automation` | v3.1.8 scheduled automations (cron / GH Actions writing to `specs/triage/inbox.md`) |
| `code-review` | `code-reviewer` agent when it finds an issue outside the current sprint contract |

Not everything an agent discovers becomes a commit. The inbox is the intermediate buffer.

## Gate

For every triage action:

- [ ] `specs/triage/inbox.md` exists (create with template on first `/triage add`)
- [ ] Item ID follows `T-YYYY-MM-DD-NN` pattern
- [ ] Frontmatter YAML block is valid (source, discovered_at, severity, tags, suggested_next)
- [ ] Body is non-empty
- [ ] On promote/archive: item is moved to the appropriate section, not deleted

## Not covered in v3.1.7

- Automated promotion via critic (deferred; requires human review for now)
- Cross-project triage dedup (deferred to memory OS v3.1.11)
- SLA on triage inbox size (a triage inbox with >200 open items is a signal, not a bug — but we don't warn on it in this increment)
