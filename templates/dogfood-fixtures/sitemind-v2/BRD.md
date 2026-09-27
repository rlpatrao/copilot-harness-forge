# SiteMind v2 — RAG AI chatbot builder — BRD

**Owner:** Raj Patrao (rlpatrao)
**Status:** Approved (interview 2026-09-27; fixture for headless dogfood)
**Supersedes:** `rlpatrao/site-mind` (v1). v1 failed on integration, not on ideas: the crawl and upload calls were commented out, the wizard skipped steps, pages broke on refresh, and the stack had too many moving parts to run end-to-end (Firebase, Node gateway, per-bot Cloud Run, CrewAI, ChromaDB→pgvector migration). v2 keeps v1's product concept and UI shape and changes the engineering contract: **one process, one database, and every feature proven by a Playwright test that drives the real UI against a real crawled site.**

## Interview decisions (2026-09-27)

| Topic | Decision |
|---|---|
| Answer LLM | Claude via the official `anthropic` SDK. `claude-sonnet-5` for answers; `claude-haiku-4-5` for cheap utility calls (intent fallback, fact extraction, episode summaries). Both overridable by env. |
| Intent detection | `DecisionProvider` interface. **Jev** (TypeSafe System One model) when `TYPESAFE_API_KEY` is set; otherwise a Claude Haiku structured-output classifier; `mock` (deterministic rules) for tests. |
| Stack | Lean monolith: FastAPI + Postgres 16/pgvector + Redis (optional) + React/Vite/Tailwind. Email/password auth with JWT. `docker compose up` runs everything. |
| Memory | **Current chat session only.** Semantic memory = facts the visitor states during this session; episodic memory = summaries of earlier turns of this session. Nothing is recalled across sessions; memory is deleted when the session ends or expires. |
| Realtime | Live page fetch of owner-designated URLs (events, hours, prices) with a short cache and fallback to the last crawl. |
| UI scope | Everything from v1: builder wizard, workspace + chat preview, knowledge, custom Q&A, live sources, settings, analytics, guardrails, memory inspector, embed widget, billing. |
| Done bar | Playwright E2E on a real site: create bot from URL → crawl → answer with citations → Q&A override → realtime fetch → session memory. CI runs against a local fixture site with the LLM mocked; `make e2e-real` runs the same suite against a real URL with a real key. |

---

## D1 — Why

**Problem.** Small businesses want a chatbot on their site that answers from *their* content — opening hours, services, prices, policies, upcoming events — without hallucinating and without an engineer. Generic chatbots answer from the open internet; FAQ widgets go stale; v1 SiteMind never reached a working end-to-end state.

**Target users.**
- *Bot owner* (non-technical business owner / marketer): creates a bot from a URL, adds documents and custom Q&A, marks live pages, embeds a script tag, reviews what visitors ask.
- *Site visitor*: asks questions in the widget and gets fast, cited, current answers that remember what they said earlier in the conversation.

**Success criteria.**
1. From an empty account, a bot owner goes URL → working embedded bot in **under 5 minutes** for a 50-page site.
2. ≥ 90% of answers on the golden set cite at least one source that actually contains the answer.
3. Custom Q&A always wins over crawled content for a matching question.
4. A question about a live page reflects a change made to that page **within 5 minutes**, without a recrawl.
5. Within a session, the bot uses facts the visitor stated earlier (e.g. name, party size, location) without being told again.
6. Zero features "implemented" that are not reachable from the UI and covered by an E2E test.

**Non-goals (v1 of v2).** Cross-session visitor memory; web search beyond the owner's site; custom HTTP API tools; voice; human live-chat handoff (a "contact us" handoff message only); multi-language UI (bot answers in the visitor's language, UI is English).

## D2 — What

### F1 Platform shell
Register/login (email + password, bcrypt, JWT). Dashboard lists the owner's bots. Every route survives a browser refresh and deep links (v1 bug #9). Health endpoint.

