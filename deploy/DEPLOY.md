# Deploy to a VPS (Docker Compose + Caddy)

This guide hosts the chat UI, chat n8n, and Qdrant on a single always-on VPS using `docker-compose.cloud.yml` plus a Caddy reverse proxy for automatic HTTPS. No Coolify, so a small (2 GB) box is enough. Qdrant lives on the box, so there is no managed-tier inactivity suspension. Docling and ingestion stay on your local machine.

## Architecture

```text
Local machine (ingestion)          VPS (docker compose)
-------------------------          --------------------
PDF inbox -> n8n -> Docling   -->  Caddy (TLS) -> Qdrant
              OpenRouter embed       ^   |
                                     |   +-> n8n (chat webhook)
Visitor -> https://app.<host> ------+   +-> nginx (static UI)
```

Caddy is the only container that publishes host ports (80/443) and terminates TLS. The app services stay on the internal `cloud` network and are reached by Caddy via service name.

## 1. Provision the VPS

- Vultr Cloud Compute (Shared CPU), Ubuntu 24.04, in a region near your users.
  - 2 GB / 1 vCPU is enough without Coolify. 1 GB can work for low traffic but is tight.
- Add your SSH key during creation.

After it boots, note the public IP (example below uses `203.0.113.10`).

### Firewall

Allow inbound 22, 80, 443. On Ubuntu with ufw:

```bash
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 2. Install Docker

SSH in and install Docker Engine + Compose plugin:

```bash
curl -fsSL https://get.docker.com | sh
```

## 3. Clone the repo

```bash
git clone https://github.com/bronsonavila/cluster-34-hoa-qa.git
cd cluster-34-hoa-qa
```

## 4. Configure environment

Copy the example and fill it in. Use sslip.io hostnames built from your server IP (no domain purchase needed); they resolve to the IP automatically and Caddy will issue Let's Encrypt certs for them.

```bash
cp .env.cloud.example .env.cloud
```

Edit `.env.cloud`, replacing `203.0.113.10` with your IP and generating secrets:

```bash
openssl rand -hex 32   # N8N_ENCRYPTION_KEY
openssl rand -hex 24   # use the same value for QDRANT__SERVICE__API_KEY and QDRANT_API_KEY
```

Key variables (all in `.env.cloud`):

| Variable                                                              | Purpose                                    |
| --------------------------------------------------------------------- | ------------------------------------------ |
| `APP_FQDN` / `N8N_FQDN` / `QDRANT_FQDN`                               | Hostnames Caddy serves                     |
| `N8N_HOST` / `N8N_PUBLIC_URL` / `N8N_EDITOR_BASE_URL` / `WEBHOOK_URL` | n8n public URL (match `N8N_FQDN`)          |
| `APP_PUBLIC_URL`                                                      | Chat UI origin for CORS (match `APP_FQDN`) |
| `N8N_ENCRYPTION_KEY`                                                  | `openssl rand -hex 32`                     |
| `QDRANT__SERVICE__API_KEY` / `QDRANT_API_KEY`                         | Same value; protects Qdrant                |
| `OPENROUTER_API_KEY`                                                  | Your OpenRouter key                        |

## 5. Bring up the stack

```bash
docker compose -f docker-compose.cloud.yml up -d --build
```

The `--build` flag is required: Caddy is built locally from `deploy/Caddy.Dockerfile` (it bundles the non-standard `rate_limit` module) rather than pulled, so a plain `up -d` would not produce the custom image.

On first boot, `n8n-import` loads cloud credentials and the chat workflow (CORS patched from `APP_PUBLIC_URL`, workflow activated). Caddy obtains TLS certs the first time each hostname is hit; the initial request can take a few seconds.

Check logs if needed:

```bash
docker compose -f docker-compose.cloud.yml logs -f caddy
docker compose -f docker-compose.cloud.yml logs n8n-cloud-import
```

## 6. Create the Qdrant collection

From your local machine or the server, create the collection the workflows expect:

```bash
curl -X PUT "https://qdrant.203.0.113.10.sslip.io/collections/governing-documents" \
  -H "api-key: $QDRANT_API_KEY" -H "Content-Type: application/json" \
  -d '{"vectors": {"size": 4096, "distance": "Cosine"}}'
