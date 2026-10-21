# NexusNNCA — Nair & Nelliyatt Practice Management

FastAPI + MongoDB + React (CRA). Fully portable: runs on any Docker host
(deployed via Emergent historically; self-hosted on Hostinger VPS now).

## Deploy (Hostinger KVM VPS, Ubuntu 24.04)

```bash
curl -fsSL https://get.docker.com | sh
git clone https://github.com/acenair/NexusNNCA.git /opt/nnca
cd /opt/nnca
cp .env.example .env && nano .env     # set JWT_SECRET, GEMINI_API_KEY, CORS_ORIGINS
# edit Caddyfile: put your real domain, then point DNS A-record at this VPS
docker compose up -d --build
```

- App: https://your-domain (Caddy auto-HTTPS)
- Backups: `crontab -e` → `0 2 * * * /opt/nnca/scripts/backup-db.sh`
  (set `BACKUP_S3_TARGET` + S3 keys in env for off-site copies)

## Local development

```bash
python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
# backend/.env: MONGO_URL, DB_NAME, JWT_SECRET
cd backend && ../.venv/bin/uvicorn server:app --port 8001
cd frontend && npm install && npm start
```

## Tests

```bash
cd backend
REACT_APP_BACKEND_URL=http://localhost:8001 MONGO_URL=mongodb://localhost:27017   DB_NAME=ca_ai_test ../.venv/bin/python -m pytest tests/
```

Seed data (users/clients/engagements/checklists) rebuilds automatically on
first boot. Spec: `memory/PRD.md`; design targets: Auditflow mockups.