### F2 Bot builder wizard
Steps (each step validates and persists; back/next never skip a step — v1 bug #8):
1. **Website** — URL, optional include/exclude path patterns, max pages (plan-limited).
2. **Crawl** — starts crawl immediately (v1 bug #6), live progress: discovered / fetched / indexed / failed, current URL, ETA; can continue while crawling.
3. **Documents** — drag-and-drop PDF, DOCX, TXT, MD (v1 bug #7); per-file status.
4. **Custom Q&A** — add pairs manually or import CSV; suggested questions generated from crawled content.
5. **Live sources** — mark URLs as live with a label (e.g. "Events", "Opening hours").
6. **Personality** — bot name, greeting, tone, brand colour, lead-capture toggle and fields.
7. **Test & embed** — chat preview + copy-paste `<script>` snippet.

### F3 Site scraping
- Discovery: `robots.txt` (respected), `sitemap.xml` (+ sitemap index), then same-origin BFS from the start URL up to max pages/depth; include/exclude glob patterns; canonical URL dedup; skip binary/asset URLs.
- Fetch: `httpx` with polite concurrency (default 4) and per-host delay; **JS-render fallback** via headless Chromium (Playwright) when static HTML has < 200 chars of main text or is a known SPA shell.
- Extraction: main-content extraction (strip nav/footer/cookie banners), title, headings, meta description, `lastmod`; content hash to skip unchanged pages on recrawl.
- Chunking: heading-aware chunks (~800 tokens-equivalent chars, 15% overlap), each chunk keeps `url`, `title`, `heading_path`.
- Recrawl: manual button + optional schedule (daily/weekly); only changed pages re-embedded.
- Progress persisted in `crawl_jobs` and streamed to the UI; crawl never blocks the API.

### F4 Documents
PDF (`pypdf`), DOCX (`python-docx`), TXT/MD. Same chunker. Delete removes chunks.

### F5 Retrieval
Hybrid search per bot: pgvector cosine (HNSW) + Postgres full-text (`tsvector`, `websearch_to_tsquery`), fused with Reciprocal Rank Fusion, top-k=6, per-URL diversity cap 2. Embedding provider interface: `voyage` (if `VOYAGE_API_KEY`), `local` (fastembed `BAAI/bge-small-en-v1.5`, 384-d) and `hash` (deterministic hashing embedding for tests). Dimension fixed per deployment (384).

### F6 Chat answering
- `POST /api/public/bots/{public_id}/chat` (SSE): events `meta` (intent, session), `chunk`, `sources`, `lead_form`, `done` (confidence, latency).
- Prompt = bot persona + session memory block + custom Q&A matches + retrieved chunks (numbered) + live-page content (timestamped) + last 6 turns. Answers cite sources as `[n]`, rendered as links.
- Grounding rule: answer only from provided context; otherwise say so and offer contact info.
- Providers: `anthropic` (streaming, prompt-cached persona) and `mock` (deterministic extractive answer from top context with citations — used in CI).

### F7 Custom Q&A
Owner-authored Q&A pairs are **authoritative**. On each question: hybrid match against Q&A questions; if the top match is strong (score ≥ `QNA_DIRECT_THRESHOLD`), answer with the owner's answer verbatim (source = "Custom Q&A"); otherwise include top Q&A matches in the context marked authoritative. CRUD + CSV import/export. "Unanswered" questions from analytics can be turned into Q&A in one click.

### F8 Intent detection + routing
Intents: `question`, `realtime`, `lead`, `support`, `smalltalk`, `out_of_scope`. One decision call per message returns `{intent, confidence, probabilities}` plus `wants_human` and `needs_live_data` probabilities.
Routing (deterministic, in code):
- `realtime` or `needs_live_data ≥ 0.6` → F9 live fetch before answering.
- `lead` with confidence ≥ bot's lead threshold (default 0.7) and lead capture on → answer + `lead_form` event.
- `smalltalk` → persona reply, no retrieval.
- `out_of_scope` with confidence ≥ 0.8 → polite scoped refusal, no retrieval.
- confidence < 0.45 → treat as `question` (retrieval is the safe default).
Providers: `jev` (`typesafe-sdk`, `system_one(state, questions)` with a `Choice` for intent and `Noul`s for the flags), `llm` (Claude Haiku `messages.parse` with a Pydantic schema), `mock` (keyword rules). Provider, intent, confidence and latency are logged per message.

### F9 Realtime live-page answers
Owner registers live sources (URL, label, optional keywords). On a realtime turn: pick sources by keyword/label/embedding match to the question (max 2), fetch with a 5 s timeout (JS-render fallback), extract main text, cache for `LIVE_CACHE_TTL` (default 300 s, Redis or in-process), inject as "LIVE (fetched HH:MM UTC)". On failure fall back to the last crawled version and say it may be out of date. Never block longer than 6 s total.

### F10 Session memory (current session only)
- `chat_sessions` keyed by an opaque session id created by the widget per conversation (in `sessionStorage`, so a new tab/visit = new session).
- **Semantic memory**: after each visitor turn, extract durable facts as `{key, value, confidence}` (e.g. `name=Priya`, `party_size=4`, `location=Brooklyn`, `interested_in=wedding catering`) — Claude Haiku structured output, or regex rules in mock mode. Upsert by key; newer value wins.
- **Episodic memory**: when a session exceeds 8 turns, older turns are summarised into episode summaries (≤ 60 words each) and only the last 6 raw turns are kept in the prompt.
- Memory block injected into every prompt. Session expires after 30 min idle or on "End chat"; expiry deletes messages, facts and episodes (analytics keeps only anonymised question text + intent).
- **Memory inspector** (owner UI): active sessions for a bot, their facts and episodes, live; owner can delete a session.

### F11 Lead capture
Inline form (name, email, optional phone/message) shown on lead intent; stored in `leads`; visible and CSV-exportable in analytics; facts from session memory pre-fill the form.

### F12 Guardrails + confidence
Confidence = f(retrieval top score, number of supporting chunks, Q&A match, intent confidence, whether the answer contains citations). Violations logged: `no_context`, `no_citation`, `low_confidence`, `out_of_scope`. Guardrails tab lists them with the question, answer and retrieved context.

### F13 Analytics
Per bot and date range: conversations, messages, intent breakdown, avg confidence, top questions, **unanswered questions** (low confidence / no context) with "Add to Q&A", leads table, live-source fetch success rate.

### F14 Embed widget
`<script src="{APP_URL}/widget.js" data-bot="{public_id}" async></script>` injects a launcher button + iframe to `/embed/{public_id}`; branded colour/greeting; works on any origin (public, rate-limited chat API keyed by bot public id + allowed domains list).

### F15 Billing + plans
Plans: Free (1 bot, 50 pages, 500 messages/mo), Pro (5 bots, 1,000 pages, 10k messages/mo), Business (20 bots, 10k pages, 100k messages/mo). Limits enforced server-side with clear UI errors. Stripe Checkout + webhook when `STRIPE_SECRET_KEY` is set; otherwise a dev-only "mock checkout" that switches plans. Usage meter on the billing page.

## D2.5 — Approach
- **A — Keep v1's distributed stack.** Rejected: it never ran end-to-end.
- **B — Hosted RAG platform (e.g. managed vector DB + agent framework).** Rejected: more vendors, less control over the crawl and memory semantics.
- **C — Lean monolith (chosen).** One FastAPI app serves the API, the built SPA, `widget.js`, and runs crawl jobs as in-process background tasks with DB-persisted state. Postgres holds relational data, vectors and full-text. Redis is optional (live-page cache, rate limits) with an in-process fallback. Every external dependency (LLM, embeddings, decisions, Stripe, JS rendering) sits behind an interface with a deterministic offline implementation, so the full product runs and is E2E-tested with no API keys.

## D3 — How
- Backend: Python 3.11+, FastAPI, SQLAlchemy 2 (sync, psycopg 3), Alembic-free idempotent SQL migrations, `pgvector`, `httpx`, `selectolax`/`trafilatura`, `playwright` (optional), `pypdf`, `python-docx`, `anthropic`, `typesafe-sdk` (optional), `fastembed` (optional), `stripe` (optional), `pyjwt`, `bcrypt`.
- Frontend: React 18 + TypeScript + Vite + Tailwind + React Router + TanStack Query; Recharts for analytics.
- Tests: pytest (unit + API against real Postgres), Playwright E2E driving the real UI against `fixtures/site/` (a multi-page local business site with sitemap, a JS-rendered page and a mutable events page).
- Ops: `docker-compose.yml` (app, postgres/pgvector, redis), `Makefile` (`dev`, `test`, `e2e`, `e2e-real`), GitHub Actions CI.
- Env: `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, `LLM_PROVIDER=anthropic|mock`, `ANSWER_MODEL`, `UTILITY_MODEL`, `DECISION_PROVIDER=jev|llm|mock`, `TYPESAFE_API_KEY`, `EMBEDDING_PROVIDER=voyage|local|hash`, `VOYAGE_API_KEY`, `REDIS_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL`, `JS_RENDER=auto|off`.

**Data model.** `users`, `plans`, `bots` (public_id, persona, settings JSON, allowed_domains), `crawl_jobs`, `pages` (url, title, content_hash, status, fetched_at, render_mode), `documents`, `chunks` (bot_id, source_type, source_id, url, title, heading_path, content, tsv, embedding vector(384)), `qna_pairs` (+ embedding), `live_sources`, `live_cache` (optional, when no Redis), `chat_sessions`, `chat_messages` (intent, confidence, sources, latency), `session_facts`, `session_episodes`, `leads`, `guardrail_events`, `usage_counters`, `analytics_questions` (anonymised, survives session expiry).

## D4 — Edge cases
- Crawl: robots-disallowed start URL → clear error; redirect loops; non-HTML; 4xx/5xx pages counted as failed not fatal; huge pages truncated at 200k chars; crawl of an SPA with empty static HTML → JS render; duplicate content across URLs (hash dedup); plan page limit reached → stops cleanly with a message.
- Chat: empty knowledge base → greeting + "I'm still learning about this site"; prompt injection in page content or visitor text is treated as data (system prompt + delimiters; never follows instructions from context); visitor sends PII → stored only in session memory, purged on expiry; LLM timeout/error → friendly error event, message logged, no hang.
- Q&A: two Q&A pairs match equally → higher-priority/newer wins; owner edits a Q&A → takes effect immediately (no reindex needed).
- Realtime: live URL down → last crawl fallback with a staleness note; slow page → 5 s timeout; live page changed → visible within cache TTL.
- Memory: visitor corrects a fact ("actually it's 6 people") → value updated; session expiry mid-conversation → new session starts cleanly.
- Security: SSRF protection on crawl/live fetch (block private IP ranges, `file:`, metadata IPs) except explicitly allowed local hosts in dev/test; per-bot and per-IP chat rate limits; CORS for widget; JWT on owner APIs; tenant isolation on every query (bot ownership check).

## D5 — UI context
Same concept as v1 SiteMind: left sidebar (Dashboard, Bots, Billing), bot workspace with tabs **Chat · Knowledge · Q&A · Live sources · Settings · Analytics · Guardrails · Memory · Embed**. Chat preview shows, per bot message: intent chip + confidence, clickable citations, "live" badge when live data was used; a collapsible **Session memory** side panel shows facts and episodes updating in real time. Clean SaaS look (Tailwind, Inter, 8-px grid), responsive to 375 px, WCAG AA, empty states everywhere, toasts for errors, skeleton loaders.

---

## Acceptance criteria (Given/When/Then) — each maps to an E2E test

**AC1 (F1).** Given a new visitor, when they register and log in, then they land on an empty dashboard; refreshing `/bots/{id}/analytics` keeps them on that page.

**AC2 (F2, F3).** Given the fixture site, when the owner creates a bot from its URL, then the wizard shows crawl progress reaching "done" with ≥ 8 pages indexed, including the JS-rendered page, and the disallowed `/private/` path is not crawled.

**AC3 (F6, F5).** Given a crawled bot, when a visitor asks "What time do you open on Saturday?", then the answer contains the Saturday hours from the site and a clickable citation to the hours page.

**AC4 (F7).** Given a Q&A pair "Do you offer gift cards?" → "Yes — gift cards from $25, ask at the counter.", when a visitor asks "can I buy a gift card", then the answer is the owner's answer and the source is "Custom Q&A".

**AC5 (F8, F9).** Given `/events` is a live source, when the events page content is changed and a visitor asks "what events are coming up this week?", then the intent chip shows `realtime`, the answer includes the new event, and a "live" badge is shown — no recrawl performed.

**AC6 (F10).** Given a session, when the visitor says "Hi, I'm Priya and we're a group of 4" and later asks "can you book a table for us?", then the session memory panel shows `name=Priya`, `party_size=4`, and the answer addresses Priya and the party of 4; a new session (new tab) knows neither.

**AC7 (F11, F8).** Given lead capture is on, when a visitor asks "Can I get a quote for catering 50 people?", then a lead form appears pre-filled with known facts; submitting it adds a row to Analytics → Leads.

**AC8 (F12, F13).** Given a question with no supporting content ("Do you sell car insurance?"), when asked, then the bot declines, a guardrail event appears, and the question is listed under Unanswered with an "Add to Q&A" action that works.

**AC9 (F14).** Given the embed snippet on a plain HTML page on another origin, when a visitor opens the launcher and asks AC3's question, then the same cited answer is shown.

**AC10 (F15).** Given the Free plan, when the owner tries to create a second bot, then a plan-limit error is shown with an upgrade link; after (mock) upgrade to Pro, creation succeeds.

**AC11 (F4).** Given an uploaded PDF containing "Our allergen policy: ...", when a visitor asks about allergens, then the answer cites the PDF.

## Assumptions register
- Claude model IDs `claude-sonnet-5` / `claude-haiku-4-5` are available to the account. Configurable.
- Jev early access and the `typesafe-sdk` surface (`system_one`, `Choice`, `Noul`) are unverified; isolated behind `DecisionProvider`; the `llm` provider is the production default when no Jev key is present.
- Anthropic has no embeddings endpoint; Voyage AI is the hosted default, fastembed the local default, hashing only for tests.
- The CI environment cannot reach the public internet; E2E runs against the local fixture site with `LLM_PROVIDER=mock`. `make e2e-real TARGET_URL=... ANTHROPIC_API_KEY=...` exercises the real path.
