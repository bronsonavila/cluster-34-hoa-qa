# Cluster 34 HOA Q&A

A self-hosted question-and-answer app over the Mililani Town Unit 34 Association governing documents. Drop PDFs into a shared inbox, and the stack converts them, embeds them into Qdrant, and serves a chat UI grounded in those documents only.

> Forked from [n8n-io/self-hosted-ai-starter-kit](https://github.com/n8n-io/self-hosted-ai-starter-kit) and maintained by [theaiautomators](https://github.com/theaiautomators).

## Stack

| Service         | Purpose                                                                                 |
| --------------- | --------------------------------------------------------------------------------------- |
| **n8n**         | Ingestion pipeline and HOA chat agent (`HOA Q&A Ingestion and Chat`)                    |
| **OpenRouter**  | Chat (`deepseek/deepseek-v4-flash`) and embeddings (`qwen/qwen3-embedding-8b`)          |
| **Qdrant**      | Vector store (`governing-documents`, 4096-dim Cosine)                                   |
| **PostgreSQL**  | n8n workflow and execution storage                                                      |
| **Docling**     | PDF to structured markdown (OCR enabled)                                                |
| **nginx**       | Chat UI at http://localhost:8080                                                        |
| **inbox-poker** | macOS workaround: wakes the file trigger when Finder drops do not propagate into Docker |

No local GPU is required. OpenRouter handles inference.

## Requirements

- Docker Desktop (or Docker Engine + Compose v2)
- An [OpenRouter](https://openrouter.ai/) API key

## Setup

```bash
git clone https://github.com/bronsonavila/cluster-34-hoa-qa.git
cd cluster-34-hoa-qa
cp .env.example .env
```

Open `.env` and set `OPENROUTER_API_KEY` and the other secrets. Then start the stack:

```bash
docker compose --profile cpu up -d
```

The `--profile cpu` flag starts Docling. Without it, only n8n, Postgres, and Qdrant run.

On first start, `n8n-import` loads credentials and the workflow from `n8n/credentials/` and `n8n/workflows/`.

## Chat UI

Open **http://localhost:8080/**.

The widget calls the n8n chat webhook. Ingest at least one governing document first so the knowledge base has content to search.

> **Cloud deployment:** [web/index.html](web/index.html) hardcodes `localhost:5678` for the webhook. Put the chat UI and n8n webhook behind one public domain via a reverse proxy, and tighten `allowedOrigins` on the chat trigger from `*` to that domain.

## Document ingestion

Drop PDF files into `shared/rag-files/inbox/`. The pipeline runs automatically:

1. **Docling** converts the PDF to markdown.
2. Markdown is saved under `shared/rag-files/markdown/`.
3. Chunks are embedded and upserted into Qdrant (`governing-documents`).
4. The source PDF is moved to `shared/rag-files/archive/` on success.

To re-ingest a document, move it from `archive/` back to `inbox/`.

### macOS and Docker Desktop

Docker Desktop's default file sharing (VirtioFS) does not notify containers when you add files from Finder. The `inbox-poker` sidecar touches the inbox directory from inside the VM every few seconds so n8n's file trigger re-scans. Expect up to about 5 seconds from drop to execution. An empty inbox does not create extra workflow runs.

## Repo layout

```text
n8n/
  credentials/     # seed credentials (imported on first run)
  workflows/       # HOA Q&A Ingestion and Chat
web/               # Cluster 34 HOA Q&A chat UI
shared/
  rag-files/
    inbox/         # drop PDFs here
    markdown/      # converted markdown
    archive/       # processed PDFs
  docling-scratch/ # runtime temp (gitignored; Docling recreates it)
```

Inside containers, `shared/` is mounted at `/data/shared` for n8n and `/shared` for Docling. n8n seed files are mounted at `/n8n`.

## Updating the workflow

After editing files under `n8n/credentials/` or `n8n/workflows/`:

```bash
docker exec n8n n8n import:credentials --separate --input=/n8n/credentials
docker exec n8n n8n import:workflow --separate --input=/n8n/workflows
docker exec n8n n8n update:workflow --id=tQ4Qv9qY2TnM4XrK --active=true
docker restart n8n
```

## Upgrading images

```bash
docker compose --profile cpu pull
docker compose create && docker compose --profile cpu up -d
```

n8n is also at **http://localhost:5678** for the workflow editor.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
