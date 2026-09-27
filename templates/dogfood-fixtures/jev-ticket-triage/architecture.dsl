workspace "TriageDesk" {

    model {
        agent = person "Tier-1 Support Agent" "Works the human review queue; confirms or corrects Jev's suggested routing."

        lead = person "Support Lead" "Owns routing policy and confidence thresholds; reads the calibration dashboard."

        customer = person "Customer" "Submits support tickets by email or in-app widget."

        jev = softwareSystem "TypeSafe Jev API" "System One decision model. Takes state + typed questions (Choice / Score / Noul), returns typed answers with calibrated confidence. Early access."

        helpdesk = softwareSystem "Existing Helpdesk" "System of record for tickets. Receives routing fields from TriageDesk via webhook."

        pager = softwareSystem "On-call Pager" "PagerDuty-compatible Events v2 endpoint; paged only for outage-severity tickets at or above the high-stakes floor."

        triage = softwareSystem "TriageDesk" "Jev-powered ticket triage: one fan-out decision call per ticket, deterministic confidence-band routing, human review queue, and calibration measured on our own labels." {

            web = container "Web" "Next.js 14 app — review queue, live feed, calibration dashboard, policy editor, audit log." "Next.js 14 / Tailwind / Recharts"

            api = container "API" "FastAPI backend: ticket ingest, triage orchestration, review/label endpoints, calibration stats. Serves the built web bundle." "FastAPI / Python 3.12"

            provider = container "Decision Provider" "DecisionProvider interface with JevProvider (typesafe-sdk system_one call) and MockJevProvider (deterministic, offline). Selected by DECISION_PROVIDER." "Python module"

            policy = container "Policy Engine" "Pure function: typed answers + routing-policy.yaml -> action. Confidence bands 0.45 / 0.72 / 0.88, PII fail-safe, shadow mode, drift auto-revert." "Python module"

            redactor = container "Redactor" "Regex + Luhn pre-pass and secret_or_pii_present flag; strips secrets before any outbound payload or log line." "Python module"

            store = container "Triage DB" "tickets, decisions, actions, labels, calibration_snapshots, append-only audit log." "SQLite (WAL)"

            worker = container "Backfill Worker" "Asyncio queue for CSV bulk import and shadow-mode replays; batches up to 32 concurrent fan-out calls; enforces daily budget cap." "Python asyncio"
        }

        customer -> helpdesk "files ticket" "email / widget"
        helpdesk -> api "forwards new ticket" "HTTPS webhook"
        agent -> web "confirms / corrects suggestions" "HTTPS"
        lead -> web "tunes thresholds from calibration curves" "HTTPS"
        web -> api "REST + SSE live feed" "HTTPS/JSON"
        api -> redactor "scrubs ticket body before storage and outbound calls" "in-process"
        api -> provider "decide(state, questions)" "in-process"
        provider -> jev "system_one(state, questions) - one call, six typed questions" "HTTPS"
        api -> policy "map typed answers to action" "in-process"
        api -> store "persist tickets, decisions, actions, labels" "sqlite3"
        worker -> provider "batched shadow / backfill decisions" "in-process"
        worker -> store "reads pending tickets, writes decisions" "sqlite3"
        api -> helpdesk "writes back team / severity / flags" "HTTPS webhook"
        api -> pager "pages on-call for outage >= 0.88" "HTTPS (Events v2)"
    }

    views {
        systemContext triage {
            include *
            autoLayout
        }
        container triage {
            include *
            autoLayout
        }
    }
}
