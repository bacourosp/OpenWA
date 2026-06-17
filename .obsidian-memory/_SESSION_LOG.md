# Session Log — OpenWA

> Formato: `## YYYY-MM-DD — [Qué se hizo] → [Próximos pasos]`
> La entrada más reciente va arriba.

---

## 2026-06-17 — Rediseño ai-bot: broadcaster programado con 3 jobs

**Qué se hizo:**
- REPLY_TO_DIRECT deshabilitado (false)
- Bot rediseñado de chatbot reactivo a broadcaster proactivo con 3 jobs programados
- Nuevo job `nasdaq-analysis.ts` — análisis fundamental NAS100 (Lun/Mié/Vie mañana)
- Nuevo job `trading-tips.ts` — tips de trading con rotación anti-repetición (Mar/Jue)
- Nuevo job `news-share.ts` — noticias/citas de figuras públicas en español (diario tarde)
- `voice.ts` — constante PABLO_VOICE compartida (tono casual, humanizado, parafaseado)
- `scheduler.ts` — rediseñado: bloques horarios + offset aleatorio dentro de la ventana
- TEST_MODE=true activado en .env → jobs cada 5 min al grupo de prueba (escalonados 90s)
- `config.ts` — nuevas vars: TEST_MODE, TEST_GROUP_ID, PRODUCTION_GROUPS, bloques por job
- `nasdaq.ts` — eliminado (reemplazado por jobs/nasdaq-analysis.ts)
- TypeScript: errores preexistentes en agent.ts corregidos (GeminiResponse type + implicit any)

**Archivos modificados:**
- `ai-bot/src/config.ts`
- `ai-bot/src/scheduler.ts`
- `ai-bot/src/server.ts`
- `ai-bot/src/agent.ts`
- `ai-bot/.env`
- `ai-bot/.env.example`

**Archivos creados:**
- `ai-bot/src/jobs/voice.ts`
- `ai-bot/src/jobs/nasdaq-analysis.ts`
- `ai-bot/src/jobs/trading-tips.ts`
- `ai-bot/src/jobs/news-share.ts`

**Archivos eliminados:**
- `ai-bot/src/nasdaq.ts` (reemplazado)

**Próximos pasos:**
- Probar: `cd ai-bot && npm run dev` con TEST_MODE=true → verificar los 3 mensajes en el grupo de prueba
- Cuando listo para producción: TEST_MODE=false, añadir grupos a PRODUCTION_GROUPS en .env
- Pendiente: despliegue Oracle Cloud (ver oracle-deploy.md)

---

## 2026-06-17 — Merge upstream + fork bacourosp/OpenWA configurado

**Qué se hizo:**
- Diagnóstico: merge interrumpido (106 commits upstream pendientes, 1 conflicto en `dashboard/Dockerfile`)
- Conflicto resuelto: conservado `node:22-alpine` (razón: npm 11 evita ERESOLVE con peer deps)
- Merge completado: `197089a` — 244 archivos, 21k+ líneas del upstream integradas
- Fork creado: `bacourosp/OpenWA` en GitHub (cuenta autenticada `bacourosp`)
- Remote `fork` agregado apuntando a `https://github.com/bacourosp/OpenWA.git`
- Push exitoso a `fork/main`

**Archivos modificados:**
- `dashboard/Dockerfile` — conflicto resuelto

**Remotes configurados:**
- `origin` → `rmyndharis/OpenWA` (upstream, solo fetch)
- `fork` → `bacourosp/OpenWA` (propio, siempre pushear aquí)

**Próximos pasos:**
- Crear cuenta Oracle Cloud → VM Ampere A1 (4 CPU / 24 GB RAM) — ver `.obsidian-memory/features/oracle-deploy.md`
- Compartir IP pública + clave SSH para que Claude complete el despliegue
- Agregar grupos de producción a `ALLOWED_CHATS` en `ai-bot/.env`
- Para futuros syncs del upstream: `git pull origin main` → resolver conflictos → `git push fork main`

---

## 2026-06-17 — AI-bot estable + precio NASDAQ en tiempo real + guía despliegue Oracle

**Qué se hizo:**
- Fix crítico: deduplicación de mensajes usaba `msg_unknown` para todos → bot ignoraba todo después del primer mensaje. Reemplazado por dedup basado en `sender+body+ventana 30s`.
- Fix: `REPLY_TO_DIRECT=true` habilitado para responder DMs desde segundo número.
- Fix: historial de conversación por chat (últimos 6 turnos) para que el bot recuerde el contexto.
- Fix: reglas de grounding relajadas — antes solo respondía desde el vault, ahora usa conocimiento general cuando el vault no tiene respuesta.
- Fix: límite de tokens subido de 450 → 1024 para evitar respuestas cortadas.
- Nuevo: `ai-bot/src/market.ts` — fetch de precio real NQ=F desde Yahoo Finance (sin API key, caché 15 min).
- Nuevo: detección automática de queries de mercado (`isMarketQuery`) → activa precio + Gemini Search.
- Modificado: informe NASDAQ diario ahora incluye precio real al inicio.
- Actualizado: vault `data/vault/experto-trading-nasdaq.md` con contexto USTEC.F = NQ=F.
- Documentado: guía de despliegue Oracle Cloud en `.obsidian-memory/features/oracle-deploy.md`.

