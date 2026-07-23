---
name: progress-reporting-check
description: Verify that long-running operations with UI report incremental progress. Flags blocking all-at-once calls that leave users staring at a spinner with no feedback.
---

# Progress Reporting Check

Reference patterns for verifying that long-running operations report incremental progress to the user. Blocking all-at-once calls with no feedback are a UX failure.

## When This Applies

Any operation that takes more than 2 seconds and has a UI:
- Batch processing (file uploads, data imports, bulk operations)
- AI/LLM operations (inference, embedding generation, RAG pipeline)
- Crawling/scraping (multi-page fetches)
- Report generation (PDF, CSV exports)
- Database migrations or seed operations

## Required Patterns

### 1. Progress Indicator

Every long operation must show one of:
- **Determinate progress** (preferred): "Processing 45 of 120 items (38%)" with a progress bar
- **Indeterminate progress** (acceptable): spinner/pulse with status text that updates ("Fetching page 3...", "Generating embeddings...")
- **Never acceptable**: frozen UI, static "Loading..." with no updates, blank page

### 2. Incremental Updates

Operations that process N items must report after each item or batch, not only at completion:

```python
# BAD — user sees nothing until all 500 items are done
results = [process(item) for item in items]
return results

# GOOD — user sees progress after each batch
for i in range(0, len(items), batch_size):
    batch = items[i:i + batch_size]
    results.extend([process(item) for item in batch])
    yield {"progress": i + len(batch), "total": len(items)}
```

```typescript
// BAD — Promise.all blocks until everything finishes
const results = await Promise.all(items.map(process));

// GOOD — process sequentially or in batches with progress callback
for (let i = 0; i < items.length; i += batchSize) {
  const batch = items.slice(i, i + batchSize);
  const batchResults = await Promise.all(batch.map(process));
  results.push(...batchResults);
  onProgress({ completed: i + batch.length, total: items.length });
}
```

### 3. Cancelability

Operations longer than 10 seconds should be cancelable:
- Backend: accept an AbortSignal or check a cancellation flag per iteration
- Frontend: show a "Cancel" button that sends an abort signal

### 4. Error During Progress

If an operation fails partway through:
- Show how far it got: "Failed at item 45 of 120"
- Preserve partial results if possible
- Never silently swallow the error and show "0 results"

## Code Reviewer Integration

The code reviewer (Step 7) should flag:
- `Promise.all()` on arrays of unknown/large size without progress callback
- List comprehensions or `map()` on large collections without yield/callback
- API endpoints that process batch input without streaming response
- Frontend components that show only a static spinner for operations that could take >2s

## Gotchas

- **Don't over-report.** Updating progress 1000 times per second is worse than no progress — it floods the UI. Batch updates: report every N items or every 500ms, whichever comes first.
- **Server-Sent Events or WebSocket for real-time.** HTTP request/response can't report mid-operation. Use SSE (`text/event-stream`), WebSocket, or polling for live progress.
- **Estimate remaining time carefully.** "2 minutes remaining" that jumps to "45 minutes remaining" is worse than no estimate. If you can't estimate reliably, show items completed / total instead.
