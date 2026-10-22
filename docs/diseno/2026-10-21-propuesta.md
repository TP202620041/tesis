# Ciudad Viva — propuesta de rediseño de la PWA

> Entregable del subagente `disenador-ui` (21/10/2026). Versionado en `docs/diseno/` por la sesión coordinadora.
> Archivos de esta carpeta: `marca/` (logos e iconos SVG), `prototipo/` (artboards finales renderizables en un navegador con `dc-shim.js`), `contraste/` (verificación de contraste). Las capturas de las iteraciones quedaron fuera del repo. El canvas navegable está en el Artifact «Rediseño Ciudad Viva».

## 1. En una línea

Tres direcciones visuales sobre una **capa semántica común** (estados, severidad, calor, índice). Recomiendo la
**A «Cívica»**: interfaz neutra en tinta y blanco, Public Sans, foco amarillo y un solo color con significado por
estado. La decisión de fondo que hay detrás es dejar el celeste actual, que hoy está en disputa partidaria en Lima
(§2.3), y pasar de pantallas sueltas a un sistema con navegación por rol.

## 2. Investigación

### 2.1 Plataformas cívicas de reporte

| Referente | Patrón concreto | Qué tomamos |
|---|---|---|
| FixMyStreet (mySociety) — [decisiones de diseño móvil](https://www.mysociety.org/2014/06/09/fixmystreet-mobile-design-decisions/) | Pin **fijo al centro** y el usuario mueve el mapa: «much easier and more accurate» que tocar el mapa. El mapa queda de fondo en todos los pasos. Las categorías dependen de la ubicación, así que primero se ubica. | Paso 1 de `/reportar`: pin fijo + «Usar mi ubicación». La ubicación va antes del tipo de daño (ya lo exige US-29: categorías propias del distrito). |
| FixMyStreet Pro — [experiencia del ciudadano](https://fixmystreet.org/pro-manual/citizens-experience/) | Flujo ubicación → posibles duplicados → categoría → detalles → revisión → envío. Borradores offline que **no** se envían solos. Respuestas de la autoridad visibles en la página del reporte. | Paso «Revisa antes de enviar». Nuestra cola sí reenvía sola (US-06) y la pantalla lo dice. El aviso de adhesión (US-09) se anticipa en la revisión. |
| FixMyStreet — [walkthrough](https://aws.try.ndx.digital.cabinet-office.gov.uk/walkthroughs/fixmystreet/step-3) | Pines con estado (sin arreglar / arreglado / cerrado) y búsqueda de categorías. | Marcador por estado con **icono**, no solo color. |
| SeeClickFix — [estados públicos](https://theraleighcommons.org/raleighpublicrecord/news/2014/10/10/a-social-network-for-concerned-citizens/), [cierre ≠ arreglo](https://newcastlewa.gov/?p=1396) | Solo «open / acknowledged / closed», y «closed» a veces significa «derivado». Hubo quejas por cierres sin obra. | Nuestros cinco estados son más honestos; la línea de tiempo muestra el comentario municipal de cada cambio y «Rechazado» siempre con motivo. |
| NYC311 — [guía de la ciudad](https://cbbronx.cityofnewyork.us/cb8/wp-content/uploads/sites/3/2020/10/CB8-311-Fyler.pdf), [App Store](https://apps.apple.com/us/app/-/id324897619) | Categoría + ubicación + fotos + número para seguimiento; «latest status of your requests all in one place». | «Mis reportes» como lugar único de seguimiento, con estado visible en cada tarjeta. |
| BOS:311 Boston — [caso de la marca](https://boston.gov/node/24551), [City Worker](https://www.boston.gov/streets-and-sanitation/city-worker-app) | Una sola marca para todos los canales; el trabajador ve sus casos en mapa y lista. | Bandeja en tabla densa + panel de detalle para el funcionario de escritorio. |
| Connect Lima (Municipalidad de Lima) — [App Store](https://apps.apple.com/us/app/connect-lima/id1459687554) | Reportes no urgentes (baches, grafitis), acuse de recibo, seguimiento y aviso al cerrar. Vías metropolitanas (MML) frente a vías locales (distritos). | Referente local directo. La competencia vial explica el motivo de rechazo del seed «No corresponde a vía de competencia distrital». |
| Decidim — [rediseño 2021–2023](https://meta.decidim.org/processes/RedesignDecidim) | Rediseño participativo que empezó por la navegación y las tarjetas antes que por pantallas sueltas. | Mismo orden en el plan: tokens → componentes → layout/navegación → pantallas. |
| «Mejora tu Ciudad» | No encontré una app chilena con ese nombre; sí una de El Puerto de Santa María ([Diario Bahía de Cádiz](https://diariobahiadecadiz.com/el-puerto/la-app-mejora-el-puerto-recoge-y-gestiona-las-incidencias-que-los-vecinos-encuentren-en-la-via-publica)) y «Barrios en Acción» en Chile ([LATINNO](https://www.latinno.net/en/case/4107/)). | Sin patrón nuevo. |

### 2.2 Sistemas de diseño públicos

- **GOV.UK — [páginas de pregunta](https://design-system.service.gov.uk/patterns/question-pages/)**: una cosa por página, enlace «Atrás», botón «Continuar» a la izquierda y la pregunta como `<legend>`/`<label>` de encabezado. → `/reportar` en cuatro pasos.
- **GOV.UK — [etiqueta de estado](https://design-system.service.gov.uk/components/tag/)**: los tags solo indican estado, no son enlaces ni botones; pocos colores («the more you add, the harder it is for users to remember them»); en minúscula inicial; «do not use colour alone». → chips de estado con icono + nombre, nunca clicables.
- **USWDS — [indicador de pasos](https://designsystem.digital.gov/components/step-indicator/)**: para tres pasos o más, «Paso 3 de 5» junto al encabezado y `aria-current` en el paso activo. **[Tokens de color](https://designsystem.digital.gov/design-tokens/color/overview/)**: grados 0–100 y «magic number» de contraste (50+ = AA). → escala de tokens con contraste calculado par por par.
- **gob.pe**: no publica una guía de estilo abierta que haya podido encontrar. Su CSS en producción usa Roboto, azul `#0056ac`, verde `#00823b` y amarillo `#ffd147` (los descargué de `www.gob.pe/assets/application-*.css`). → **No lo imitamos**: Ciudad Viva no es un canal del Estado y no debe parecerlo.

### 2.3 Contexto local que pesa en el color

- **La «ola celeste»**: en 2025 hubo polémica en Miraflores por obras públicas pintadas en tonos asociados a Renovación Popular ([24 Horas, abril 2025](https://panamericana.pe/24horas/locales/441539-ola-celeste-llega-miraflores-crece-polemica-colores-partidarios-obras-publicas); la municipalidad dice que es «verde turquesa menta», [América TV](https://www.americatv.com.pe/noticias/actualidad/miraflores-bolardos-generan-controversia-color-n505685)). El partido adoptó el celeste en 2020 ([El Búho](https://elbuho.pe/?p=177974)) y presenta fórmula municipal para las elecciones de octubre ([RPP](https://rpp.pe/peru/lima/plan-de-gobierno-lima-2027-de-renovacion-popular-propuestas-de-luis-rubio-y-rafael-lopez-aliaga-noticia-1694055)).
- **La PWA hoy es celeste**: `sky-600`/`sky-700` y `theme_color #0369a1`. En el seed, Miraflores encabeza el índice. Un índice que **califica a las municipalidades** no debería llevar un color en disputa partidaria, menos en año electoral. Las tres direcciones lo evitan, y también el rojo y blanco institucional.
- **Nombre**: «Ciudad Viva» es también una ONG chilena de urbanismo ciudadano ([EU-LAC](https://eulacfoundation.org/es/print/pdf/node/2845), ciudadviva.cl). Es solo informativo, porque la marca ya está decidida. Por eso el logo es propio y no se parece al suyo.

## 3. Crítica de la PWA actual (v0.6.0, capturada en modo headed)

Capturas (no versionadas, en el entorno de trabajo del diseñador) en `capturas/actual/` (escritorio 1440×900 y móvil 390×844): `portada-*`, `mapa-*` (`mapa-movil-scroll.png`), `desempeno-*`, `reportar-*`, `mis-reportes-*`, `mi-reporte-*`, `bandeja-*`, `bandeja-detalle-*`, `dashboard-*`, `login-escritorio.png`.

**Sistema**
- `globals.css` es el de create-next-app. El body usa Arial aunque `layout.tsx` carga Geist y Geist Mono sin usarlas. Hay 1 111 clases `sky-*`/`slate-*` repartidas en 63 archivos `.tsx` y no hay tokens semánticos.
- No hay logo: el favicon es el de Next. **Los íconos del manifest daban 404 en v0.6.0** (`/icons/icon-192.png` y `/icon-512.png` no existían en `public/`; después DEP-06, #85, agregó iconos provisionales), así que la PWA no ofrece un ícono instalable propio.

**Contraste medido** (`contraste/contraste.mjs contraste/actual.json`; WCAG 2.1):

| Par | Ratio | Exige |
|---|---|---|
| Chip «Recibido», blanco sobre `#ea580c` | 3.56 | 4.5 ✗ |
| Chip «En proceso», blanco sobre `#ca8a04` | 2.94 | 4.5 ✗ |
| Chip «Resuelto», blanco sobre `#16a34a` | 3.30 | 4.5 ✗ |
| Botón primario, blanco sobre `sky-600` | 4.10 | 4.5 ✗ |
| Borde de campo `slate-300` sobre blanco | 1.48 | 3 ✗ (1.4.11) |
| Marcador «En proceso» / «Resuelto» sobre el tile | 2.56 / 2.87 | 3 ✗ |
| Pendiente vs Recibido vs En proceso (luminosidad entre sí) | 1.36 y 1.21 | — rojo, naranja y ámbar se confunden con deuteranopía y los marcadores no llevan icono |

**Pantallas**
- **Portada** (`portada-*`): un título, un párrafo y dos botones en medio de una pantalla vacía. No explica cómo funciona ni muestra el índice.
- **Mapa móvil** (`mapa-movil.png`, `mapa-movil-scroll.png`): filtros, capas y leyenda ocupan unos 830 px antes del mapa. No hay hoja inferior y el mapa queda debajo del pliegue.
- **Navegación**: cada página arma su propia cabecera. «Cerrar sesión» compite con las acciones principales; en `/reportar` es el único botón de la cabecera. En móvil, `/mis-reportes` y `/bandeja` gastan la primera pantalla en botones. No hay navegación por rol.
- **Reportar** (`reportar-escritorio-completo.png`): un formulario largo en una sola página. El botón «Enviar» aparece deshabilitado en celeste lavado sin decir qué falta.
- **Detalle** (`mi-reporte-escritorio-completo.png`): el seguimiento es una lista de flechas «Pendiente → Recibido» con segundos («12:24:48 a. m.»). El estado no se ve como progreso.
- **Bandeja** (`bandeja-escritorio.png`): tarjetas grandes para un trabajo de escritorio, estado en texto gris pequeño y lo resuelto mezclado con lo pendiente (el orden «Más apoyados» pone primero un reporte resuelto).
- **Dashboard**: tarjetas planas iguales sin jerarquía ni relación con la bandeja.
- **Desempeño móvil** (`desempeno-movil.png`): la tabla se desborda en horizontal y la tasa queda fuera de la vista.
- **Datos visibles**: las categorías estándar salen sin tildes («Vereda danada», «Semaforo averiado», «Senalizacion faltante») porque así las sembró `V3__seed_categorias_estandar.sql`. Se corrige con una migración nueva en el backend; V3 no se edita.

## 4. Capa semántica común (no cambia entre direcciones)

Los estados se distinguen por **color + icono Lucide + nombre**. «En proceso» usa el ámbar de las obras en la vía, con glifo oscuro, y difiere en luminosidad del resto. **El color de marca nunca se usa en un marcador ni en un chip de estado.**

| Estado | Marcador (relleno / glifo) | Chip claro (fondo / texto) | Chip oscuro | Icono |
|---|---|---|---|---|
| Pendiente | `#C8231B` / blanco, 5.66:1 | `#FDE3E1` / `#9B1C14`, 6.71:1 | `#4A1712` / `#FFB4AB`, 8.70:1 | `clock` |
| Recibido | `#2E6BE6` / blanco, 4.81:1 | `#DDE8FC` / `#1A3F8F`, 7.91:1 | `#172A52` / `#B4CCFF`, 8.74:1 | `inbox` |
| En proceso | `#F0A800` / `#1A1A1A`, 8.54:1 | `#FDEFC3` / `#6E4100`, 7.57:1 | `#4A3300` / `#FFD27A`, 8.36:1 | `wrench` |
| Resuelto | `#126B3F` / blanco, 6.56:1 | `#D9F5E3` / `#0B5A33`, 7.18:1 | `#0F3A26` / `#8EE0AF`, 8.12:1 | `check` |
| Rechazado | `#4B5563` / blanco, 7.56:1 | `#E7EAEE` / `#3A4452`, 8.18:1 | `#2C333D` / `#CBD2DB`, 8.36:1 | `x` |
| Cancelado (solo bandeja) | — | blanco con borde `#7D8794` / `#4A5463`, 7.67:1 | — | `minus` |

- **Marcador**: pin de 30×38 dentro de un botón de 44×44, con anillo blanco y contorno oscuro (en «En proceso», contorno tinta de 15:1). El relleno contra el mapa claro da ≥ 4.21:1.
- **Severidad** (la declara el vecino): tres barras crecientes en tinta, siempre con el texto. No se usa rojo, para no competir con el estado ni alarmar.
- **Capa de calor**: se mantiene la rampa violeta del README (US-11), con tamaño creciente y la leyenda «con un mínimo de 4». Ningún estado ni marca usa violeta.
- **Índice**: barra de un solo color, la tinta de la marca (decisión del README). «0 %» lleva pista llena; «Sin datos» lleva pista punteada y texto.

## 5. Direcciones

### A · «Cívica» — recomendada
- **Idea**: servicio público sobrio. Tinta, blanco y una sola señal amarilla, la del foco. La interfaz se calla para que los únicos colores con significado sean los de estado y los datos.
- **Tipografía**: **Public Sans** (OFL; creada para USWDS y derivada de Libre Franklin), con `next/font/google` autoalojada. Cifras tabulares para el índice.
- **Tokens claro**: fondo `#F5F6F8` · superficie `#FFFFFF` · superficie-2 `#EDF0F3` · línea `#D6DBE1` · borde de campo `#7B8594` (3.73:1) · texto `#141B24` (16.0:1) · secundario `#4D5866` (6.69:1) · primario `#1F3350` con texto blanco (12.75:1) · enlace `#1D4F91` (8.14:1) · foco `#FFD43B` con contorno tinta (12.16:1).
- **Tokens oscuro**: fondo `#0F141A` · superficie `#171E26` · superficie-2 `#1F2832` · línea `#2F3B48` · borde de campo `#6B7787` (3.69:1) · texto `#E9EDF2` (14.29:1) · secundario `#A5B0BD` (7.64:1) · primario `#C9D8F0` con texto `#0F141A` (12.83:1) · enlace `#9DBDF0` (8.78:1).
- **Alto contraste (US-23)**: negro sobre blanco (21:1), secundario `#262626` (15.1:1), enlace `#00308F` (11.5:1), bordes de 2 px. Los chips pasan a contorno negro y el estado lo cargan el icono y el nombre.
- **Espaciado y radios**: base 4 px (4/8/12/16/20/24/32/48), radio 8 en controles, 12 en tarjetas, 16 en la hoja inferior. Objetivos ≥ 44 px.
- **Iconografía**: `lucide-react` (ISC, se importa por nombre y se empaqueta). Siete pictogramas de categoría propios, en la misma retícula de 24 px y trazo de 2.
- **Logo e ícono**: pin en tinta cruzado por una calle con línea amarilla discontinua. Archivos en `marca/` (`marca-a.svg`, `marca-a-oscuro.svg`, `icono-pwa-a.svg` y `icono-pwa-a-maskable.svg`, 512 px); hoja de prueba en `capturas/final/marca-hoja.png`. Se lee a 16 px.
- **Mapa**: tiles de OSM desaturados con un filtro CSS (en oscuro, invertidos). Marcadores con icono y hoja inferior.
- **A favor**: confianza, neutralidad política, contraste alto sin esfuerzo, envejece bien y funciona igual para el vecino y el funcionario. **En contra**: es la menos memorable de las tres; el carácter lo ponen el logo y la tipografía de los números.

### B · «Señal»
- **Idea**: el idioma de la vía. Asfalto, amarillo de señal preventiva (los rombos amarillos del MTC) y titulares condensados.
- **Tipografía**: **Barlow** + **Barlow Semi Condensed** (OFL; inspiradas en la señalética vial de California).
- **Tokens claro**: fondo concreto `#F3F2EE` · texto `#17191B` (15.74:1) · secundario `#4A4D50` (7.59:1) · CTA `#FFC20E` con texto asfalto (10.89:1) · barra superior `#1D1F21` con texto claro (14.76:1) · bordes de 2 px `#1D1F21`. **Oscuro**: fondo `#121416` · texto `#F2F1ED` (16.34:1) · secundario `#ABAFB3` (7.59:1) · CTA `#FFC20E` (11.41:1) · borde de campo `#8A8F94` (5.13:1).
- **Forma**: radio 2–4 px, bordes de 2 px, titulares en mayúsculas.
- **Logo**: rombo de señal preventiva con el pin dentro (`marca/marca-b.svg`).
- **A favor**: la más propia del dominio y la más recordable ante el jurado. **En contra**: el CTA amarillo convive con el marcador ámbar de «En proceso» (se ve en `capturas/iter2/mapa-movil-B.png`). Es la más «ruidosa» para el uso diario municipal y puede leerse como señalética oficial.

### C · «Buganvilla»
- **Idea**: cercana y de barrio. El magenta de las buganvillas limeñas, fondos cálidos y formas redondeadas.
- **Tipografía**: **Figtree** (OFL).
- **Tokens claro**: fondo `#FBF7F5` · texto `#2B1720` (15.83:1) · secundario `#6A5560` (6.40:1) · primario `#A1185A` con texto blanco (7.52:1) · suave `#FBE6EF` con `#7A1043` (8.91:1) · borde de campo `#8C7680` (4.18:1). **Oscuro**: fondo `#1B1317` · texto `#F8ECF1` (15.85:1) · secundario `#CDB5C0` (8.79:1) · primario `#F28DB9` (8.06:1) · enlace `#F7A8CA` (9.15:1) · borde de campo `#8E7580` (4.01:1).
- **Forma**: radio 14–24 px, botones píldora.
- **Logo**: tres pines que forman una flor: muchos reportes que llegan al mismo punto (`marca/marca-c.svg`).
- **A favor**: la más amable para vecinos de todas las edades. **En contra**: menos institucional para la gestión municipal. El magenta queda cerca del violeta de la capa de calor y es el más difícil de sostener en tablas densas.

## 6. Prototipo

**Artboards finales** (el canvas (Artifact), con `canvas.json`). Cargan `./support.js` y llevan el estilo en línea, sin red salvo Google Fonts. Las fuentes de Google se usan **solo en el canvas**; la PWA usará `next/font`.

| Archivo | Tamaño | Interactivo | Qué muestra |
|---|---|---|---|
| `Main.dc.html` | 1440×2120 | no | Las tres direcciones lado a lado (paleta claro y oscuro con contraste, tipografía, componentes, logo e ícono PWA) y la capa semántica común (marcadores, severidad, calor, índice, oscuro y alto contraste). |
| `Mapa-movil-B.dc.html` | 390×844 | sí | El mapa en B. |
| `Mapa-movil-C.dc.html` | 390×844 | sí | El mapa en C. |
| `Mapa-movil.dc.html` | 390×844 | sí | Mapa a pantalla completa con hoja inferior (asomada, abierta con «Lista» y «Más filtros», resumen del reporte elegido), filtro de estado, capa de calor con leyenda y navegación inferior del ciudadano. |
| `Reportar-movil.dc.html` | 390×844 | sí | Cuatro pasos (ubicación con pin fijo → tipo de daño → detalles → revisión) con errores de validación y la pantalla de envío. |
| `Mis-reportes-movil.dc.html` | 390×844 | sí (enlaces) | Cola sin señal, aviso de calificaciones pendientes y tarjetas con chip de estado. |
| `Mi-reporte-movil.dc.html` | 390×844 | sí | Detalle con línea de tiempo (estado, comentario municipal y fecha sin segundos), calificación de 1 a 5 y comentarios. |
| `Mapa-movil-oscuro.dc.html` | 390×844 | sí | El mapa en modo oscuro (US-23). |
| `Portada.dc.html` | 1440×1380, página | sí (enlaces) | Hero con acción principal, «Cómo funciona», qué significa cada estado y vista previa del índice. |
| `Bandeja-escritorio.dc.html` | 1440×1100, página | sí | Pestañas por estado con «Por atender» por defecto, filtros, tabla densa, panel con transiciones válidas (comentario obligatorio al rechazar), responsable e historial, y la señal interna de reincidencia. |
| `Desempeno-escritorio.dc.html` | 1440×1600, página | sí | Ranking con barra de un solo color, «0 %» frente a «Sin datos», comparación de 2 a 4 distritos con gráfica y tabla, y el aviso al intentar un quinto. |

**Iteración** (HTML normal con una vista previa local del formato y capturas en modo headed; ni las iteraciones ni las capturas están versionadas):
- **Ronda 1** (`capturas/iter1/`): las etiquetas de los marcadores se encimaban y los logotipos se partían en dos líneas en `Main`. En el mapa, la barra de scroll de los chips era visible, el marcador elegido no se distinguía y el resumen ocupaba 470 px. En la navegación inferior, «Reportar» no estaba alineado. En `/reportar`, los íconos de categoría eran débiles, el título quedaba pegado a la cabecera y «Cambiar» no tenía contexto para el lector de pantalla. Los chips de las listas no llevaban icono. En la bandeja, «Sin asignar» iba en rojo. En desempeño, las filas medían 60 px y la gráfica desaparecía en móvil.
- **Ronda 2** (`capturas/iter2/`): todo lo anterior quedó corregido; se agregaron los estados en oscuro y alto contraste y las variantes B, C y oscuro. Nuevos hallazgos: la leyenda de calor tapaba marcadores, la marca de selección amarilla se confundía con «En proceso», la fila elegida de la bandeja llevaba borde izquierdo de color (un tropo) y los enlaces de la cabecera se partían en móvil.
- **Ronda 3** (`capturas/iter3/` y `capturas/final/`): la leyenda va abajo a la izquierda y se oculta con un reporte elegido. La selección es un anillo tinta. La fila elegida solo cambia de fondo. Los enlaces de la cabecera ya no se parten. A 390 px ninguna página tiene scroll horizontal (`scrollWidth` 375 con la barra).

## 7. Plan de implementación en la PWA (dirección A)

Respeta `ARCHITECTURE.md`: `app/` compone, la lógica vive en `features/` y lo presentacional compartido en `components/ui/`. Propongo tareas `FE-DS-xx`, una rama cada una.

**FE-DS-01 · Tokens, tipografía y temas** (`src/app/globals.css`, `layout.tsx`)
```css
@import "tailwindcss";
@custom-variant dark (&:where([data-theme=oscuro], [data-theme=oscuro] *));

:root {
  --cv-fondo:#F5F6F8; --cv-superficie:#FFFFFF; --cv-superficie-2:#EDF0F3;
  --cv-texto:#141B24; --cv-texto-2:#4D5866; --cv-linea:#D6DBE1; --cv-linea-campo:#7B8594;
  --cv-primario:#1F3350; --cv-sobre-primario:#FFFFFF; --cv-enlace:#1D4F91; --cv-foco:#FFD43B;
  --cv-pendiente:#C8231B; --cv-pendiente-fondo:#FDE3E1; --cv-pendiente-texto:#9B1C14;
  /* … recibido, en-proceso, resuelto, rechazado (tabla §4) */
}
@media (prefers-color-scheme: dark) { :root:not([data-theme]) { /* tokens oscuros (§5 A) */ } }
[data-theme="oscuro"] { /* los mismos tokens oscuros */ }
[data-theme="alto-contraste"] { /* §5 A, alto contraste */ }

@theme inline {
  --color-fondo: var(--cv-fondo); --color-superficie: var(--cv-superficie);
  --color-texto: var(--cv-texto); --color-texto-2: var(--cv-texto-2);
  --color-linea: var(--cv-linea); --color-primario: var(--cv-primario); /* … */
  --font-sans: var(--font-public-sans);
}
```
- `@theme inline` y `@custom-variant dark` con atributo `data-*` son la vía documentada de Tailwind 4 (consultado en Context7, `/websites/tailwindcss`: «theme», «dark-mode»). Con tokens que cambian solos casi no hacen falta clases `dark:`.
- `layout.tsx`: `Public_Sans` de `next/font/google` con `variable: '--font-public-sans'` (la guía de Next 16 en `node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md` confirma que se autoaloja y que el navegador no pide nada a Google). Se quitan Geist, Geist Mono y Arial. El `themeColor` del viewport pasa a claro `#1F3350` y oscuro `#0F141A`.
- `manifest.ts`: `theme_color #1F3350`, `background_color #F5F6F8` e íconos PNG generados de `marca/icono-pwa-a*.svg` (192 y 512, `any` y `maskable` por separado). Hoy dan 404.
- Una regla de lint (o un `grep` en `/verificar`) que impida volver a escribir `sky-*`/`slate-*` una vez migrada cada carpeta (hoy son 1 111).

**FE-DS-02 · Componentes base en `src/components/ui/`**: `Boton` (primario, secundario, texto, peligro, con estado de carga), `Campo` (label, ayuda y error con `aria-describedby`; extiende `form.tsx`), `Selector`, `OpcionTarjeta` (radio o casilla en tarjeta), `ChipEstado` (lee `estiloDeEstado` + icono), `IndicadorSeveridad`, `Tarjeta`, `Aviso` (info, éxito, error, sin conexión), `HojaInferior` (no modal, con asa `button` y `aria-expanded`, dos alturas), `IndicadorPasos`, `LineaDeTiempo` (hoy en `src/components/LineaDeTiempo.tsx`), `BarraMetrica` (un color y «Sin datos»), `EstadoVacio`, `Esqueleto`, `MenuCuenta`. `estados.ts` pasa a exponer **tokens** (`var(--cv-pendiente)`) en lugar de hex, para que el modo oscuro cambie los chips sin tocar la lógica.

**FE-DS-03 · Layout y navegación por rol** (`layout.tsx` por grupo de rutas; la configuración de la navegación en `features/auth/model/rutas.ts`, junto a `descripcionDeArea`)

| Rol | Móvil | Escritorio |
|---|---|---|
| Visitante | Barra superior + navegación inferior: Mapa · Desempeño · Reportar (lleva a `/login?redirect=/reportar`) · Entrar | Cabecera: Mapa · Desempeño · Cómo funciona · Iniciar sesión · Crear cuenta |
| Ciudadano | Mapa · Mis reportes · **Reportar** · Desempeño · Cuenta | Cabecera con lo mismo y menú de cuenta (Perfil, Soporte, Apariencia, Cerrar sesión) |
| Funcionario | Bandeja · Panel · Categorías · Cuenta | Cabecera con insignia «Municipalidad de X»: Bandeja · Panel del distrito · Categorías · Soporte · menú de cuenta |
| Admin | Soporte · Cuenta | Soporte · menú de cuenta |

«Cerrar sesión» pasa al menú de cuenta. La navegación inferior respeta `env(safe-area-inset-bottom)`.

**Cambios por pantalla**
- **Portada**: hero, «Cómo funciona», estados e índice resumido (`Portada.dc.html`).
- **`/mapa`**: por debajo de 768 px, mapa a pantalla completa con `HojaInferior`; desde 768 px se mantiene el panel lateral. No se toca la lógica de consulta (`moveend`/`zoomend`, debounce de 400 ms, umbral de ~55 m). Los marcadores del `DivIcon` pasan a pin SVG con icono y estado seleccionado. Tiles con `filter` CSS en `.leaflet-tile-pane` (desaturado; invertido en oscuro), sin orígenes nuevos en la CSP. La leyenda de calor conserva su texto.
- **`/reportar`**: asistente de 4 pasos con el estado en un reductor puro de `features/reportes/model/` (testeable). Siguen igual la cola offline, la `Idempotency-Key`, la severidad sin valor por defecto y el título contado en code points. «Enviar reporte» queda como etiqueta del último paso.
- **Mis reportes y detalle**: tarjetas con `ChipEstado`, aviso de calificación, cola visible, línea de tiempo con icono por estado y fechas sin segundos.
- **Detalle público** (`/reportes/[id]`): misma línea de tiempo, redactada como hoy.
- **Bandeja**: tabla densa con panel de detalle desde 1280 px (debajo de eso, enlace a `/bandeja/[id]`, como hoy), pestañas por estado con conteo y la decisión «Por atender» (§8). La señal `posibleReincidencia` sigue solo en `ReporteGestion`.
- **Dashboard**: indicadores con jerarquía (tasa y tiempo arriba) que enlazan a la bandeja filtrada («3 sin responsable» → filtro).
- **Desempeño**: tabla desde 768 px y tarjetas por distrito en móvil. Comparación con gráfica y tabla real (`<table>`; sus filas «Tasa de resolución» y «Resueltos / total» las usan los tests).
- **Auth, perfil, soporte, categorías, privacidad, términos**: migran a `Campo`, `Boton` y `Tarjeta`, sin cambios de flujo.

**Impacto en tests** (24 archivos `*.test.tsx` y 59 `*.test.ts`; los de modelo no cambian)
- `FormularioReporte.test.tsx` y `NuevoReporte.test.tsx`: el asistente cambia el recorrido (buscan «Usar mi ubicación (GPS)», `getByLabelText('Tipo de daño')` y «Enviar reporte» en una sola página). Hay que reescribirlos por pasos, o conservar las etiquetas accesibles y avanzar con «Continuar».
- `CamposTituloYSeveridad.test.tsx`, `PendientesDeEnvio.test.tsx`: siguen pasando si el `fieldset` mantiene `role="radiogroup"` y el nombre «Severidad».
- `SelectorDeVista.test.tsx`: los botones «Mapa» y «Lista» pasan a pestañas. Se actualizan los roles, o se mantienen botones con `aria-pressed`.
- `ExportarReportes.test.tsx`: buscan «Exportar CSV». El prototipo muestra «CSV»; en código, `aria-label` o texto completo.
- `BotonCerrarSesion.test.tsx`: el botón vive en el menú de cuenta y el test lo renderiza suelto, así que no se rompe si el componente se reutiliza dentro del menú.
- `CapasDelMapa.test.tsx`: se mantienen «N reportes en la vista», la lista «Leyenda del mapa de calor» y el texto «con un mínimo de 4».
- `TablaBandeja.test.tsx` («Ordenar»), `IndiceDesempeno.test.tsx` (`Tipo de daño`): se mantienen sus etiquetas.

**US-23 · Modo oscuro y alto contraste**: «Apariencia: Sistema · Claro · Oscuro · Alto contraste» en el perfil y en el menú de cuenta. Se guarda en `localStorage` (preferencia del dispositivo) y la aplica `public/tema.js`, un script del mismo origen que fija `data-theme` en `<html>` antes de pintar. Así no hay parpadeo y el layout raíz no lee cookies, que lo volverían dinámico. Respeta `prefers-color-scheme`, `prefers-contrast: more` y `forced-colors`.

**US-24 · Guía de uso**: la carpeta `(public)/guia` existe y está vacía. Propongo cuatro secciones con ancla: cómo reportar (los 4 pasos), qué significa cada estado, cómo se calcula el índice y tu privacidad. El ícono «?» de la barra superior y «Cómo funciona» de la portada enlazan ahí. Es un contenido estático y accesible, sin tours superpuestos.

**Orden sugerido**: FE-DS-01 → 02 → 03 → mapa → reportar → bandeja y dashboard → desempeño → US-23 → US-24 → íconos y marca. Fuera de `frontend/` queda una sola tarea para el backend: la migración que corrige las tildes de las categorías estándar.

## 8. Decisiones del usuario

1. **Dirección**: A (recomendada), B o C. O una mezcla, por ejemplo A con titulares condensados de B.
2. **Dejar el celeste** por su carga partidaria (§2.3), y el rojo y blanco institucional.
3. **Recolorear estados**: Recibido pasa de naranja a azul y se agregan íconos. Cambia una leyenda que ya aparece en capturas de la tesis.
4. **`/reportar` en 4 pasos** (reescribe 2 archivos de test) o una sola página con secciones y el mismo estilo.
5. **Bandeja**: que abra en «Por atender» y con panel lateral, o mantener «Todos» y la página de detalle aparte.
6. **Navegación inferior de 5 ítems** para el ciudadano y «Cerrar sesión» en el menú de cuenta.
7. **US-23**: alto contraste como tercer tema y el selector en el perfil y el menú de cuenta.
8. **Tiles del mapa** desaturados (e invertidos en oscuro) con filtro CSS, sin cambiar de proveedor.
9. **Backend**: aprobar la migración que corrige «Vereda danada», «Semaforo averiado» y «Senalizacion faltante».
10. **Ícono de la PWA**: reemplazar los iconos provisionales de DEP-06 (#85) por PNG generados a partir de `marca/icono-pwa-a*.svg` (con `frontend/scripts/generar-iconos.mjs`).

## 9. Archivos

- `2026-10-21-propuesta.md` (este documento)
- `prototipo/` — los 11 artboards `.dc.html` finales y `support.js` (vista previa local); el índice `canvas.json` vive solo en el canvas (Artifact)
- Las iteraciones en HTML normal y sus capturas quedaron en el entorno de trabajo del diseñador, no versionadas
- `prototipo/` — los artboards finales con el shim, para revisarlos en un navegador
- `marca/` — logos e íconos PWA en SVG (A, B, C)
- `contraste/contraste.mjs` y los pares en `actual.json` y `propuesta.json`; scripts de iteración y conversión
