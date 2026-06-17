# OpenWA — Estado del Proyecto

> Última actualización: 2026-06-16

## ¿Qué es OpenWA?

Gateway de WhatsApp **auto-hospedado**: backend NestJS (`:2785`) + dashboard React (`:2886`), motor `whatsapp-web.js` (automatización de WhatsApp Web). Permite gestionar sesiones, enviar/recibir mensajes, grupos, contactos, etiquetas, canales, webhooks, API keys y un sistema de plugins.

## Versión actual: 0.1.6

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | NestJS (TypeScript) |
| Frontend | React + Vite (`:2886`) |
| Motor WhatsApp | whatsapp-web.js + Puppeteer/Chromium headless |
| Base de datos | SQLite (por defecto) o PostgreSQL |
| Almacenamiento | Filesystem local, S3 o MinIO |
| Cache/Cola | Redis + Bull (opcional) |
| Container | Docker + Docker Compose |
| Reverse proxy | Traefik |

## Módulos / Estructura de carpetas

```
OpenWA/
├── src/           ← Backend NestJS (105 endpoints, 16 módulos)
├── dashboard/     ← Frontend React
├── sdk/           ← SDK/cliente
├── ai-bot/        ← Companion: Obsidian vector-RAG + LLM (auto-reply por webhooks)
├── data/          ← Datos runtime (BD, vault, config generada)
├── docs/          ← Documentación
├── scripts/       ← Scripts utilitarios
├── traefik/       ← Config de Traefik
└── test/          ← Tests
```

## API Surface

**105 endpoints REST en 16 módulos:**
- sessions (9), messages (17), groups (12), contacts (6)
- labels (5), channels (5), webhooks (7), auth (7)
- catalog (5), plugins (6), infrastructure (11), storage (4)
- media, chats, status, misc

## Módulo ai-bot

Companion que NO viene con OpenWA core. Conectado via webhooks:
- Usa Obsidian vault como base de conocimiento (vector-RAG)
- Embedding: Ollama (`nomic-embed-text`) via `obsidian-notes-rag` MCP
- LLM: configurable (Gemini API key ya está en `.claude/settings.local.json`)
- Sistema de auto-reply por grupo/chat

## Estado actual (2026-06-16)

### Completado
- Core NestJS backend con todos los módulos
- Dashboard React
- Docker Compose con Traefik
- Migraciones SQLite + PostgreSQL
- CI/CD con GitHub Actions

### En progreso / Pendiente
- `dashboard/Dockerfile` — modificado (sin commitear)
- `ai-bot/` — archivos nuevos sin commitear
- `docker-compose.override.yml` — nuevo sin commitear
- `CAPABILITIES.md` — auto-generado, sin commitear

## Configuración clave

```
API_MASTER_KEY=dev-admin-key (desarrollo)
PORT=2785
DASHBOARD_PORT=2886
DATABASE_TYPE=sqlite (default)
```

## Git remotes

| Remote | URL | Rol |
|---|---|---|
| `origin` | `https://github.com/rmyndharis/OpenWA.git` | Upstream (solo fetch) |
| `fork` | `https://github.com/bacourosp/OpenWA.git` | Fork propio (push aquí) |

- GitHub autenticado como **`bacourosp`**
- Para hacer push siempre usar: `git push fork main`
- Para traer cambios del upstream: `git pull origin main` (luego resolver conflictos y `git push fork main`)
