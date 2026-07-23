---
name: status
description: Generate and display a terminal dashboard showing project progress — stories spec'd, coded, unit-tested, and E2E-verified per group. Writes to specs/status.md.
argument-hint: "[--brief]"
---

# /status — Project Status Dashboard

Generate a terminal-friendly ASCII dashboard showing project health at a glance. Writes to `specs/status.md` and prints to terminal.

## Usage

```
/status              # full dashboard
/status --brief      # one-line summary
```

Auto-displayed after each group verdict, phase transition, and session resume.

---

## Steps

### Step 1 — Read Data Sources

Read all available sources. If a file is missing, skip that section gracefully — never fail.

| Source | File | What to extract |
|--------|------|----------------|
| Stories | `features.json` | Per-story: id, group, passes, failure_reason, failure_layer, last_evaluated |
| Story specs | `specs/stories/E*-S*.md` or `specs/stories/*-*.md` | File existence = spec'd |
| Session | `claude-progress.txt` | Current session number, phase, groups completed/remaining |
| Iterations | `.claude/state/iteration-log.md` | Last 5 entries for Recent Activity |
| Coverage | `.claude/state/coverage-baseline.txt` | Current coverage percentage |
| Mutations | `.claude/state/mutation-baseline.txt` | Current mutation score |
| Rules | `.claude/state/learned-rules.md` | Count of `## Rule` headings |
| Cost | `.claude/state/cost-log.json` | Aggregate estimated cost |
| Config | `project-manifest.json` | Project name, mode, budget |
| BRD version | `specs/brd/changelog.md` | Latest version number |
| Dependencies | `specs/stories/dependency-graph.md` | Group blocking relationships |
| Failures | `specs/reviews/eval-failures-*.json` | Specific failure details for E2E section |

### Step 2 — Compute Per-Group Aggregates

For each group in `features.json`:

| Metric | How to compute |
|--------|---------------|
| **Spec'd** | Count stories in this group that have a matching file in `specs/stories/` |
| **Coded** | Count stories where `passes` is not `null` (has been evaluated at least once) OR where implementing files exist (check `iteration-log.md` for `implement` + `PASS` entries for this story) |
| **Unit ✓** | Count stories that have a `PASS` entry in `iteration-log.md` with action `implement` (unit tests pass as part of implementation gate) |
| **E2E ✓** | Count stories where `passes: true` in `features.json` |

Group status:
- All E2E pass → `✓ DONE`
- Has failures → `⚡ {n} FAIL`
- Currently being worked on → `▸ ACTIVE`
- Not started → `○ PENDING`
- Blocked by another group → `⏳ BLOCKED`

### Step 3 — Build E2E Verification Detail

For each story in `features.json`:
- `passes: true` → `✓ {id}  {story}  ({layers verified})`
- `passes: false` → `✗ {id}  {story}  ({failure_layer}: {failure_reason})`
- `passes: null` → `○ {id}  {story}  (pending)`

Show failed stories first, then pending, then passed. Limit to 15 entries. If more, show count: `... and {n} more stories`

### Step 4 — Build Blockers List

A story is a blocker if:
- `passes: false` AND has been attempted 2+ times (check `iteration-log.md` for retry count)
- A group is blocked if it depends on an incomplete group (check `dependency-graph.md`)

### Step 5 — Generate specs/status.md

Write the dashboard using this exact format:

```
═══════════════════════════════════════════════════════════
 PROJECT STATUS — {name}             v{version} | {mode} Mode
 Updated: {ISO timestamp}            Session: {n}
═══════════════════════════════════════════════════════════

 PIPELINE PROGRESS
 ─────────────────
 BRD {✓|○} → Architect {✓|○} → Spec {✓|○} → Design {✓|○} → Build [{current}]

 STORY STATUS
 ────────────
 Group │ Stories │ Spec'd │ Coded │ Unit ✓ │ E2E ✓ │ Status
 ──────┼─────────┼────────┼───────┼────────┼───────┼────────
 {per-group rows}
 ──────┼─────────┼────────┼───────┼────────┼───────┼────────
 Total │  {n}    │ {n/n}  │ {n/n} │ {n/n}  │ {n/n} │ {pct}% E2E ✓

 E2E VERIFICATION DETAIL
 ───────────────────────
 {per-story E2E lines — failures first}

 QUALITY RATCHET
 ───────────────
 Coverage:    {n}% (baseline: {n}%) {▲|▼|—}
 Mutations:   {n}% (baseline: {n}%) {▲|▼|—}
 Arch violations: {n}
 Learned rules:   {n}

 RECENT ACTIVITY (last 5)
 ────────────────────────
 {last 5 iteration-log entries}

 BLOCKERS
 ────────
 {blocker lines, or "None" if clean}

 BRD: v{n} ({changes} changes) | Cost: ~${n} ({pct}% of budget)
═══════════════════════════════════════════════════════════
```

### Step 6 — Print to Terminal

Display the full content of `specs/status.md`.

### Brief Mode (--brief)

If `--brief` flag, skip Steps 2-5 and output only:
```
Status: {e2e_pass}/{total} E2E ✓ ({pct}%) | Coverage: {n}% | {current_group} | {blocker_count} blockers
```

---

## Handling Missing Data

| Missing file | Behavior |
|-------------|----------|
| No `features.json` | Show: "No stories yet — run /spec first" |
| No `iteration-log.md` | Skip Recent Activity section |
| No `coverage-baseline.txt` | Show "Coverage: —" |
| No `mutation-baseline.txt` | Show "Mutations: —" |
| No `cost-log.json` | Show "Cost: —" |
| No `changelog.md` | Show "BRD: v1" |
| No `dependency-graph.md` | Skip group-blocking detection |
| No `claude-progress.txt` | Show "Session: 1" |
| No `project-manifest.json` | Show "Project: (unknown)" |

Never fail. Show what you can, skip what you can't.

---

## Gotchas

- **E2E is the headline metric.** The overall E2E pass percentage is the most important number on the dashboard. Make it prominent.
- **Don't block the pipeline.** Status display is informational. Never prompt for input. Show and continue.
- **Keep it under 80 lines.** Truncate E2E detail and Recent Activity if needed.
- **Print, don't persist history.** `specs/status.md` is overwritten each time — it's a snapshot, not a log. Historical data lives in `iteration-log.md` and `claude-progress.txt`.
- **Terminal width.** Keep lines under 70 characters where possible. The box-drawing characters should render in any modern terminal.
