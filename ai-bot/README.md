# OpenWA AI Bot — Obsidian-grounded auto-reply

A small companion service that turns the OpenWA **gateway** into a WhatsApp assistant that:

- only answers **selected groups** (allow-list),
- grounds every answer on **your own notes** in an **Obsidian vault** (vector RAG via an MCP server),
- replies through OpenWA's REST API.

```
WhatsApp ⇄ OpenWA (:2785) ──webhook(message.received)──▶ ai-bot
                                                          ├─ allow-list filter (ALLOWED_CHATS)
                                                          ├─ RAG over /vault via Obsidian MCP
                                                          └─ Claude (pluggable) → send-text
```

The bot is a Claude Agent SDK client: it launches the Obsidian RAG **MCP server** as a child process
(see `mcp-servers.json`) and uses its search tools to retrieve relevant notes before answering.

## Setup

1. **Put your notes** (`.md`) in the vault folder. Default host path is `./data/vault`
   (override with `VAULT_HOST_PATH` in `.env`). It is mounted read-only at `/vault` in the container.

2. **Configure `.env`** (copy from `.env.example`; the installer already pre-filled `SESSION_ID`,
   `OPENWA_API_KEY` and `WEBHOOK_SECRET`). You must still set:
   - `ANTHROPIC_API_KEY` — your Claude key.
   - `ALLOWED_CHATS` — comma-separated group ids the bot may answer. Get them with:
     ```bash
     curl -s http://localhost:2785/api/sessions/$SESSION_ID/groups \
       -H "X-API-Key: dev-admin-key" | jq '.[]? , .data[]? | {id,name}'
     ```
     Group ids end in `@g.us`.

3. **Pick the Obsidian RAG MCP server** in `mcp-servers.json`. Default is `obsidian-notes-rag` with
   Ollama embeddings (`nomic-embed-text`). Alternatives: `vault-mcp`, or `mcp-obsidian` (Local REST
   API plugin). If you use Ollama for embeddings, run `ollama pull nomic-embed-text` on the host.

4. **Start everything** from the repo root:
   ```bash
   docker compose -f docker-compose.dev.yml -f docker-compose.override.yml up -d --build
   ```

5. **Register the webhook** so OpenWA pushes incoming messages to the bot:
   ```bash
   curl -X POST http://localhost:2785/api/sessions/$SESSION_ID/webhooks \
     -H "Content-Type: application/json" -H "X-API-Key: dev-admin-key" \
     -d "{\"url\":\"http://ai-bot:3000/webhook\",\"events\":[\"message.received\"],\"secret\":\"<WEBHOOK_SECRET from .env>\"}"
   ```

## Customizing replies

- **Persona / tone / rules:** edit `system-prompt.md` (mounted live — applies on the next message).
- **Which groups:** edit `ALLOWED_CHATS` in `.env`, then `docker compose ... up -d` to reload.
- **Model / provider:** `AGENT_MODEL` (default `claude-sonnet-4-6`). To switch providers entirely,
  replace the body of `src/agent.ts` (keep the `generateReply` signature).
- **Knowledge base:** add/edit `.md` files in the vault; re-index per your MCP server's instructions.

## Test

From an allowed group, ask something covered by a note (e.g. the sample `horarios.md`):
"¿Cuál es el horario de atención?" → the bot replies grounded on that note. Ask from a non-allowed
chat → no reply. Ask something not in the vault → it says it doesn't have that info.
