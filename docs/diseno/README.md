# Diseño de la interfaz

Identidad visual y rediseño de la PWA de Ciudad Viva.

- **Propuesta completa**: [`2026-10-21-propuesta.md`](2026-10-21-propuesta.md). Contiene:
  - la investigación de plataformas cívicas y de sistemas de diseño públicos;
  - la crítica de la PWA v0.6.0;
  - las tres direcciones y el plan de implementación.
- **Canvas navegable**: Artifact «Rediseño Ciudad Viva». Es privado del dueño del proyecto, que lo comparte si hace falta.
- **Prototipo renderizable**: [`prototipo/`](prototipo/). Son los artboards finales, que se abren en un navegador gracias a `prototipo/support.js`, una vista previa local del formato (no es el runtime del canvas).
- **Marca**: [`marca/`](marca/), con los logos e iconos PWA en SVG de las tres direcciones.
- **Contraste**: [`contraste/contraste.mjs`](contraste/contraste.mjs) calcula los pares de color de la PWA actual (`actual.json`) y de la propuesta (`propuesta.json`; 0 fallos AA).

## Decisión (2026-10-21)

El usuario eligió la **dirección A · «Cívica»**:
- **Paleta**: tinta azul marino `#1F3350` y blanco.
- **Tipografía**: Public Sans, autoalojada con `next/font`.
- **Foco**: amarillo `#FFD43B`.
- **Logo**: un pin cruzado por una calle de línea discontinua amarilla.
- **Temas**: modo oscuro y alto contraste (US-23).

Con esta dirección se **deja el celeste**, por su carga partidaria en Lima (propuesta §2.3).

Los puntos de detalle de la propuesta (§8) se adoptan tal como los recomienda el prototipo. Se pueden revertir si el usuario lo pide al revisar la implementación:

| Punto | Qué se adopta |
|---|---|
| Estados | Cada estado lleva color, icono Lucide y nombre. Recibido pasa a azul (cambia una leyenda que ya aparece en capturas de la tesis: actualizarlas al cerrar el rediseño). |
| Severidad | Se muestra con barras en tinta, sin rojo. |
| `/reportar` | Va en pasos. |
| Bandeja municipal | Abre en «Por atender», con panel lateral. |
| Navegación del ciudadano | Inferior, de 5 ítems; «Cerrar sesión» va en el menú de cuenta. |
| Temas (US-23) | Alto contraste como tercer tema, con selector de apariencia en el perfil. |
| Mapa | Teselas de OSM desaturadas con filtro CSS, sin orígenes nuevos. |

**Pendiente de aprobación explícita** (no se adopta por defecto, porque una migración aplicada no se revierte deshaciendo el código): la migración nueva del backend que corrige las tildes de las categorías estándar («Vereda danada», «Semaforo averiado», «Senalizacion faltante»), sin editar V3. Es una tarea aparte del backend.

Las decisiones del README del frontend no cambian:
- la barra de desempeño y la comparación usan un solo color;
- la capa de calor usa una rampa violeta y no depende solo del color;
- `null` se muestra como «Sin datos».