**Archivos modificados:**
- `ai-bot/src/server.ts` — dedup, logging de filtros, REPLY_TO_DIRECT
- `ai-bot/src/agent.ts` — historial, grounding relajado, isMarketQuery, fetchNasPrice
- `ai-bot/src/market.ts` — NUEVO: fetch Yahoo Finance NQ=F
- `ai-bot/src/nasdaq.ts` — inyección de precio real en informe diario
- `ai-bot/.env` — REPLY_TO_DIRECT=true, API keys OpenRouter + HuggingFace agregadas
- `data/vault/experto-trading-nasdaq.md` — contexto USTEC.F
- `.obsidian-memory/features/oracle-deploy.md` — NUEVO: guía despliegue

**Próximos pasos:**
- Usuario debe crear cuenta Oracle Cloud (cloud.oracle.com → Start for free)
- Elegir Home Region: US East (Ashburn)
- Crear VM: Shape=VM.Standard.A1.Flex, 4 OCPUs, 24 GB RAM, Ubuntu 22.04, 200 GB disco
- Abrir puertos 80, 443, 2785 en Security Lists
- Compartir IP pública + clave SSH privada para que Claude complete el despliegue
- Ver guía completa: `.obsidian-memory/features/oracle-deploy.md`

---

## 2026-06-16 — Fix ai-bot: grupo correcto en ALLOWED_CHATS + split de mensajes largos

**Qué se hizo:**
- Diagnóstico: bot filtraba todos los mensajes porque ALLOWED_CHATS tenía el ID equivocado (`120363409697815102@g.us` vs el real `120363409697815102@g.us`)
- Fix `.env`: corregido ALLOWED_CHATS y DAILY_REPORT_CHATS al ID activo
- Fix `openwa.ts`: sendText ahora divide mensajes > 4096 chars (límite WhatsApp) en chunks
- Fix `server.ts`: error handler para BadRequestError (evita stack traces ruidosos) + fallback message cuando Gemini falla
- Fix `agent.ts`: reduce maxOutputTokens de 1200 a 700 para informe NASDAQ (evita exceder límite)
- QA verificado: informe NASDAQ enviado exitosamente al grupo (`sent: ["120363409697815102@g.us"]`)

**Archivos modificados:**
- `ai-bot/.env`
- `ai-bot/src/openwa.ts`
- `ai-bot/src/server.ts`
- `ai-bot/src/agent.ts`

**Pendiente:**
- Probar mensajes normales desde el segundo número en el grupo de prueba (verificar flujo completo: WhatsApp → webhook → RAG → Gemini → reply)
- Agregar grupos de producción a ALLOWED_CHATS cuando listo para producción: `120363221889701455@g.us`, `120363039903161255@g.us`, `120363406971946127@g.us`
- Commitear los cambios pendientes del repo

## 2026-06-16 — Setup inicial de Obsidian + MCP memory

**Qué se hizo:**
- Instalado Obsidian via Homebrew
- Creado vault `.obsidian-memory/` con estructura de carpetas
- Configurado MCP `seekstone` en `~/.claude/settings.json` para acceso al vault desde Claude Code
- Creado `CLAUDE.md` de proyecto con instrucciones de memoria para futuras sesiones
- Poblado `_PROJECT_STATUS.md` con estado actual del proyecto (v0.1.6)
- Creado notas de features: dashboard, sdk, ai-bot

**Archivos modificados:**
- `~/.claude/settings.json` (agregado `mcpServers.obsidian-openwa`)
- `.claude/CLAUDE.md` (nuevo)
- `.obsidian-memory/` (nuevo vault completo)

**Estado del repo (sin commitear):**
- `dashboard/Dockerfile` — modificado
- `ai-bot/` — carpeta nueva con companion de RAG
- `docker-compose.override.yml` — nuevo
- `CAPABILITIES.md` — auto-generado (105 endpoints, 16 módulos)

**Próximos pasos:**
- Revisar qué cambios hay en `dashboard/Dockerfile` y `ai-bot/`
- Decidir si commitear los archivos pendientes
- Configurar y probar el ai-bot con el vault de Obsidian
