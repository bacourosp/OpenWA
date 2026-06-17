# OpenWA — Capabilities, Automations & Limits
> Auto-generated from the running gateway (`OpenWA API 0.1.6`, OpenAPI at `http://localhost:2785/api/docs-json`) plus the project docs. Reflects **105 REST endpoints across 16 modules**, the webhook/plugin automation surface, and the AI auto-reply companion added in `ai-bot/`.

## 1. What OpenWA is (and is not)

OpenWA is a self-hosted **WhatsApp API gateway**: NestJS backend (`:2785`) + React dashboard (`:2886`), engine `whatsapp-web.js` (WhatsApp Web automation). It gives you sessions/QR, send/receive, groups, contacts, labels, channels, webhooks, API keys and a plugin system.

It does **not** ship an AI, a knowledge base, or per-group auto-reply logic. Those are provided here by the **`ai-bot/`** companion (Obsidian vector-RAG + LLM) wired via webhooks.

## 2. Available options (configuration)

| Area | Options | Key env vars |
|---|---|---|
| WhatsApp engine | `whatsapp-web.js` (headless Chromium / Puppeteer) | `ENGINE_TYPE`, `PUPPETEER_HEADLESS`, `PUPPETEER_ARGS`, `SESSION_DATA_PATH` |
| Database | SQLite (default) or PostgreSQL | `DATABASE_TYPE`, `DATABASE_NAME`, `DATABASE_HOST/PORT/USERNAME/PASSWORD`, `DATABASE_SYNCHRONIZE` |
| Storage | Local filesystem, S3 or MinIO | `STORAGE_TYPE`, `STORAGE_LOCAL_PATH`, `S3_ENDPOINT/BUCKET/REGION/ACCESS_KEY/SECRET_KEY` |
| Cache / queue | Redis + queue (optional, off by default) | `REDIS_ENABLED`, `QUEUE_ENABLED`, `CACHE_ENABLED` |
| Auth | API keys with roles (admin/operator), IP + session scoping, expiry | `API_MASTER_KEY` (dev seeds `dev-admin-key`) |
| Webhooks | Per-session, HMAC-signed, retries | `WEBHOOK_TIMEOUT`, `WEBHOOK_MAX_RETRIES`, `WEBHOOK_RETRY_DELAY` |
| Rate limiting | Per-category request limits | `RATE_LIMIT_TTL`, `RATE_LIMIT_MAX` |
| Plugins | Drop-in plugins + lifecycle hooks | `PLUGINS_ENABLED`, `PLUGINS_DIR` |
| Proxy | Per-session outbound proxy | `PROXY_ENABLED` (+ per-session `proxyUrl`/`proxyType`) |
| Dashboard / API | Ports, CORS, Swagger, base URLs | `PORT`, `DASHBOARD_PORT`, `CORS_ORIGINS`, `ENABLE_SWAGGER` |

## 3. REST API surface (105 endpoints)

### sessions (9)

- `POST /api/sessions` — Create a new WhatsApp session
- `GET /api/sessions` — List all sessions
- `GET /api/sessions/{id}` — Get session by ID
- `DELETE /api/sessions/{id}` — Delete a session
- `POST /api/sessions/{id}/start` — Start a session and initialize WhatsApp connection
- `POST /api/sessions/{id}/stop` — Stop a session and disconnect WhatsApp
- `GET /api/sessions/{id}/qr` — Get QR code for session authentication
- `GET /api/sessions/{id}/groups` — Get all groups for a session
- `GET /api/sessions/stats/overview` — Get session statistics for multi-session monitoring

### messages (17)

