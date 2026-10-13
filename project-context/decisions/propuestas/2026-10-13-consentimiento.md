# Propuesta: modelo de CONSENTIMIENTO (NC-07)

- **Estado:** abierta <!-- abierta | aceptada | rechazada -->
- **Fecha:** 2026-10-13
- **Origen:** sesión coordinadora (raíz), planificación del Sprint 2 (NC-07)
- **Decide:** el usuario. Si se acepta, la sesión de raíz actualiza ARCHITECTURE.md (§8) y el plan.

## Contexto

`ARCHITECTURE.md` §4.3 asigna CONSENTIMIENTO al módulo `auth` («cuentas, credenciales, perfil y consentimiento»), y §8 lo lista como «migración nueva» en `auth.domain`. No da campos: el detalle está en el OB2, que no está en el repo.

**Qué hay hoy:**
- El registro (US-01) no pide aceptar nada. `auth/dto/RegistroRequest.java` tiene solo `email`, `password`, `nombre` y `apellido`; `FormularioRegistro.tsx` no tiene casilla de aceptación.
- La plataforma trata datos personales: correo, nombre, foto de perfil, la **ubicación GPS** de cada reporte y su foto (pública). Además envía notificaciones por correo y, desde el S3, push (US-21; SUSCRIPCION_PUSH se implementa en el S2).
- En Perú rige la Ley N.° 29733 de Protección de Datos Personales. Pide un consentimiento previo, informado, expreso e inequívoco para cada finalidad, y que se pueda revocar. Una tesis que lo sustenta ante el jurado necesita poder mostrar **qué** aceptó cada usuario, **cuándo** y **qué versión** del texto.

## Problema

Hay que decidir qué datos registra CONSENTIMIENTO, si el registro lo exige, y cómo se versiona y revoca, sin que bloquee a los usuarios que ya existen.

## Opciones

| Opción | Qué implica | Costo | Riesgo |
|---|---|---|---|
| **A. Registro por finalidad y versión (recomendada)** | Tabla `consentimiento` (`id`, `usuario_id` FK, `finalidad` enum: `TERMINOS_Y_PRIVACIDAD`, `NOTIFICACIONES_PUSH`, `NOTIFICACIONES_CORREO`, `version_documento` varchar, `aceptado_en` timestamptz, `revocado_en` timestamptz nullable). Es un historial: cada aceptación es una fila, y revocar llena `revocado_en`. El registro exige `TERMINOS_Y_PRIVACIDAD` vigente: `RegistroRequest` gana `aceptaTerminos: true` y `versionTerminos`. Endpoints: `GET /api/auth/me/consentimientos`, `POST` (aceptar) y `DELETE /{finalidad}` (revocar). Suscribirse a push (US-21) exige `NOTIFICACIONES_PUSH` vigente. | Migración nueva, entidad, servicio, 3 endpoints e IT. Cambio de contrato en el registro: handoff y casilla en el frontend. Página estática con el texto versionado (`/privacidad`). | Los usuarios existentes no tienen fila. Se resuelve pidiendo la aceptación en el próximo inicio de sesión, con una pantalla que bloquea hasta aceptar; no se migra a "aceptado" sin que lo hayan hecho. |
| **B. Solo términos al registrarse** | Dos columnas en `usuario` (`terminos_version`, `terminos_aceptados_en`). Las notificaciones siguen con `preferencia_notificacion`. | Mínimo: una migración y un campo en el registro. | No distingue finalidades ni deja historial de revocación. Se queda corto para la ley (consentimiento por finalidad) y para el OB2, que lo modela como entidad aparte. |
| **C. Esperar el OB2** | No se implementa hasta tener los campos del OB2 en el repo. | Ninguno ahora. | US-21 (S3) se apoyaría en `preferencia_notificacion` sin consentimiento explícito para push. Puede quedar inconsistente con el OB2. |

## Recomendación

**Opción A.** Separa finalidades como pide la ley, deja la evidencia que el jurado puede pedir (versión aceptada y fecha) y encaja con el resto:
- `preferencia_notificacion` sigue siendo una **preferencia** (cómo quiere recibir los avisos);
- el consentimiento es el **permiso** (si autoriza ese tratamiento).

Si el OB2 define otros campos, se ajusta el enum de finalidades sin cambiar la forma.

**Si se acepta:** se implementa en el **S3**, junto con US-21. El registro con `aceptaTerminos` necesita un handoff (backend primero) y la pantalla de aceptación para usuarios existentes. Sale de la tarea NC-07 como «NC-07b».

## Qué queda bloqueado mientras no se decida

- US-21 (S3): suscribirse a push sin un consentimiento explícito.
- El texto de términos y privacidad y su versión (`/privacidad`): lo redacta el usuario o se toma del OB2.
- Nada del S2: SUSCRIPCION_PUSH (B3) se implementa sin depender de esta decisión.
