# Dashboard — OpenWA

## Descripción

Frontend React + Vite que corre en el puerto `:2886`. Interfaz para gestionar sesiones, enviar mensajes, ver webhooks y configurar el sistema.

## Stack

- React + Vite
- react-i18next (i18n)
- lucide-react (iconos)
- @bull-board (UI para colas Bull)
- TypeScript

## Puerto

`:2886`

## Docker

`dashboard/Dockerfile` — actualmente modificado sin commitear.

## Dependencias recientes actualizadas

- `lucide-react` 0.575.0 → 1.16.0
- `@bull-board` 6.x → 7.1.5
- `react-i18next` 14.1.3 → 17.0.8
- `vite` 7.3.1 → 8.0.13

## Notas

- El dashboard se comunica con el backend en `:2785`
- Usa `API_MASTER_KEY` para autenticación