- `GET /api/sessions/{sessionId}/messages` — Get message history for a session
- `POST /api/sessions/{sessionId}/messages/send-text` — Send a text message
- `POST /api/sessions/{sessionId}/messages/send-image` — Send an image message
- `POST /api/sessions/{sessionId}/messages/send-video` — Send a video message
- `POST /api/sessions/{sessionId}/messages/send-audio` — Send an audio/voice message
- `POST /api/sessions/{sessionId}/messages/send-document` — Send a document/file
- `POST /api/sessions/{sessionId}/messages/send-location` — Send a location message
- `POST /api/sessions/{sessionId}/messages/send-contact` — Send a contact card message
- `POST /api/sessions/{sessionId}/messages/send-sticker` — Send a sticker message
- `POST /api/sessions/{sessionId}/messages/reply` — Reply to a message
- `POST /api/sessions/{sessionId}/messages/forward` — Forward a message to another chat
- `POST /api/sessions/{sessionId}/messages/react` — Add or remove a reaction to a message
- `GET /api/sessions/{sessionId}/messages/{chatId}/{messageId}/reactions` — Get reactions for a specific message
- `POST /api/sessions/{sessionId}/messages/delete` — Delete a message
- `POST /api/sessions/{sessionId}/messages/send-bulk` — Send messages to multiple recipients (async batch processing)
- `GET /api/sessions/{sessionId}/messages/batch/{batchId}` — Get batch processing status
- `POST /api/sessions/{sessionId}/messages/batch/{batchId}/cancel` — Cancel a running batch

### groups (12)

- `GET /api/sessions/{sessionId}/groups` — Get all groups for a session
- `POST /api/sessions/{sessionId}/groups` — Create a new group
- `GET /api/sessions/{sessionId}/groups/{groupId}` — Get detailed group info
- `POST /api/sessions/{sessionId}/groups/{groupId}/participants` — Add participants to a group
- `DELETE /api/sessions/{sessionId}/groups/{groupId}/participants` — Remove participants from a group
- `POST /api/sessions/{sessionId}/groups/{groupId}/participants/promote` — Promote participants to admin
- `POST /api/sessions/{sessionId}/groups/{groupId}/participants/demote` — Demote participants from admin
- `PUT /api/sessions/{sessionId}/groups/{groupId}/subject` — Change group name/subject
- `PUT /api/sessions/{sessionId}/groups/{groupId}/description` — Change group description
- `POST /api/sessions/{sessionId}/groups/{groupId}/leave` — Leave a group
- `GET /api/sessions/{sessionId}/groups/{groupId}/invite-code` — Get group invite code/link
- `POST /api/sessions/{sessionId}/groups/{groupId}/invite-code/revoke` — Revoke group invite code and generate new one

### contacts (6)

- `GET /api/sessions/{sessionId}/contacts` — Get all contacts for a session
- `GET /api/sessions/{sessionId}/contacts/{contactId}` — Get a specific contact by ID
- `GET /api/sessions/{sessionId}/contacts/check/{number}` — Check if a phone number exists on WhatsApp
- `GET /api/sessions/{sessionId}/contacts/{contactId}/profile-picture` — Get profile picture URL for a contact
- `POST /api/sessions/{sessionId}/contacts/{contactId}/block` — Block a contact
- `DELETE /api/sessions/{sessionId}/contacts/{contactId}/block` — Unblock a contact

### labels (5)

- `GET /api/sessions/{sessionId}/labels` — Get all labels (WhatsApp Business only)
- `GET /api/sessions/{sessionId}/labels/{labelId}` — Get a specific label by ID
- `GET /api/sessions/{sessionId}/labels/chat/{chatId}` — Get labels for a specific chat
- `POST /api/sessions/{sessionId}/labels/chat/{chatId}` — Add a label to a chat
- `DELETE /api/sessions/{sessionId}/labels/chat/{chatId}/{labelId}` — Remove a label from a chat

### channels (5)

- `GET /api/sessions/{sessionId}/channels` — Get all subscribed channels/newsletters
- `GET /api/sessions/{sessionId}/channels/{channelId}` — Get a specific channel by ID
- `DELETE /api/sessions/{sessionId}/channels/{channelId}` — Unsubscribe from a channel
- `GET /api/sessions/{sessionId}/channels/{channelId}/messages` — Get messages from a channel
- `POST /api/sessions/{sessionId}/channels/subscribe` — Subscribe to a channel using invite code

