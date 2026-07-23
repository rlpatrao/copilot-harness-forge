---
name: context-engineering
description: Reference patterns for managing LLM context windows — token budgets, prompt caching, progressive disclosure, context compression, cost optimization, and anti-patterns.
---

# Context Engineering

Patterns for efficiently managing LLM context windows across multi-agent systems. Every wasted token costs money and displaces useful information.

## Token Budget Guidelines

Each agent role has a different context need. Budget accordingly.

| Agent | Recommended Budget | What Goes In | What Stays Out |
|-------|-------------------|-------------|----------------|
| **Architect** | 50K tokens | BRD, stack learnings (similar projects), manifest template, design patterns | Full codebase, all stories, implementation details |
| **Generator** | 80K per story | Current story spec, dependency specs, owned files, learned rules, architecture doc | Other stories, evaluator reports, review history |
| **Evaluator** | 30K per check | Acceptance criteria, app URL, Playwright patterns, current test file | All source code, other stories, design docs |
| **Code Reviewer** | 20K per file | Diff being reviewed, style guide, learned rules, architecture constraints | Full codebase, unrelated diffs, BRD |
| **Security Reviewer** | 25K | Files being scanned, OWASP patterns, dependency manifest | BRD, stories, design docs |
| **Compliance Reviewer** | 25K | ML model code, data handling code, regulation checklists, manifest | UI code, unrelated utilities |
| **UI Standards** | 15K | Component being reviewed, design system reference, screenshots | Backend code, data layer |
| **Orchestrator** | 10K | State file, gate status, error summaries | Full agent outputs, source code |

### Rules

- Never give an agent more context than it needs. Extra context is noise, not help.
- Measure actual token usage per agent and adjust budgets based on real data.
- The orchestrator should have the smallest context — it routes, it does not analyze.

## Prompt Caching Strategy

Claude supports prompt caching via cache control headers. Use it to avoid re-processing static content.

### Cacheable Prefix Structure

```
[CACHED — rarely changes]
├── System prompt (agent role, rules, patterns)
├── Architecture document
├── Style guide / learned rules
├── Reference skill content
└── Project manifest (static parts)

[NOT CACHED — changes per request]
├── Current task (story spec, file diff, test results)
├── Dynamic context (state, error messages)
└── User message
```

### Implementation

```python
messages = [
    {
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": static_context,         # System prompt + architecture + style guide
                "cache_control": {"type": "ephemeral"}
            },
            {
                "type": "text",
                "text": dynamic_context,         # Current task
            }
        ]
    }
]
```

### Cache Hit Optimization

1. **Front-load static content** — put cacheable content at the beginning of the prompt.
2. **Keep cached prefix stable** — any change invalidates the cache. Do not inject timestamps or request IDs into the cached prefix.
3. **Group agents by cache key** — agents with the same system prompt and reference material share a cache. Run them sequentially to maximize hits.
4. **Measure cache hit rate** — track `cache_creation_input_tokens` vs `cache_read_input_tokens` in the API response.

### Expected Savings

| Scenario | Without Cache | With Cache | Savings |
|----------|-------------|-----------|---------|
| 10 stories, same agent | 10x full prompt | 1x full + 9x cached | ~75% cost reduction |
| Review 20 files, same reviewer | 20x full prompt | 1x full + 19x cached | ~80% cost reduction |
| Retry after failure | 2x full prompt | 1x full + 1x cached | ~50% cost reduction |

## Progressive Context Disclosure

Load only what the agent needs for its current task. Never dump everything upfront.

### For the Generator Agent

```
Step 1: Load story spec + architecture doc + owned files list
Step 2: Read only the files the agent decides to modify
Step 3: If a dependency is needed, load that specific spec/file
Step 4: After generating, load test patterns for the test file
```

**What NOT to do:** Load all 33 stories, the full codebase, all review reports, and the entire architecture doc at once.

### For the Evaluator Agent

```
Step 1: Load acceptance criteria for current story
Step 2: Load existing test file (if any)
Step 3: Load Playwright patterns from reference skill
Step 4: After running tests, load only the failed test output
```

### For the Code Reviewer

```
Step 1: Load the diff being reviewed
Step 2: Load style guide and learned rules
Step 3: If the diff touches architecture, load architecture doc
Step 4: Load only the specific files referenced in the diff
```

### Implementation Pattern

```python
class ContextLoader:
    def __init__(self, token_budget: int):
        self.budget = token_budget
        self.used = 0

    def load(self, content: str, priority: int) -> str | None:
        tokens = count_tokens(content)
        if self.used + tokens > self.budget:
            if priority < 3:  # High priority: summarize instead of skip
                content = summarize(content, max_tokens=self.budget - self.used)
                tokens = count_tokens(content)
            else:  # Low priority: skip entirely
                return None
        self.used += tokens
        return content
```

