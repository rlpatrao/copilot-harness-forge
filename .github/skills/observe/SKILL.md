---
name: observe
description: Scaffold observability for a project — OpenTelemetry tracing, structured logging, Grafana dashboards, alerting rules, and Docker Compose wiring.
---

# Observe Skill

Scaffold full observability stack tailored to the project's language and framework.

## Usage

```
/observe
```

---

## Prerequisites

- `project-manifest.json` exists with `stack` section populated by the architect.
- Application code exists with at least one service to instrument.

---

## Step 1 — Read Configuration

Read `project-manifest.json`. Extract:
- `stack.backend` — language, framework (determines Python vs TypeScript instrumentation)
- `stack.deployment.services` — services to instrument
- `stack.database` — for DB span instrumentation

---

## Step 2 — Generate OTel Setup

Based on stack language:

**Python:** Generate `src/lib/telemetry.py`
- TracerProvider with OTLP exporter
- Auto-instrumentation for framework (FastAPI, Flask, Django)
- DB instrumentation (SQLAlchemy, asyncpg)
- Span processors with batch export

**TypeScript:** Generate `src/lib/telemetry.ts`
- NodeTracerProvider with OTLP exporter
- Auto-instrumentation for framework (Express, Fastify, Next.js)
- DB instrumentation (Prisma, TypeORM)
- Span processors with batch export

---

## Step 3 — Generate Structured Logging Config

Generate `src/lib/logger.py` (or `logger.ts`):
- JSON-formatted log output
- Correlation IDs from trace context (trace_id, span_id)
- Log levels: DEBUG, INFO, WARN, ERROR
- Request context injection (user_id, tenant_id, request_id)
- No PII fields in log schema

---

## Step 4 — Generate Grafana Dashboard Template

Generate `monitoring/grafana-dashboard.json`:
- Request rate panel (requests/sec by endpoint)
- Error rate panel (4xx, 5xx by endpoint)
- Latency percentiles panel (p50, p95, p99)
- Database query duration panel
- Active traces panel linked to Jaeger

---

## Step 5 — Generate Alerting Rules

Generate `monitoring/alerts.yml`:
- Error rate > 5% for 5 minutes
- p99 latency > 2s for 5 minutes
- Database connection pool exhaustion
- Service health check failures
- Webhook-based notification (no email/SMS dependencies)

---

## Step 6 — Wire into Docker Compose

Update `docker-compose.yml`:
- Add `jaeger` service (all-in-one image, ports 16686/4317/4318)
- Add `otel-collector` service with OTLP receiver and Jaeger exporter
- Set `OTEL_EXPORTER_OTLP_ENDPOINT` env var on application services
- Add `depends_on` for collector before app services

---

## Gate Behavior

- OTel collector container starts and passes health check
- Application sends traces to collector (visible in Jaeger UI at localhost:16686)
- Structured logs include trace_id correlation

---

## Gotchas

- **Don't instrument test code.** Guard instrumentation behind environment checks — disable in test runs.
- **Don't log PII in traces.** Never include email, password, SSN, or auth tokens in span attributes or log fields.
- **Use structured JSON logging, not print statements.** All log output must be machine-parseable.
- **Collector before app.** Application services must depend on the OTel collector in Docker Compose startup order.
