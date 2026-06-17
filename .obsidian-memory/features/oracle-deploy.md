# Despliegue en Oracle Cloud Free Tier

## Estado actual
- [ ] Cuenta Oracle creada
- [ ] VM creada y en estado "Running"
- [ ] Puertos abiertos (80, 443, 2785)
- [ ] IP pública + clave SSH entregadas a Claude
- [ ] Docker instalado en la VM
- [ ] Proyecto desplegado
- [ ] QR de WhatsApp escaneado en producción

---

## Por qué Oracle Cloud

whatsapp-web.js + Puppeteer requiere ~500 MB RAM solo para Chromium. La mayoría de
tiers gratuitos (Render, Fly.io, Railway) tienen 256–512 MB — insuficiente. Oracle
Always Free ofrece 4 OCPUs + 24 GB RAM permanentemente gratis.

| Recurso | Límite Always Free |
|---|---|
| VM Ampere A1 (4 CPU, 24 GB RAM) | ✅ Permanente |
| 200 GB almacenamiento en bloque | ✅ Permanente |
| IP pública | ✅ Permanente |
| Transferencia (10 TB/mes) | ✅ Permanente |

**Tarjeta de crédito:** Oracle la pide para verificar identidad. Hace un cargo temporal
de ~$1 USD que se devuelve en 3-5 días. No cobra automáticamente si excedes el free
tier — simplemente para los servicios. Solo cobran si el usuario manualmente hace
"Upgrade to Pay As You Go".

---

## Paso 1 — Crear cuenta

URL: `https://cloud.oracle.com` → "Start for free"

- Account name: `pablo-openwa` (o cualquier nombre)
- **Home Region: US East (Ashburn)** — mejor disponibilidad de instancias ARM
- Verificar email, teléfono SMS, tarjeta y dirección

---

## Paso 2 — Crear la VM

**Compute → Instances → Create Instance**

| Campo | Valor |
|---|---|
| Nombre | `openwa-server` |
| Shape series | **Ampere** (no Intel, no AMD) |
| Shape | `VM.Standard.A1.Flex` |
| OCPUs | **4** |
| RAM | **24 GB** |
| Image | **Canonical Ubuntu 22.04** |
| Boot volume | **200 GB** |
| SSH keys | "Generate a key pair for me" → descargar ambos archivos |

⚠️ Guardar la clave privada (`.key`) — no se puede recuperar después.

---

## Paso 3 — Abrir puertos

**Networking → Virtual Cloud Networks → tu VCN → Security Lists → Default Security List → Add Ingress Rules**

| Source CIDR | Protocol | Puerto | Uso |
|---|---|---|---|
| `0.0.0.0/0` | TCP | `80` | HTTP |
| `0.0.0.0/0` | TCP | `443` | HTTPS |
| `0.0.0.0/0` | TCP | `2785` | OpenWA API |

---

## Paso 4 — Entregar a Claude para continuar

Cuando la VM esté en estado **"Running"**, compartir:
1. IP pública (Compute → Instances → tu instancia)
2. Contenido del archivo `.key` (clave SSH privada)

Claude hace el resto: Docker, clonar repo, `.env`, levantar servicios, escanear QR.

---

## Próximos pasos (cuando se retome)

Una vez que Claude tenga IP + clave SSH:

1. Conectar por SSH y preparar el servidor
   ```bash
   ssh -i key.pem ubuntu@<IP>
   sudo apt update && sudo apt upgrade -y
   sudo apt install -y docker.io docker-compose-plugin git
   sudo usermod -aG docker ubuntu
   ```

2. Clonar el repositorio
   ```bash
   git clone https://github.com/<usuario>/OpenWA.git
   cd OpenWA
   ```

3. Configurar variables de entorno
   - Copiar `ai-bot/.env` con las API keys de producción
   - Ajustar `ALLOWED_CHATS` con los grupos de producción

4. Levantar servicios
   ```bash
   docker compose -f docker-compose.dev.yml -f docker-compose.override.yml up -d
   ```

5. Escanear QR de WhatsApp
   ```bash
   docker logs openwa -f   # aparece el QR en terminal
   ```

6. (Opcional) Configurar dominio + HTTPS con Caddy o Nginx + Let's Encrypt

---

## Stack desplegado

- **Backend:** NestJS en `:2785`
- **Dashboard:** React + Vite en `:2886`
- **AI Bot:** Express en `:3000` (interno)
- **Motor:** whatsapp-web.js + Puppeteer
- **DB:** SQLite (dev) → considerar PostgreSQL para producción
- **LLM:** Gemini (primario) → OpenRouter → HuggingFace (fallback)
- **Precio NASDAQ:** Yahoo Finance NQ=F (sin API key, caché 15 min)
