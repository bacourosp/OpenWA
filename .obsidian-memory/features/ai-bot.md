# ai-bot — Companion de IA para OpenWA

## Descripción

Módulo companion (NO parte del core) que agrega auto-reply inteligente a OpenWA. Se conecta via webhooks al gateway principal.

## Arquitectura

```
WhatsApp mensaje entrante
    → OpenWA webhook
    → ai-bot (recibe evento)
    → RAG: busca en vault Obsidian
    → LLM: genera respuesta
    → OpenWA API: envía respuesta
```

## Stack

- **RAG**: Obsidian vault como base de conocimiento
- **Embeddings**: Ollama con modelo `nomic-embed-text` (`http://host.docker.internal:11434`)
- **MCP para vault**: `obsidian-notes-rag` (o alternativas: `vault-mcp`, `mcp-obsidian`)
- **LLM**: Gemini (via `GEMINI_API_KEY`)
- **Vault path (Docker)**: `/vault` → mapeado al host `../data/vault`

## Configuración MCP en ai-bot (Docker)

```json
"obsidian": {
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "obsidian-notes-rag", "--vault", "/vault"],
  "env": {
    "VAULT_PATH": "/vault",
    "EMBEDDINGS_PROVIDER": "ollama",
    "EMBEDDINGS_MODEL": "nomic-embed-text",
    "OLLAMA_BASE_URL": "http://host.docker.internal:11434"
  }
}
```

## Variables de entorno clave

```
GEMINI_API_KEY=...
VAULT_DIR=../data/vault
SYSTEM_PROMPT_PATH=./system-prompt.md
RAG_MAX_CHARS=120000
```

## Estado

- Carpeta `ai-bot/` creada recientemente (sin commitear al repo)
- Archivos `docker-compose.override.yml` para integrar con el stack principal

## Notas de desarrollo

- El vault del ai-bot (en `data/vault/`) es **distinto** al vault de memoria de Claude Code (`.obsidian-memory/`)
- El vault del ai-bot contiene el conocimiento de dominio para las respuestas automáticas
- El vault `.obsidian-memory/` es para la memoria de trabajo de Claude Code sobre el proyecto
