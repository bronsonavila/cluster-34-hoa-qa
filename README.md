# Cluster 34 HOA Q&A

A question-and-answer app over the Mililani Town Unit 34 Association governing documents. Drop PDFs into a shared inbox, and the stack converts them, embeds them into Qdrant, and serves a chat UI grounded in those documents only.

> Forked from [n8n-io/self-hosted-ai-starter-kit](https://github.com/n8n-io/self-hosted-ai-starter-kit) and maintained by [theaiautomators](https://github.com/theaiautomators).

## Stack

| Service         | Purpose                                                                                 |
| --------------- | --------------------------------------------------------------------------------------- |
| **n8n**         | Ingestion pipeline (local) and HOA chat agent (cloud)                                    |
| **OpenRouter**  | Chat (`deepseek/deepseek-v4-flash`) and embeddings (`qwen/qwen3-embedding-8b`)          |
| **Qdrant**      | Vector store (`governing-documents`, 4096-dim Cosine) on the VPS                        |
| **PostgreSQL**  | Local n8n workflow and execution storage                                                |
| **Docling**     | PDF to structured markdown (OCR enabled), local only                                  |
| **nginx**       | Chat UI (`web/`), served locally at http://localhost:8080 or on the VPS behind Caddy    |
| **inbox-poker** | macOS workaround: wakes the file trigger when Finder drops do not propagate into Docker |

No local GPU is required. OpenRouter handles inference.

## Hybrid deployment

- **Local machine:** Docling + ingestion n8n (`n8n/workflows/hoa-ingestion.json`). Writes vectors to the VPS Qdrant over HTTPS.
- **VPS:** chat n8n + Qdrant + static UI via `docker-compose.cloud.yml`, fronted by a Caddy reverse proxy with automatic HTTPS.

See [deploy/DEPLOY.md](deploy/DEPLOY.md) for the full VPS setup guide.

## Requirements

- Docker Desktop (or Docker Engine + Compose v2)
- An [OpenRouter](https://openrouter.ai/) API key
- For production chat: a small always-on VPS (see deploy guide)

## Setup (local ingestion)

```bash
git clone https://github.com/bronsonavila/cluster-34-hoa-qa.git
cd cluster-34-hoa-qa
cp .env.example .env
```

Open `.env` and set `OPENROUTER_API_KEY`, `QDRANT_PUBLIC_URL`, and `QDRANT_API_KEY` (from the cloud stack). Then start the local stack:

```bash
docker compose --profile cpu up -d
```

The `--profile cpu` flag starts Docling. Without it, only n8n and Postgres run.

On first start, `n8n-import` loads credentials and the ingestion workflow from `n8n/credentials/` and `n8n/workflows/hoa-ingestion.json`.

## Chat UI

**Local dev:** open **http://localhost:8080/** (uses `web/config.js` pointing at local n8n).

**Production:** open **https://app.your-host/** after the VPS deploy. The cloud nginx container regenerates `config.js` from `N8N_PUBLIC_URL`.

Ingest at least one governing document before chatting so the knowledge base has content to search.

## Document ingestion

Drop PDF files into `shared/rag-files/inbox/`. The pipeline runs automatically:

1. **Docling** converts the PDF to markdown.
2. Markdown is saved under `shared/rag-files/markdown/`.
3. Chunks are embedded and upserted into Qdrant on the VPS (`governing-documents`).
4. The source PDF is moved to `shared/rag-files/archive/` on success.

To re-ingest a document, move it from `archive/` back to `inbox/`.

### macOS and Docker Desktop

Docker Desktop's default file sharing (VirtioFS) does not notify containers when you add files from Finder. The `inbox-poker` sidecar touches the inbox directory from inside the VM every few seconds so n8n's file trigger re-scans. Expect up to about 5 seconds from drop to execution. An empty inbox does not create extra workflow runs.

## Repo layout

```text
docker-compose.yml          # local stack (Docling + ingestion n8n)
docker-compose.cloud.yml    # VPS stack (Caddy + chat n8n + Qdrant + UI)
deploy/                     # VPS deploy guide, Caddyfile, nginx helpers
n8n/
  credentials/              # local seed credentials (remote Qdrant)
  cloud/credentials/        # cloud seed credentials (internal Qdrant)
  workflows/hoa-ingestion.json   # local ingestion
  workflows/hoa-chat.json        # cloud chat (imported on VPS only)
web/                        # Cluster 34 HOA Q&A chat UI
shared/
  rag-files/
    inbox/                  # drop PDFs here
    markdown/               # converted markdown
    archive/                # processed PDFs
  docling-scratch/          # runtime temp (gitignored; Docling recreates it)
```

Inside containers, `shared/` is mounted at `/data/shared` for n8n and `/shared` for Docling. n8n seed files are mounted at `/n8n`.

## Updating workflows

**Local ingestion:**

```bash
docker exec n8n n8n import:credentials --separate --input=/n8n/credentials
docker exec n8n n8n import:workflow --input=/n8n/workflows/hoa-ingestion.json
docker exec n8n n8n update:workflow --id=hoaIngest2026 --active=true
docker restart n8n
```

**Cloud chat:** on the VPS:

```bash
docker exec n8n-cloud n8n import:credentials --separate --input=/n8n/cloud/credentials
docker exec n8n-cloud sh -c 'sed "s|https://app.example.com|${APP_PUBLIC_URL}|g" /n8n/workflows/hoa-chat.json > /tmp/hoa-chat.json && n8n import:workflow --input=/tmp/hoa-chat.json'
docker exec n8n-cloud n8n update:workflow --id=hoaChat2026 --active=true
```

`APP_PUBLIC_URL` is read from `.env.cloud` inside the container.

## Upgrading images

```bash
docker compose --profile cpu pull
docker compose create && docker compose --profile cpu up -d
```

Local n8n editor: **http://localhost:5678**

## License

Apache License 2.0 — see [LICENSE](LICENSE).