```

## 7. Point local ingestion at the VPS Qdrant

On your local machine, set in `.env`:

```bash
QDRANT_PUBLIC_URL=https://qdrant.203.0.113.10.sslip.io
QDRANT_API_KEY=<same key as cloud>
```

Then (re)import the ingestion workflow and run it:

```bash
docker exec n8n n8n import:credentials --separate --input=/n8n/credentials
docker exec n8n n8n import:workflow --input=/n8n/workflows/hoa-ingestion.json
docker exec n8n n8n update:workflow --id=hoaIngest2026 --active=true
docker restart n8n
```

Drop a test PDF into `shared/rag-files/inbox/` and confirm vectors appear in the VPS Qdrant collection `governing-documents`.

## 8. Verify end to end

1. Visit `https://app.203.0.113.10.sslip.io` (chat UI).
2. Ask a question grounded in an ingested document.
3. Confirm the browser calls `https://n8n.203.0.113.10.sslip.io/webhook/.../chat` (Network tab).

## 9. Updating after a push

There is no push-to-deploy without Coolify. To update the VPS after changing the repo:

```bash
cd cluster-34-hoa-qa && git pull
docker compose -f docker-compose.cloud.yml pull
docker compose -f docker-compose.cloud.yml up -d --build
```

`pull` refreshes the upstream images (n8n, qdrant, nginx); it does not touch the locally built Caddy image, so `--build` is what picks up Caddyfile or Dockerfile changes.

Workflow/credential changes also need a re-import. Remove the marker to let the import job rerun, or import manually:

```bash
docker compose -f docker-compose.cloud.yml exec n8n rm -f /home/node/.n8n/.imported
docker compose -f docker-compose.cloud.yml up -d n8n-import n8n
```

## Backups

Snapshot the Docker volumes `n8n_storage` (n8n SQLite DB + encryption key) and `qdrant_storage` (vectors) periodically, or take a Vultr instance snapshot. Vectors are also reproducible by re-running local ingestion.

## Optional: real domain

To move from sslip.io to your own domain, you only need to relocate the user-facing hosts (`app` and `n8n`). Qdrant is machine-to-machine and can stay on its sslip.io name, which avoids editing your local `.env`.

1. Add A records pointing at the server IP. Add them wherever the domain's DNS is actually hosted (check the registrar's nameservers first; a domain registered at one provider can have DNS served by another, so manage records where the nameservers point). Explicit records win over any `*` wildcard.

   ```text
   app        A   <server-ip>
   n8n        A   <server-ip>
   ```

2. Wait for DNS to resolve before touching the stack (Caddy needs it for the Let's Encrypt HTTP-01 challenge):

   ```bash
   dig +short app.example.com   # must return <server-ip>
   ```

3. Point `.env.cloud` at the new hostnames (leave `QDRANT_FQDN`/`QDRANT_API_KEY` alone): `APP_FQDN`, `N8N_FQDN`, `N8N_HOST`, `N8N_PUBLIC_URL`, `N8N_EDITOR_BASE_URL`, `WEBHOOK_URL` (keep trailing slash), and `APP_PUBLIC_URL`.

4. Recreate, then re-seed so the chat trigger's CORS origin is rewritten from the new `APP_PUBLIC_URL`, then restart n8n. The restart is required and easy to miss: re-importing only writes the new origin to the DB; a running n8n keeps serving the old CORS registration until it restarts (the import job even logs "Changes will not take effect if n8n is running").

   ```bash
   docker compose -f docker-compose.cloud.yml up -d
   docker compose -f docker-compose.cloud.yml exec n8n rm -f /home/node/.n8n/.imported
   docker compose -f docker-compose.cloud.yml up -d n8n-import n8n
   docker compose -f docker-compose.cloud.yml restart n8n
   ```

Caddy reissues certs automatically on the first request to each new host. If the browser shows a CORS preflight failure (`No 'Access-Control-Allow-Origin' header`), it almost always means step 4's `restart n8n` was skipped.