## Context Compression for Session Chaining

When an agent's work spans multiple LLM calls (session chaining), compress prior context.

### Structured Summary Format

```json
{
  "session": 3,
  "agent": "generator",
  "story": "STORY-007",
  "completed": [
    "Created src/api/users.ts with CRUD endpoints",
    "Added UserSchema validation in src/schemas/user.ts",
    "Wrote 5 unit tests in tests/api/users.test.ts"
  ],
  "decisions": [
    "Used Zod over Joi for validation (project standard)",
    "Added rate limiting middleware per architect spec"
  ],
  "open_issues": [
    "Need to implement pagination — blocked on shared pagination util"
  ],
  "files_modified": ["src/api/users.ts", "src/schemas/user.ts", "tests/api/users.test.ts"],
  "token_summary": "Session 1-2 compressed from 45K to 800 tokens"
}
```

### Rules

- Compress after every session, not just when hitting limits.
- Keep: decisions made, files modified, open issues, key code patterns chosen.
- Drop: raw LLM outputs, intermediate reasoning, superseded plans, tool call logs.
- Structured JSON > prose summaries (parseable by the next session).
- Include a "files_modified" list so the next session knows what to read.

## Cost Optimization Patterns

### Model Selection by Task Complexity

| Task | Model | Reasoning |
|------|-------|-----------|
| Code generation (complex) | Opus | Needs deep reasoning, architecture understanding |
| Code generation (simple) | Sonnet | Boilerplate, CRUD, straightforward logic |
| Code review | Sonnet | Pattern matching, rule application |
| Test generation | Sonnet | Structured output, predictable patterns |
| Linting / formatting | Haiku or local | Mechanical, low reasoning needed |
| Orchestration | Haiku | Routing decisions, state management |
| Summarization | Sonnet | Compression, key point extraction |

### Batch Similar Operations

Instead of N separate LLM calls for N files, batch when possible:

```python
# Bad: one call per file
for file in files_to_review:
    review = await review_file(file)

# Good: batch similar files into one call
batch = "\n---\n".join([f"File: {f.path}\n{f.diff}" for f in files_to_review])
reviews = await review_batch(batch)
```

**Caveat:** Only batch when files are independent. Do not batch if review of file B depends on review of file A.

### Cache System Prompts

System prompts are the same across many calls. Structure them for caching:

```python
# This prefix is identical for every generator call in a sprint
GENERATOR_SYSTEM = """
You are the Generator agent...
[agent rules]
[style guide]
[architecture constraints]
[learned rules]
"""

# Only this part changes per story
STORY_CONTEXT = f"""
Current story: {story.id}
Spec: {story.spec}
Files to modify: {story.files}
"""
```

### Retry Without Context Bloat

When retrying after failure, do not include the full failed response:

```python
# Bad: include everything from the failed attempt
retry_context = original_context + failed_response + error_message

# Good: summarize the failure
retry_context = original_context + f"""
Previous attempt failed:
- Error: {error.summary}
- The approach of {failed_approach} did not work because {reason}
- Try a different approach.
"""
```

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|-------------|---------|-----|
| **Dumping full codebase** | Wastes tokens, dilutes relevant code | Load only files the agent will modify or reference |
| **Loading all stories** | Generator gets confused by unrelated specs | Load only current story + direct dependencies |
| **Not caching** | Re-processing same system prompt every call | Structure prompts with cacheable prefix |
| **Retrying without context reduction** | Each retry adds more context, eventually overflows | Compress/summarize before retry |
| **Same model for everything** | Paying Opus prices for Haiku-level tasks | Route by task complexity |
| **No token tracking** | Cannot optimize what you do not measure | Log tokens per agent, per gate, per story |
| **Loading review history** | Old reviews are irrelevant to current generation | Load only current learned rules, not historical reviews |
| **Full error traces in context** | Stack traces waste hundreds of tokens | Summarize to: error type, file, line, message |

## Metrics to Track

| Metric | What It Tells You | Target |
|--------|-------------------|--------|
| **Tokens per story** | Efficiency of generation | <100K total (all agents combined) |
| **Cache hit rate** | Effectiveness of caching strategy | >60% of input tokens from cache |
| **Cost per gate pass** | Whether gates are cost-effective | <$1 per gate for Sonnet-level tasks |
| **Context utilization** | How much of the budget is actually useful | >70% (if <50%, budget is too high) |
| **Retry rate** | How often context overflow causes retries | <10% of calls |
| **Compression ratio** | How effectively sessions are summarized | >20:1 (45K raw → <2.5K summary) |
