---
name: resilience-patterns
description: Reference patterns for building resilient AI-native applications — retry, fallback, circuit breaker, graceful degradation, checkpoint/resume, and LLM-specific error handling.
---

# Resilience Patterns

Patterns for building AI-native applications that survive failures gracefully. Every pattern includes rationale, implementation guidance, and code examples.

## Retry with Exponential Backoff + Jitter

Transient failures (network blips, 503s, rate limits) resolve themselves. Retry with increasing delays and random jitter to avoid thundering herd.

**Formula:** `delay = min(base * 2^attempt + random(0, jitter), max_delay)`

### Python (tenacity)

```python
from tenacity import retry, stop_after_attempt, wait_exponential_jitter

@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential_jitter(initial=1, max=60, jitter=2),
    retry=retry_if_exception_type((ConnectionError, TimeoutError)),
)
def call_model(prompt: str) -> str:
    return client.messages.create(model="claude-sonnet-4-20250514", messages=[{"role": "user", "content": prompt}])
```

### TypeScript (cockatiel)

```typescript
import { retry, handleAll, ExponentialBackoff } from 'cockatiel';

const retryPolicy = retry(handleAll, {
  maxAttempts: 5,
  backoff: new ExponentialBackoff({ initialDelay: 1000, maxDelay: 60000 }),
});

const result = await retryPolicy.execute(() => callModel(prompt));
```

### Rules

- Always add jitter — without it, retries from multiple clients synchronize and amplify load.
- Set a max delay cap (60s is reasonable for most APIs).
- Log each retry with attempt number and delay for debugging.
- Do NOT retry 400-level errors (except 429) — they will never succeed.

## Data Source Fallback

When live data sources are unavailable (external APIs, scraping targets, real-time feeds), always have a fallback. Stale data is better than no data.

```
Live fetch → Cache (Redis/DB) → Stale file → Default/empty state → Error with explanation
```

**Rule:** Never let a feature fail entirely because one external data source is unreachable. Every external data dependency must have at least one fallback level.

**Anti-pattern:** Code that calls `fetch(url)` and crashes or shows a blank page on failure. Must catch, fallback, and inform the user.

## Model Fallback Chains

When the primary model is unavailable, degrade through a chain rather than failing outright.

```
Primary (Opus) → Secondary (Sonnet) → Tertiary (Haiku) → Local (Qwen) → Graceful Stop
```

### Implementation

```python
FALLBACK_CHAIN = [
    {"model": "claude-opus-4-20250514", "provider": "anthropic"},
    {"model": "claude-sonnet-4-20250514", "provider": "anthropic"},
    {"model": "claude-haiku-4-20250514", "provider": "anthropic"},
    {"model": "qwen3-coder", "provider": "local"},
]

async def call_with_fallback(prompt: str) -> tuple[str, str]:
    """Returns (response, model_used). Raises if all fail."""
    for config in FALLBACK_CHAIN:
        try:
            response = await call_model(config["model"], config["provider"], prompt)
            return response, config["model"]
        except (RateLimitError, ServiceUnavailableError) as e:
            log.warning(f"{config['model']} failed: {e}, trying next")
            continue
    raise AllModelsUnavailableError("Exhausted fallback chain")
```

### Rules

- Log which model was actually used — this matters for quality tracking.
- Adjust expectations per tier: Opus output may need different parsing than Haiku output.
- Never silently downgrade for consequential decisions — inform the user.
- The "Graceful Stop" at the end means: save state, inform user, queue for retry later.

## Circuit Breaker

Stop calling a failing service to let it recover. Prevents cascade failures and wasted retries.

### States

| State | Behavior |
|-------|----------|
| **Closed** | Normal operation. Track failure count. |
| **Open** | All calls fail immediately (no network request). Timer starts. |
| **Half-Open** | Allow one probe request. If it succeeds, close. If it fails, reopen. |

### Configuration

```python
class CircuitBreaker:
    def __init__(
        self,
        failure_threshold: int = 5,      # failures before tripping
        cooldown_seconds: float = 30.0,   # time in open state
        success_threshold: int = 2,       # successes to close from half-open
    ): ...
```

### Rules

- Trip threshold should be tuned per service (LLM APIs: 5 failures in 60s is reasonable).
- Cooldown should match the service's typical recovery time.
- Emit metrics when the breaker trips — this is a high-signal alert.
- Combine with fallback: when the primary circuit opens, route to secondary.

## Graceful Degradation

Degrade features rather than crashing the application.

| Failure | Degraded Behavior |
|---------|-------------------|
| LLM unavailable | Show cached/template responses, disable AI features |
| Embedding service down | Fall back to keyword search |
| Vector DB unreachable | Serve from cache, disable RAG |
| Reranker timeout | Return unranked results |
| Agent stuck in loop | Kill after timeout, return partial results |

### Implementation Pattern

```python
async def get_recommendation(user_id: str) -> Recommendation:
    try:
        return await ai_recommendation_engine(user_id)
    except ModelUnavailableError:
        log.warning("AI recommendations unavailable, falling back to rules-based")
        return rules_based_recommendation(user_id)
    except TimeoutError:
        log.warning("AI recommendations timed out, returning cached")
        return get_cached_recommendation(user_id)
```

