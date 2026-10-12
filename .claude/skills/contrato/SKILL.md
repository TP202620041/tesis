---
name: contrato
description: Protocolo de cambio de contrato del API entre el agente de backend y el de frontend mediante un handoff escrito. Usar cuando cambie un DTO, un endpoint o un enum expuesto.
argument-hint: "[tema corto del cambio]"
---

Aplica el protocolo de cambio de contrato de `WORKFLOW.md` (sección 6). Primero identifica en qué carpeta está esta sesión.

## Si estás en `backend/` (publicar el cambio)
1. El cambio de DTO o endpoint ya debe estar implementado, con su IT, y verificado con `/verificar`.
2. Crea `project-context/handoffs/AAAA-MM-DD-<tema>.md` a partir de `project-context/handoffs/PLANTILLA.md`, con: endpoints afectados, campos nuevos/cambiados/eliminados con tipo y nulabilidad, enums con sus valores, ejemplo JSON de respuesta, reglas de visibilidad (quién ve qué campo), y la rama/commit donde está.
3. Incluye el handoff en el mismo PR. Estado del handoff: `pendiente`.
4. No toques `frontend/`.

## Si estás en `frontend/` (consumir el cambio)
1. Lista los handoffs con estado `pendiente` en `project-context/handoffs/`. Si se pasó un tema ($ARGUMENTS), toma ese.
2. Verifica que el cambio del backend ya está en `main` (`git log main --oneline`). Si no, detente: nunca se consume un contrato sin publicar.
3. Con el backend corriendo: `npm run api:sync`. Ajusta los tipos en `features/<f>/model/` y `lib/types/` según el handoff (nulabilidad y uniones de enums).
4. Implementa el consumo respetando las capas; corre `/verificar`.
5. En el handoff, cambia el estado a `atendido` con la fecha y la rama del frontend.
