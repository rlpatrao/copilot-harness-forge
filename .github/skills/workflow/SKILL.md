---
name: workflow
description: Scaffold durable workflow orchestration — workflow definitions, activities, HITL signal handlers, checkpoint/resume, and saga compensations.
---

# Workflow Skill

Scaffold durable workflow orchestration based on the architect's engine choice and process requirements.

## Usage

```
/workflow
```

Also invoked by the architect when the BRD describes long-running or approval processes.

---

## Prerequisites

- `project-manifest.json` exists with `stack` section populated.
- Architect's design includes workflow engine choice and process definitions in `specs/design/`.

---

## Step 1 — Read Architect's Design

Read architect's design documents for:
- Workflow engine choice (Temporal, Inngest, custom state machine)
- Process definitions (steps, decision points, approval gates)
- Retry and timeout policies
- Compensation/rollback requirements
- Human-in-the-loop (HITL) approval points

---

## Step 2 — Generate Workflow Definitions

Based on engine choice:

**Temporal:**
- Workflow classes with `@workflow.defn` decorators
- Activity stubs with retry policies
- Signal and query handlers for HITL
- Worker configuration

**Inngest:**
- Function definitions with step primitives
- Event schemas and triggers
- Sleep/waitForEvent for HITL gates
- Concurrency controls

**Custom (state machine + PostgreSQL):**
- State machine definition (states, transitions, guards)
- PostgreSQL state store with advisory locks
- Transition executor with idempotency keys
- Polling worker for scheduled transitions

---

## Step 3 — Generate Activity Definitions

Generate activity/step implementations:
- Each activity is independently retriable
- Retry policies: max attempts, backoff multiplier, non-retryable error types
- Timeouts: start-to-close, schedule-to-start, heartbeat
- Idempotency: activities must be safe to retry

---

## Step 4 — Generate HITL Signal Handlers

Generate human-in-the-loop approval gates:
- Signal/event handler that pauses workflow execution
- API endpoint to submit approval/rejection
- Timeout with escalation if approval not received
- Audit log entry for approval decisions

---

## Step 5 — Generate Checkpoint/Resume Logic

Generate durability mechanisms:
- State persistence after each completed step
- Resume from last checkpoint after crash
- Deduplication of already-completed steps
- Dead letter handling for permanently failed workflows

---

## Step 6 — Generate Saga Compensations

If multi-step transactions are required:
- Compensation function for each forward step
- Compensation execution in reverse order on failure
- Compensation idempotency (safe to run multiple times)
- Partial completion tracking

---

## Step 7 — Wire into API

Generate API endpoints:
- Start workflow endpoint
- Query workflow status endpoint
- Submit signal/approval endpoint
- Cancel workflow endpoint
- List active workflows endpoint

---

## Outputs

Outputs depend on engine choice:

| Engine | Files |
|--------|-------|
| Temporal | `src/workflows/`, `src/activities/`, `src/workers/` |
| Inngest | `src/functions/`, `src/events/` |
| Custom | `src/state_machine/`, `src/stores/workflow_store.py`, `migrations/` |

---

## Gate Behavior

- Workflow completes happy path end-to-end
- Workflow resumes correctly after simulated crash (kill and restart worker)
- HITL approval gate pauses execution and resumes on signal
- Saga compensations execute on mid-workflow failure

---

## Gotchas

- **Activities must be idempotent.** Retries will re-execute activities — use idempotency keys for external side effects.
- **Don't put business logic in workflow definitions.** Workflows are orchestrators; activities do the work.
- **HITL timeouts need escalation.** A workflow stuck waiting for approval forever is a bug.
- **Test compensations independently.** Don't assume compensations work just because forward steps do.
