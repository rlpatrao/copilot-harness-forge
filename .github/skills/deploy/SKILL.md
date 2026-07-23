---
name: deploy
description: Generate Docker Compose stack, Dockerfiles, environment config, init.sh bootstrap script, and verify local deployment with health checks.
argument-hint: "[--up]"
---

# Deploy Skill

Generate deployment infrastructure and optionally start the local stack.

---

## Usage

```
/deploy           # Generate deployment files only
/deploy --up      # Generate + start Docker Compose stack
```

---

## Prerequisites

- `project-manifest.json` exists with `stack`, `verification`, and `evaluation` sections populated by the architect.
- `specs/design/deployment.md` exists with deployment topology.

---

## Step 1 — Read Configuration

Read `project-manifest.json`. Extract:
- `stack.backend` — language, framework, package manager
- `stack.frontend` — framework, package manager
- `stack.database` — primary, secondary
- `stack.deployment` — method, services list
- `verification.mode` — docker / local / stub
- `verification.health_check` — URL, retries, backoff
- `evaluation.api_base_url`, `evaluation.ui_base_url`

---

## Step 2 — Generate Docker Compose

Read `.claude/templates/docker-compose.template.yml` as the base.

Customize for the project:
- Service names from `stack.deployment.services`
- Port mappings from manifest URLs
- Database service with volume mount
- Health checks with `verification.health_check` config
- `depends_on` with `condition: service_healthy` for correct startup order
- Hot reload volume mounts for backend and frontend

Write to `docker-compose.yml` in project root.

---

## Step 3 — Generate Dockerfiles

Read `.claude/templates/Dockerfile.backend.dev` and `.claude/templates/Dockerfile.frontend.dev`.

Customize:
- Backend: base image for language version, package install command, entrypoint with hot reload
- Frontend: Node version, npm ci, Vite dev server with host binding

Write to `Dockerfile.backend.dev` and `Dockerfile.frontend.dev` in project root.

---

## Step 4 — Generate Environment Config

Read `.claude/templates/.env.example`.

Populate with:
- Database connection string (from stack.database)
- API keys for external services (from component-map external integrations)
- Port numbers (from manifest URLs)
- All variables marked as required vs optional with defaults

Write to `.env.example` in project root.

---

## Step 5 — Generate init.sh

Read `.claude/templates/init-sh.template`.

Replace placeholders:
- `{{BACKEND_INSTALL}}` — e.g., `cd backend && uv sync && cd ..` (Python/uv) or `cd backend && npm ci && cd ..` (Node)
- `{{FRONTEND_INSTALL}}` — `cd frontend && npm ci && cd ..`
- `{{DOCKER_COMPOSE_CMD}}` — `docker compose up -d --build`
- `{{HEALTH_CHECKS}}` — curl commands for each service URL from manifest

Write to `init.sh` and `chmod +x init.sh`.

---

## Step 6 — Start Stack (if --up)

If `--up` flag is provided:

```bash
# Copy env if needed
[ ! -f .env ] && cp .env.example .env

# Start everything
docker compose up -d --build

# Wait for health
RETRIES=10
BACKOFF=2
URL=$(jq -r '.verification.health_check.url' project-manifest.json)

for i in $(seq 1 $RETRIES); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null)
  [ "$STATUS" = "200" ] && echo "✓ Stack healthy at $URL" && break
  echo "Waiting for stack... attempt $i/$RETRIES"
  sleep $BACKOFF
  BACKOFF=$((BACKOFF * 2))
done

if [ "$STATUS" != "200" ]; then
  echo "✗ Stack not healthy after $RETRIES attempts"
  docker compose logs --tail=30
fi
```

---

## Gotchas

- **Missing .env:** Always generate `.env.example` with all required variables. Never commit `.env` itself.
- **Port conflicts:** Check manifest ports against common defaults (3000, 5432, 8000). Warn if conflicts detected.
- **Database migrations:** Include migration command in init.sh after database health check passes.
- **Health check timing:** Use exponential backoff. Database startup can take 10-15s on first run.
