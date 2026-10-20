# Propuesta: dónde vive la coordinación del cierre de sesión

- **Estado:** abierta <!-- abierta | aceptada | rechazada -->
- **Fecha:** 2026-10-20
- **Origen:** agente de `frontend/`, tarea US-06 (cola offline), segunda revisión del coordinador
- **Decide:** el usuario. Si se acepta, la sesión de raíz actualiza ARCHITECTURE.md (§5.3) o el plan.

## Contexto

US-06 necesita preguntar, al cerrar sesión con reportes propios todavía en la cola offline, si se conservan o se descartan (dispositivo compartido). Cerrar sesión es de `auth` (`features/auth/hooks/useCerrarSesion.ts`), pero la cola es de `reportes`, y una feature no puede importar los hooks ni la API de otra (`eslint.capas.mjs`, `otraFeature`).

Se resolvió con un registro de "pasos previos al cierre" sin dependencias de features: `frontend/src/lib/hooks/antesDeCerrarSesion.ts` (`registrarAntesDeCerrarSesion`, `hayPasosAntesDeCerrarSesion`, `antesDeCerrarSesion` con un tope de espera). `reportes` registra su pregunta (`useConfirmacionAlCerrarSesion`), `app/SincronizadorDeReportes.tsx` la compone y `useCerrarSesion` espera los pasos antes de borrar el token. No genera avisos de capas ni toca la regla del token (no importa `@/lib/auth/**`).

`ARCHITECTURE.md` §5.3 dice que `src/lib/hooks/` contiene `useCarga`, "el único lugar con el patrón de carga y cancelación". El nuevo módulo no es un hook ni trata de carga, así que la tabla ya no lo describe.

Habrá más pasos de este tipo: la baja de la suscripción push (US-21, NC-07) también ocurre al cerrar sesión. Según la nota del coordinador, esa irá **dentro** de `cerrar` (antes de `cerrarSesion()`), no como guarda, porque no pregunta nada al usuario. La coordinación de cierre seguirá siendo para pasos que dependen de otra feature.

## Problema

Hay que decidir si la coordinación del cierre de sesión se queda en `lib/hooks/` (ampliando lo que §5.3 dice de esa carpeta) o pasa a una carpeta propia.

## Opciones

| Opción | Qué implica | Costo | Riesgo |
|---|---|---|---|
| **A. Quedarse en `lib/hooks/`** | §5.3 pasa a decir: "`lib/hooks/`: `useCarga` y la coordinación de cierre de sesión (`antesDeCerrarSesion`)". | Una línea en ARCHITECTURE.md. Nada de código. | `lib/hooks/` deja de ser "solo el patrón de carga" y empieza a juntar cosas de aplicación que no son hooks. |
| **B. Carpeta nueva `src/lib/sesion/` (recomendada)** | Mover `antesDeCerrarSesion.ts` (+ test) a `src/lib/sesion/`. §5.3 gana una fila: "`src/lib/sesion/` · Aplicación · coordinación del ciclo de la sesión entre features (pasos previos al cierre)". `eslint.capas.mjs` no cambia: el bloque `compartidos-lib` ya cubre `src/lib/**`. | Un `git mv` y dos imports (`useCerrarSesion`, `useConfirmacionAlCerrarSesion`), más la fila en ARCHITECTURE.md. | Que la carpeta se confunda con `lib/auth/`. Se evita con la regla explícita: `lib/sesion/` nunca toca el token, que sigue solo en `lib/auth/token-storage.ts`. |
| **C. Contexto de React en `app/`** | Un proveedor en `app/` que `useCerrarSesion` lee por contexto. | Más código. Además, el contexto tendría que definirse en un módulo que `auth` pueda importar, así que el problema de ubicación vuelve. | Más indirección sin ganar nada. |

## Recomendación

**B, `src/lib/sesion/`.** Deja `lib/hooks/` con su significado (el patrón de carga) y da un lugar con nombre propio a lo que crecerá con US-21 y NC-07: lo que pasa entre features cuando una sesión empieza o termina. Separarlo de `lib/auth/` mantiene intacta la regla de que el JWT solo se toca en `token-storage`. Si se prefiere no crear carpetas en esta etapa, **A** es aceptable y no tiene costo.

## Qué queda bloqueado mientras no se decida

Nada. El módulo funciona en `lib/hooks/` (US-06 está implementada y probada). Si se elige B, se mueve en una tarea corta; el comentario de cabecera del archivo apunta a esta propuesta.
