---
name: propuesta
description: Registra una duda o propuesta de diseño para que la decida el usuario, en lugar de resolverla creando estructura nueva. Usar cuando una tarea no encaja en ARCHITECTURE.md o exige cambiar una regla.
argument-hint: "[tema corto]"
---

Una decisión de diseño no se toma dentro de una tarea. Registra la propuesta y detente.

1. Crea `project-context/decisions/propuestas/AAAA-MM-DD-<tema>.md` a partir de `project-context/decisions/propuestas/PLANTILLA.md`. Tema: $ARGUMENTS
2. Completa: contexto (qué tarea la originó y qué encontraste, con rutas de archivo), el problema en una frase, 2 o 3 opciones con su costo y riesgo, tu recomendación y qué queda bloqueado mientras no se decida.
3. Deja el estado en `abierta`. No cambies `ARCHITECTURE.md`, el plan ni las guardas.
4. Dile al usuario en dos líneas qué tiene que decidir y dónde está la propuesta. Si la tarea puede seguir en otra parte sin esa decisión, dilo; si no, detente.
