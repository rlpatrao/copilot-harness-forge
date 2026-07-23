---
name: tenant
description: Scaffold multi-tenancy — tenant middleware, row-level security, per-tenant rate limiting, feature flags, and tenant admin API.
---

# Tenant Skill

Scaffold multi-tenancy infrastructure based on the architect's chosen tenancy model.

## Usage

```
/tenant
```

Also invoked by the architect when the BRD describes multi-tenant requirements.

---

## Prerequisites

- `project-manifest.json` exists with `stack` section populated.
- Architect's design includes tenancy model choice and isolation requirements in `specs/design/`.

---

## Step 1 — Read Architect's Design

Read architect's design documents for:
- Tenancy model (shared DB with RLS, schema-per-tenant, DB-per-tenant)
- Tenant identification method (JWT claim, subdomain, request header)
- Isolation requirements (data, compute, feature access)
- Rate limiting requirements per tenant tier

---

## Step 2 — Generate Tenant Middleware

Generate `src/middleware/tenant.py` (or `.ts`):
- Extract tenant ID from configured source (JWT, subdomain, header)
- Validate tenant exists and is active
- Attach tenant context to request (available to all downstream handlers)
- Reject requests with missing or invalid tenant identification
- Log tenant ID in structured logs for all requests

---

## Step 3 — Generate Tenant Types

Generate `src/types/tenant.py` (or `.ts`):
- Tenant model (id, name, slug, tier, status, config)
- Tenant context type (attached to request)
- Tenant tier enum (free, pro, enterprise, etc.)

---

## Step 4 — Generate Row-Level Security Policies

Generate database migration for RLS (PostgreSQL):
- Enable RLS on all tenant-scoped tables
- Create policy: `SELECT` where `tenant_id = current_setting('app.current_tenant_id')`
- Create policy: `INSERT` where `tenant_id = current_setting('app.current_tenant_id')`
- Create policy: `UPDATE` / `DELETE` similarly scoped
- Set `current_setting` in connection middleware before each request

For schema-per-tenant: generate schema creation and routing logic.
For DB-per-tenant: generate connection pool management per tenant.

---

## Step 5 — Generate Per-Tenant Rate Limiting

Generate `src/services/rate_limiter.py` (or `.ts`):
- Rate limit configuration per tenant tier
- Sliding window counter (Redis-backed or in-memory)
- Rate limit headers in responses (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset)
- 429 response when limit exceeded

---

## Step 6 — Generate Per-Tenant Feature Flags

Generate feature flag support:
- Feature flag configuration per tenant (JSON in tenant config or dedicated table)
- Middleware or utility to check flag status for current tenant
- Default flags per tier (e.g., enterprise gets all features)
- Admin API to toggle flags per tenant

---

## Step 7 — Generate Tenant Admin API

Generate admin endpoints:
- Create tenant (provision resources based on tenancy model)
- Update tenant (tier, status, config)
- Deactivate tenant (soft disable, preserve data)
- List tenants with filtering and pagination
- Tenant usage/metrics endpoint

---

## Step 8 — Update Repositories

Update all existing repository/data-access files:
- Add tenant_id parameter or context injection
- Ensure all queries are tenant-scoped
- Add tenant_id to all INSERT operations
- Verify no cross-tenant data leakage in JOIN queries

---

## Outputs

| File | Description |
|------|-------------|
| `src/middleware/tenant.py` | Tenant extraction and context middleware |
| `src/types/tenant.py` | Tenant model and context types |
| `migrations/` (new migration) | RLS policies or schema setup |
| `src/services/rate_limiter.py` | Per-tenant rate limiting |
| Updated repository files | Tenant-scoped data access |
| Admin API endpoints | Tenant management |

---

## Gate Behavior

- Tenant A cannot access Tenant B's data (verified by test)
- Rate limits are enforced per tenant (verified by test)
- Feature flags toggle correctly per tenant (verified by test)
- Requests without valid tenant identification are rejected

---

## Gotchas

- **RLS must be tested, not trusted.** Write explicit tests that attempt cross-tenant access and verify denial.
- **Don't forget background jobs.** Async workers and cron jobs must also set tenant context before accessing data.
- **Schema migrations affect all tenants.** For schema-per-tenant, migrations must run against every schema.
- **Rate limiter must be tenant-aware from day one.** A global rate limiter lets one noisy tenant degrade service for all.
