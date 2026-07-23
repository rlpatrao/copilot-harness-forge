# Stack Questionnaire Reference

Structured question bank for the architect's 5-round stack interrogation. Questions are adapted based on BRD context and project type.

## Round 1 — Backend

### Questions
1. "Based on the BRD, the key backend requirements are: {list from BRD}. What language/framework do you prefer?"
2. "Why this choice over the alternatives?"

### Options by Requirement Pattern

| BRD Pattern | Recommended | Alternatives | Challenge If |
|-------------|-------------|-------------|-------------|
| AI/ML integrations | Python / FastAPI | Python / Django | User picks Node — limited ML ecosystem |
| Admin-heavy, forms-heavy | Python / Django | Python / FastAPI | User picks FastAPI — no built-in admin |
| Real-time, WebSocket-heavy | Node / Express | Python / FastAPI | User picks Django — weaker async support |
| Type-safe API, enterprise | Node / Express+TS | Python / FastAPI | |
| Simple CRUD | Any | | Don't over-engineer the choice |

## Round 2 — Database

### Questions
1. "The BRD's data characteristics are: {analysis}. What primary database?"
2. "Do you need a secondary store? (cache, search index, queue)"
3. "Expected data scale?"

### Options by Data Pattern

| BRD Pattern | Recommended | Challenge If |
|-------------|-------------|-------------|
| Relational with joins | PostgreSQL | User picks MongoDB |
| Document/flexible schema | MongoDB | User picks PostgreSQL for simple key-value |
| Time-series data | TimescaleDB (on PostgreSQL) | |
| Full-text search needed | PostgreSQL (pg_trgm) or Elasticsearch | |
| High-read, low-write | Add Redis cache layer | No cache chosen for read-heavy workload |
| Async processing | Add message queue (Redis/RabbitMQ) | Blocking API calls for async work |

## Round 3 — Frontend

### Questions
1. "Frontend framework? (with BRD-informed rationale)"
2. "Styling approach?"
3. "State management needs?"

### Options

| BRD Pattern | Recommended | Notes |
|-------------|-------------|-------|
| Complex SPA with routing | React + React Router | Most ecosystem support |
| SEO-important pages | Next.js | SSR/SSG built-in |
| Simple interactivity | HTMX or Alpine.js | Lighter than full SPA |
| No frontend | Skip | API-only projects |
| Enterprise dashboard | React + shadcn/ui or MUI | Pre-built enterprise components |
| Consumer app | React + Tailwind | Maximum design flexibility |

## Round 4 — AI/LLM Model Selection

### Questions
1. "Which model should power the code generation agents (generator, test-engineer)?"
2. "For reasoning-heavy agents (architect, evaluator), keep Claude Opus or also route to local?"
3. "If local: what's your GPU setup? (VRAM determines quantization and batch size)"

### Options

| Model | Type | Best For | Requirements | Notes |
|-------|------|----------|-------------|-------|
| Claude Opus (default) | Cloud API | Highest quality, complex reasoning | Anthropic API key | Default for architect, evaluator |
| Claude Sonnet (default) | Cloud API | Good quality, faster, cheaper | Anthropic API key | Default for generator, reviewers |
| Qwen3-Coder-480B-A35B-Instruct | Local (vLLM/Ollama) | Code gen, large context, free | ~24GB+ VRAM (A35B active params), vLLM or Ollama | Strong code generation, 480B total / 35B active MoE |
| Qwen3-Coder-480B (full precision) | Local (vLLM) | Maximum local quality | 80GB+ VRAM (multi-GPU) | Best local option for complex code tasks |
| DeepSeek-Coder-V3 | Local (vLLM) | Code gen alternative | ~24GB VRAM | Strong on benchmarks, alternative to Qwen |
| CodeLlama-70B | Local (Ollama) | Code gen, lighter weight | ~48GB VRAM | Meta's code-specialized model |
| Custom/Other | Local or API | User-specified | Varies | Must expose OpenAI-compatible API |

### Routing Strategy Options

| Strategy | Description | When to Use |
|----------|-------------|-------------|
| **Cloud-only** (default) | All agents use Claude API | Simple setup, best quality, costs money |
| **Hybrid** | Reasoning agents (architect, evaluator) use Claude Opus; code gen agents (generator, test-engineer, reviewers) use local model | Balance quality + cost. Recommended when local GPU available |
| **Local-only** | All agents use local model via OpenAI-compatible API | Air-gapped, cost-sensitive, or privacy-required |

### Challenge Patterns