### webhooks (7)

- `POST /api/sessions/{sessionId}/webhooks` — Create a webhook for the session
- `GET /api/sessions/{sessionId}/webhooks` — List all webhooks for a session
- `GET /api/sessions/{sessionId}/webhooks/{id}` — Get a webhook by ID
- `PUT /api/sessions/{sessionId}/webhooks/{id}` — Update a webhook
- `DELETE /api/sessions/{sessionId}/webhooks/{id}` — Delete a webhook
- `POST /api/sessions/{sessionId}/webhooks/{id}/test` — Test a webhook by sending a test payload
- `GET /api/webhooks` — List all webhooks across all sessions

### auth (7)

- `POST /api/auth/api-keys` — Create a new API key (admin only)
- `GET /api/auth/api-keys` — List all API keys (admin only)
- `GET /api/auth/api-keys/{id}` — Get API key details (admin only)
- `PUT /api/auth/api-keys/{id}` — Update API key (admin only)
- `DELETE /api/auth/api-keys/{id}` — Delete API key (admin only)
- `POST /api/auth/api-keys/{id}/revoke` — Revoke API key (admin only)
- `POST /api/auth/validate` — Validate an API key

### Catalog (5)

- `GET /api/sessions/{sessionId}/catalog` — Get business catalog info
- `GET /api/sessions/{sessionId}/catalog/products` — List catalog products
- `GET /api/sessions/{sessionId}/catalog/products/{productId}` — Get a specific product
- `POST /api/sessions/{sessionId}/messages/send-product` — Send a product message
- `POST /api/sessions/{sessionId}/messages/send-catalog` — Send catalog link

### plugins (6)

- `GET /api/plugins` — List all plugins
- `GET /api/plugins/{id}` — Get plugin by ID
- `POST /api/plugins/{id}/enable` — Enable a plugin
- `POST /api/plugins/{id}/disable` — Disable a plugin
- `PUT /api/plugins/{id}/config` — Update plugin configuration
- `GET /api/plugins/{id}/health` — Check plugin health

### infrastructure (11)

- `GET /api/infra/status` — Get infrastructure status
- `GET /api/infra/engines` — Get available WhatsApp engines
- `GET /api/infra/engines/current` — Get current active engine
- `PUT /api/infra/config` — Save infrastructure configuration to .env file
- `POST /api/infra/restart` — Request server restart with Docker orchestration
- `GET /api/infra/health` — Health check endpoint
- `GET /api/infra/export-data` — Export all data from Data DB for migration
- `POST /api/infra/import-data` — Import data to Data DB (replaces existing data)
- `GET /api/infra/storage/files/count` — Get file count in current storage
- `GET /api/infra/storage/export` — Export all storage files as tar.gz
- `POST /api/infra/storage/import` — Import storage files from tar.gz

### Statistics (3)

- `GET /api/stats/overview` — Get overall statistics
- `GET /api/stats/messages` — Get message statistics with time series
- `GET /api/stats/sessions/{sessionId}` — Get statistics for a specific session

### Status (6)

- `GET /api/sessions/{sessionId}/status` — Get all contact status updates
- `GET /api/sessions/{sessionId}/status/{contactId}` — Get status updates from a specific contact
- `POST /api/sessions/{sessionId}/status/send-text` — Post a text status
- `POST /api/sessions/{sessionId}/status/send-image` — Post an image status
- `POST /api/sessions/{sessionId}/status/send-video` — Post a video status
- `DELETE /api/sessions/{sessionId}/status/{statusId}` — Delete own status

### settings (2)

- `GET /api/settings` — Get application settings
- `PUT /api/settings` — Update application settings

### audit (1)

- `GET /api/audit` — List audit logs with optional filters

### health (3)

- `GET /api/health` — Basic health check
- `GET /api/health/live` — Liveness probe for Kubernetes
- `GET /api/health/ready` — Readiness probe for Kubernetes

