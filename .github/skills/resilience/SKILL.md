---
name: resilience
description: Add resilience patterns to existing code — retry with backoff, circuit breakers, timeouts, fallbacks, and graceful degradation.
---

# Resilience Skill

Add resilience patterns to existing service code that makes external API calls or depends on unreliable resources.

## Usage

```
/resilience
```

Also called by the generator during implementation of external integrations.

---

## Prerequisites

- Application code exists with at least one external API call or database dependency.
- `project-manifest.json` exists with `stack` section populated.

---

## Step 1 — Scan Codebase for External Calls

Identify all locations in the codebase that make:
- HTTP/REST API calls
- gRPC calls
- Database queries (especially cross-service)
- Message queue publish/consume
- Third-party SDK calls (payment, email, SMS, etc.)

---

## Step 2 — Add Retry with Exponential Backoff

For each external call:
- Wrap with retry logic (max attempts, base delay, multiplier, max delay)
- Add jitter to prevent thundering herd
- Configure retryable vs non-retryable error types (retry 503, don't retry 400)
- Log each retry attempt with attempt number and delay

---

## Step 3 — Add Circuit Breakers

For flaky or high-latency endpoints:
- Implement circuit breaker (closed/open/half-open states)
- Configure failure threshold to trip (e.g., 5 failures in 60 seconds)
- Configure recovery timeout for half-open probe
- Emit metrics on state transitions

---

## Step 4 — Add Timeout Management

For all external calls:
- Set connection timeout (fail fast on unreachable hosts)
- Set read timeout (fail on slow responses)
- Set overall request timeout (cap total duration including retries)
- Cancel in-flight requests on timeout

---

## Step 5 — Add Fallback Responses

For non-critical dependencies:
- Define fallback response for each degraded dependency
- Cache last-known-good responses where appropriate
- Return partial results instead of full failure
- Flag responses as degraded in API output

---

## Step 6 — Add Graceful Degradation Paths

For the application as a whole:
- Identify critical vs non-critical features
- Non-critical features degrade silently (log warning, return default)
- Critical features fail loudly with clear error messages
- Health endpoint reflects degraded state

---

## Step 7 — Update Tests

Generate or update tests to verify:
- Retry succeeds after transient failure
- Retry stops after max attempts
- Circuit breaker trips after threshold failures
- Circuit breaker recovers in half-open state
- Timeout fires for slow responses
- Fallback returns expected default

---

## Outputs

| File | Description |
|------|-------------|
| `src/lib/resilience.py` (or `circuit-breaker.ts`) | Retry, circuit breaker, timeout utilities |
| Modified service files | Existing calls wrapped with resilience decorators |
| Resilience tests | New tests verifying retry, circuit breaker, timeout behavior |

---

## References

- `.claude/skills/resilience-patterns/SKILL.md` — patterns and configuration guidance

---

## Gate Behavior

- Tests verify retry succeeds after transient failure
- Circuit breaker trips after configured number of failures
- Timeout stops hanging calls within configured duration
- Fallback returns valid response when dependency is down

---

## Gotchas

- **Don't retry non-idempotent operations.** POST requests that create resources need idempotency keys before retrying.
- **Circuit breakers need per-endpoint state.** A single global circuit breaker is almost never correct.
- **Timeouts compound with retries.** 3 retries x 30s timeout = 90s total. Set overall request budgets.
- **Fallbacks can mask real outages.** Always log when serving fallback responses so monitoring can detect degradation.