### Rules

- Always have a non-AI fallback for critical paths.
- Make degradation visible to users (banner, badge, tooltip) — do not pretend degraded output is full quality.
- Track degradation frequency — if it is constant, the primary path has a reliability problem.

## Timeout Management

Every external call needs a timeout. No exceptions.

| Operation | Recommended Timeout |
|-----------|-------------------|
| LLM API call (simple) | 30s |
| LLM API call (complex/long output) | 120s |
| Embedding generation | 10s |
| Vector DB query | 5s |
| Agent gate execution | 300s |
| Full agent pipeline | 1800s (30 min) |
| File I/O | 10s |

### Hierarchical Timeouts

```
Pipeline timeout (30 min)
  └── Gate timeout (5 min)
        └── Operation timeout (30s-120s)
```

The outer timeout always wins. If a gate takes too long, the pipeline kills it even if individual operations are within their limits.

### Rules

- Set timeouts at every level: operation, gate, pipeline.
- Use `asyncio.wait_for()` (Python) or `AbortController` (TypeScript) — not just socket timeouts.
- Log timeout events with context (which operation, how long it ran, what it was doing).

## Idempotent Operations

Operations that can be safely retried without side effects.

### Atomic File Writes

```python
import tempfile, os

def atomic_write(path: str, content: str) -> None:
    """Write to temp file, then rename. Rename is atomic on POSIX."""
    dir_name = os.path.dirname(path)
    with tempfile.NamedTemporaryFile(mode='w', dir=dir_name, delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    os.replace(tmp_path, path)  # atomic on same filesystem
```

### Duplicate-Safe DB Operations

```python
# Use upsert instead of insert
await db.execute("""
    INSERT INTO results (run_id, gate, status, report)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (run_id, gate)
    DO UPDATE SET status = $3, report = $4, updated_at = now()
""", run_id, gate, status, report)
```

### Rules

- Every state-changing operation should be idempotent or wrapped in a transaction.
- Use unique operation IDs (run_id + gate) to detect duplicates.
- File writes must be atomic — a crash mid-write should not corrupt state.

## Checkpoint / Resume

Save state after each gate pass so crashes do not restart the entire pipeline.

### State File

```json
{
  "run_id": "abc-123",
  "started_at": "2026-03-27T10:00:00Z",
  "current_gate": 5,
  "gates_passed": [1, 2, 3, 4, 5],
  "gates_failed": [],
  "artifacts": {
    "gate_3_report": "specs/reviews/lint-report.md",
    "gate_5_report": "specs/reviews/evaluator-report.md"
  },
  "resumable": true
}
```

### Resume Logic

```python
def resume_pipeline(state_path: str) -> int:
    state = load_state(state_path)
    if not state["resumable"]:
        raise NonResumableError("Pipeline marked non-resumable")
    next_gate = max(state["gates_passed"]) + 1
    log.info(f"Resuming from gate {next_gate} (gates 1-{next_gate-1} already passed)")
    return next_gate
```

### Rules

- Write checkpoint after each gate pass, before starting the next gate.
- Use atomic writes for the state file (see above).
- Include enough context in the checkpoint to resume without re-reading all prior outputs.
- Mark pipeline as non-resumable if a destructive operation (DB migration, deployment) has started.

## LLM-Specific Error Handling

### 429 Rate Limits

```python
from tenacity import retry, retry_if_exception_type, wait_exponential_jitter

@retry(
    retry=retry_if_exception_type(RateLimitError),
    wait=wait_exponential_jitter(initial=5, max=120, jitter=5),
    stop=stop_after_attempt(8),
)
async def call_llm(prompt: str) -> str:
    return await client.messages.create(...)
```

Read the `retry-after` header if present and wait at least that long.

### Context Window Overflow

When the input exceeds the model's context window:

1. **Truncate from the middle** — keep system prompt + recent context, drop middle.
2. **Summarize and retry** — compress prior conversation into a summary, retry with summary.
3. **Chunk and merge** — split input into chunks, process each, merge results.

```python
def handle_context_overflow(messages: list, max_tokens: int) -> list:
    token_count = count_tokens(messages)
    if token_count <= max_tokens:
        return messages
    # Keep system message and last N messages, summarize the rest
    system = messages[0]
    recent = messages[-5:]
    middle = messages[1:-5]
    summary = summarize_messages(middle)
    return [system, {"role": "user", "content": f"Prior conversation summary: {summary}"}] + recent
```

### Partial Responses

When the model stops mid-response (max_tokens hit, network drop):

1. Check `stop_reason` — if `max_tokens`, the response was truncated.
2. If truncated: continue generation with the partial response as prefix.
3. If network drop: retry the full request (the partial response is unreliable).

### Model Unavailability

1. Check status page / health endpoint first.
2. If planned maintenance: wait and retry after window.
3. If unplanned: activate fallback chain (see above).
4. Log the incident with timestamp and duration for reliability tracking.
