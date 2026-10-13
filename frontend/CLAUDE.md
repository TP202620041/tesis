# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

PWA de **ViaSegura**. El `CLAUDE.md` de la raíz del monorepo ya cubre el stack, los comandos y la arquitectura general del frontend; aquí va solo lo específico de trabajar dentro de `frontend/`. Código, comentarios y textos de UI en español. Las decisiones de diseño (con su justificación ante el jurado) están en `README.md`: revisarlo antes de "corregir" algo que parezca raro.

## Capas (obligatorio — ver `../ARCHITECTURE.md` §5)

Cada feature: `components/` (presentación) → `hooks/` (aplicación) → `model/` (dominio: tipos y reglas puras) ← `api.ts` (infraestructura: único que usa el cliente HTTP).

- `app/**` solo compone: sin `useEffect` de carga de datos, sin importar `api.ts` ni `@/lib/api/*`. La carga va en un hook de la feature sobre `useCarga` (`src/lib/hooks/`).
- Dentro de una feature se importa en relativo; de **otra** feature solo su `model/`. Lo que usan dos features va a `lib/`.
- Los tipos generados (`@/lib/api/generated`) solo se importan en `model/`, `api.ts` o `lib/types`.
- `eslint.capas.mjs` lo verifica en `npm run lint` (hoy en `warn`; pasa a `error` en la tarea FE-09). Un aviso de capas **nuevo** no se acepta: la cantidad solo puede bajar. Única excepción: el aviso que aparece porque un archivo que ningún bloque medía entra en uno (al moverlo a `components/`, `hooks/`, `model/` o `api.ts`), siempre que el PR lo liste (`../ARCHITECTURE.md` §5.4). Un aviso por un import nuevo nunca se acepta. Plan: `../project-context/decisions/plan-migracion-capas.md`.

## Entorno

- Casi todo flujo necesita el backend corriendo en `:8080` (ver `../backend/CLAUDE.md`). La URL sale de `NEXT_PUBLIC_API_BASE_URL` en `.env.local` (copiar de `.env.local.example`).
- El backend solo acepta por CORS el origen `http://localhost:3000` (`app.cors.allowed-origins`). Otro puerto de frontend → el preflight falla.
- `next.config.ts` arma la CSP con `NEXT_PUBLIC_API_BASE_URL` en `connect-src` y los hosts de tiles de OSM en `img-src` (hosts concretos, nunca `*`). Cambiar el origen del API o agregar un origen externo exige tocar la CSP; si no, el navegador bloquea en silencio (el mapa queda en blanco).

## Tests

- `npm test` corre Vitest con reporter JSON (`.vitest-resultado.json`) y después `scripts/verificar-tests.mjs`, que falla si algún `src/**/*.test.ts(x)` en disco no aparece en el informe. Existe porque Vitest en este Windows ha terminado "verde" con archivos de menos. Para citar resultados usar `npm test`, no `test:rapido` (que no tiene la guarda).
- Los tests fijan el formato `es-PE` (punto decimal, coma de miles: `1,234.56`). No "corregirlo" a `es-ES`.

## Convenciones que cruzan archivos

- **401 centralizado**: `apiFetch` (`src/lib/api/client.ts`) borra el token y hace navegación dura a `/login?redirect=…` ante cualquier 401. Las pantallas no manejan el 401; el resto de errores llega como `ApiError`/`NetworkError` (`src/lib/api/errors.ts`), y `NetworkError` significa fallo de red o CORS, nunca un status HTTP.
- **Tipos del API**: `npm run api:sync` = `api:spec` (curl a `/v3/api-docs` → `src/lib/api/openapi.json`) + `api:types` (regenera `generated/schema.ts`). `api:types` funciona sin backend, contra el spec ya guardado. Tras regenerar, ajustar a mano `src/lib/types/domain.ts` (nulabilidad y uniones de enums).
- **`null` en métricas**: "Sin datos" ≠ "0 %", y al ordenar los `null` van siempre al final en ambas direcciones (igual que el `NULLS LAST` del backend). La barra de desempeño usa un solo color a propósito: la UI no inventa umbrales de "bueno/malo".
- **Transiciones duplicadas**: `features/gestion/model/transiciones.ts` replica la máquina de estados del backend solo para no ofrecer opciones que darán 409. La UI municipal nunca ofrece `CANCELADO` (es la retirada del ciudadano, US-08); la vía municipal es `RECHAZADO` con comentario.
- **Consultas del mapa**: se escucha `moveend`/`zoomend` (nunca `move`/`zoom`), con debounce de 400 ms vía `setTimeout` en `useEffect` y el umbral `requiereNuevaConsulta` (~55 m). Mantener ambos al tocar el mapa público.
- **Offline**: la cola de sincronización del Service Worker (US-06) no está implementada. Sin conexión, el formulario de reporte avisa y conserva su `Idempotency-Key`, para que el reintento manual no duplique el reporte. No regenerar la clave en un reintento.