## 4. Possible automations

### 4.1 Webhooks (event push)
Register per session: `POST /api/sessions/:id/webhooks` with `{ url, events, secret }`. Payloads are HMAC-signed (`x-openwa-signature: sha256=...`) with idempotency headers (`x-openwa-idempotency-key`, `x-openwa-retry-count`).

**Events:** `message.received`, `message.sent`, `message.ack`, `message.revoked`, `session.status`, `session.qr`, `session.authenticated`, `session.disconnected`, `group.join`, `group.leave`, `group.update`.

### 4.2 WebSocket (real-time)
`ws://localhost:2785/ws?apiKey=...` — subscribe per session/event for live streams (same event names as webhooks).

### 4.3 Plugins & hooks
In-process extension via `PLUGINS_DIR` plus a `hook-manager` (`src/core/hooks`). Manage at runtime through the `plugins` endpoints. Use for custom message processing without an external service.

### 4.4 Bulk / templated messaging
`POST /api/sessions/:id/messages/send-bulk` — up to 100 messages/request, `{name}`-style variable substitution, configurable delay + randomization to reduce ban risk; track via batch status endpoints.

### 4.5 AI auto-reply companion (this repo, `ai-bot/`)
Consumes `message.received` → filters to `ALLOWED_CHATS` groups → retrieves from your **Obsidian vault via a vector-RAG MCP server** → answers grounded on your notes (Claude by default, provider-pluggable) → replies via `send-text`. Persona editable in `ai-bot/system-prompt.md`.

### 4.6 n8n / external orchestration
See `docs/22-n8n-integration.md` — webhooks + REST make OpenWA drivable from n8n, Make, Zapier, etc.

## 5. Current limits

### 5.1 Rate limits (per docs/06)

| Category | Limit |
|---|---|
| Session management | 10 req/min |
| Send message | 60 req/min |
| Read operations | 120 req/min |
| Webhook management | 10 req/min |

Global defaults: `RATE_LIMIT_TTL=60s`, `RATE_LIMIT_MAX=100`. Headers: `X-RateLimit-Limit/Remaining/Reset`.

### 5.2 Message / media limits

| Type | Limit |
|---|---|
| Text message | 65,536 chars |
| Caption | 1,024 chars |
| Group name / description | 100 / 2,048 chars |
| Image | 16 MB (JPEG/PNG/WebP/GIF) |
| Video | 64 MB (MP4/3GP/AVI/MKV) |
| Audio | 16 MB (MP3/OGG/M4A/AMR/WAV) |
| Document | 100 MB |
| Sticker | 500 KB (512×512 WebP) |
| Bulk send | 100 messages / request |

### 5.3 Webhooks
Timeout `10000ms`, max retries `3`, retry delay `5000ms`. Per-session webhook count is capped (`WEBHOOK_LIMIT_REACHED`).

### 5.4 Platform / engine constraints
- **Unofficial automation** (`whatsapp-web.js`): risk of WhatsApp **bans**; use a non-critical number. One linked phone per session; the phone should stay reachable.
- Each session runs a **headless Chromium** — RAM/CPU scale with concurrent sessions.
- Dev defaults: **SQLite** + `DATABASE_SYNCHRONIZE=true` (not for production), queue/redis/cache **disabled**, dashboard+API bound to `127.0.0.1` only.
- Session limit / banned-number states surface as `SESSION_LIMIT_REACHED` / `SESSION_BANNED`.

### 5.5 AI companion limits (ai-bot/)
- Answer quality bounded by the LLM context window and the vault index freshness (re-index when notes change) and RAG top-k.
- Only replies to chats in `ALLOWED_CHATS` (and DMs only if `REPLY_TO_DIRECT=true`); text messages only by default.
- Per-message LLM + embeddings cost (unless using a local model via Ollama).

---
_Regenerate after API changes:_ `curl -s http://localhost:2785/api/docs-json -o /tmp/openwa-openapi.json` then re-run the generator._