- User picks local model but BRD has complex architectural decisions → "The architect agent needs strong reasoning for trade-off analysis. Consider keeping architect on Claude Opus and routing only generator/test-engineer to local."
- User picks quantized model but BRD has large codebase → "Quantized models may struggle with 100K+ token contexts. Consider full-precision or cloud for integration-heavy stories."
- User picks local-only but no GPU → "CPU inference on 480B params will be extremely slow. Consider hybrid strategy or smaller model."

## Round 4.5 — Agent Framework Selection (conditional — agentic projects only)

### Decision Matrix

| Framework | Strengths | Weaknesses | Best For |
|-----------|-----------|------------|----------|
| **Claude Agent SDK** | Deepest MCP, rich tool schemas, Anthropic native | Claude-only, newer ecosystem | Claude-powered agents with complex tool use |
| **LangGraph** | Native checkpointing, graph-based state, mature | Steeper learning curve, LangChain dependency | Complex multi-agent workflows needing crash recovery |
| **CrewAI** | Intuitive role-based teams, sequential/parallel | No native checkpointing, less customizable | Team-of-specialists patterns (researcher → writer → reviewer) |
| **OpenAI Agents SDK** | Clean handoff pattern, built-in guardrails | OpenAI-only, newer | OpenAI-powered with agent-to-agent handoffs |
| **Google ADK** | Multi-modal native, A2A native, Google Cloud | Gemini-focused, newest | Multi-modal (vision+audio) agents, Google ecosystem |
| **Semantic Kernel** | .NET + Python, Azure native, enterprise connectors | Heavier, less agentic-focused | Enterprise .NET, Azure AI integration |
| **Smolagents** | Minimal, code-agent pattern, open-source friendly | Less mature, fewer features | Lightweight agents with open-source models |
| **Custom** | Full control, no lock-in | Build everything yourself | Simple agents (1-2), unique requirements |

### Recommendation Rules

| BRD Signal | Recommended Framework | Reason |
|------------|----------------------|--------|
| "Uses Claude API" or "Anthropic" | Claude Agent SDK | Native integration, deepest MCP |
| "Long-running workflow" or "crash recovery" | LangGraph | Native checkpointing with Postgres |
| "Team of agents" or "researcher + writer" | CrewAI | Role-based team pattern built-in |
| "Uses GPT" or "OpenAI" | OpenAI Agents SDK | Native integration, handoff pattern |
| "Multi-modal" or "vision + audio" | Google ADK | Native multi-modal support |
| ".NET" or "Azure" or "enterprise" | Semantic Kernel | Azure-native, enterprise connectors |
| "Open-source models" or "lightweight" | Smolagents | Minimal overhead, HF ecosystem |
| "Simple chatbot" or "1-2 agents" | Custom | Avoid framework overhead |
| "Model-agnostic" or "deploy anywhere" | LangGraph or Custom + LiteLLM | Provider-independent |

### LLM for Application Agents

Separate from which model powers the forge (Round 4). This is which model the generated app's agents use.

| Option | When to Recommend |
|--------|-------------------|
| **LiteLLM (model-agnostic)** | Default recommendation — deployer chooses provider. Generates `llm_client.py` routing through LiteLLM. |
| **Single provider** | Only when BRD requires provider-specific features (Claude tool_use, GPT function_calling, Gemini grounding) |
| **Multiple providers** | Different agents need different strengths (e.g., vision agent on Gemini, reasoning on Claude) |
| **Local-only** | Air-gapped, privacy-required, cost-sensitive |

## Round 5 — Deployment

### Questions
1. "Development environment?" (Docker Compose / local / stub)
2. "Target deployment?" (Container / serverless / PaaS / undecided)
3. "CI/CD requirements?"
4. "External services/APIs?"

### Verification Mode Selection

| Choice | When | Config |
|--------|------|--------|
| Docker Compose | Multi-service apps (backend + frontend + DB) | `verification.mode: "docker"` |
| Local dev servers | Single-service or rapid iteration | `verification.mode: "local"` |
| Stub/mock | Serverless, external-only, no runnable backend | `verification.mode: "stub"` |

## Round 6 — Verify & Challenge

### Concern Patterns to Check

- BRD mentions real-time features → WebSocket/SSE infrastructure chosen?
- BRD mentions search → full-text index or search service configured?
- BRD mentions file processing → async queue for heavy processing?
- BRD mentions email/notifications → queue + service for async sending?
- BRD expects sub-200ms response → caching layer configured?
- BRD mentions multiple user roles → auth + RBAC system planned?
- BRD mentions external APIs → typed wrappers in component map?
- BRD mentions >100K records → pagination + indexing strategy?
