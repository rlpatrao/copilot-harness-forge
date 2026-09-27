workspace "SiteMind v2" {

    model {
        owner = person "Bot Owner" "Creates bots from a site URL, adds documents, custom Q&A and live sources, embeds the widget, reviews analytics."
        visitor = person "Site Visitor" "Chats with the embedded bot on the owner's website."

        site = softwareSystem "Owner Website" "Public website that is crawled, and whose live pages are fetched at answer time."
        anthropic = softwareSystem "Anthropic API" "Claude: claude-sonnet-5 answers (streaming), claude-haiku-4-5 utility calls (intent fallback, fact extraction, episode summaries)."
        jev = softwareSystem "TypeSafe Jev API" "System One decision model used for intent detection when TYPESAFE_API_KEY is set."
        voyage = softwareSystem "Voyage AI" "Hosted embeddings (optional; local fastembed otherwise)."
        stripe = softwareSystem "Stripe" "Checkout + webhooks for plan upgrades (optional; mock checkout in dev)."

        sitemind = softwareSystem "SiteMind v2" "RAG chatbot builder: crawl, index, answer with citations, custom Q&A, intents, realtime live pages, session memory." {
            spa = container "Web App" "React 18 + Vite + Tailwind SPA: dashboard, builder wizard, bot workspace tabs, billing, /embed chat page." "React / TypeScript"
            widget = container "Widget Loader" "widget.js: launcher button + iframe to /embed/{public_id}." "Vanilla JS"
            api = container "API" "FastAPI monolith: auth, bots, crawl jobs, documents, Q&A, live sources, public chat SSE, memory, analytics, billing; serves the SPA and widget.js." "FastAPI / Python"
            crawler = container "Crawler" "robots + sitemap + BFS discovery, httpx fetch, Playwright JS-render fallback, main-content extraction, heading-aware chunking. In-process background jobs with DB-persisted progress." "Python"
            chat = container "Chat Engine" "Intent routing (DecisionProvider: jev|llm|mock), Q&A match, hybrid retrieval, live fetch, session memory, prompt assembly, streaming answer (LLMProvider: anthropic|mock), guardrails." "Python"
            db = container "Database" "Users, bots, pages, chunks (pgvector 384-d + tsvector), Q&A, sessions, facts, episodes, leads, analytics, usage." "Postgres 16 + pgvector"
            cache = container "Cache" "Live-page cache and rate limits (optional; in-process fallback)." "Redis"
        }

        owner -> spa "builds and manages bots" "HTTPS"
        visitor -> widget "opens chat" "HTTPS"
        widget -> spa "loads /embed/{public_id} in iframe" "HTTPS"
        spa -> api "REST + SSE" "HTTPS/JSON"
        api -> crawler "starts crawl jobs" "in-process"
        api -> chat "answers public chat messages" "in-process"
        crawler -> site "fetches robots, sitemap, pages" "HTTPS"
        chat -> site "fetches live pages" "HTTPS"
        chat -> anthropic "answers + utility calls" "HTTPS"
        chat -> jev "intent decisions" "HTTPS"
        crawler -> voyage "embeds chunks" "HTTPS"
        chat -> voyage "embeds queries" "HTTPS"
        api -> stripe "checkout + webhook" "HTTPS"
        api -> db "reads/writes" "psycopg"
        crawler -> db "writes pages + chunks" "psycopg"
        chat -> db "retrieval, memory, logs" "psycopg"
        chat -> cache "live-page cache" "RESP"
    }

    views {
        systemContext sitemind {
            include *
            autoLayout
        }
        container sitemind {
            include *
            autoLayout
        }
    }
}
