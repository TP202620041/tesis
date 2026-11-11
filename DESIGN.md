---
name: Ciudad Viva
description: Sistema «Cívica» de la PWA de reporte ciudadano de daños viales en Lima Metropolitana
colors:
  primario: "#1f3350"
  primario-hover: "#16263d"
  sobre-primario: "#ffffff"
  enlace: "#1d4f91"
  enlace-hover: "#142f57"
  foco: "#ffd43b"
  foco-contorno: "#141b24"
  fondo: "#f5f6f8"
  superficie: "#ffffff"
  superficie-2: "#edf0f3"
  linea: "#d6dbe1"
  linea-campo: "#7b8594"
  texto: "#141b24"
  texto-2: "#4d5866"
  error: "#b42318"
  error-fondo: "#fde3e1"
  error-texto: "#9b1c14"
  error-borde: "#f0b4ae"
  exito-fondo: "#d9f5e3"
  exito-texto: "#0b5a33"
  exito-borde: "#9fd9b6"
  aviso-fondo: "#fdefc3"
  aviso-texto: "#6e4100"
  aviso-borde: "#e8c766"
  info-fondo: "#dde8fc"
  info-texto: "#1a3f8f"
  info-borde: "#a9c2f2"
  pendiente: "#c8231b"
  pendiente-fondo: "#fde3e1"
  pendiente-texto: "#9b1c14"
  recibido: "#2e6be6"
  recibido-fondo: "#dde8fc"
  recibido-texto: "#1a3f8f"
  en-proceso: "#f0a800"
  en-proceso-fondo: "#fdefc3"
  en-proceso-texto: "#6e4100"
  resuelto: "#126b3f"
  resuelto-fondo: "#d9f5e3"
  resuelto-texto: "#0b5a33"
  rechazado: "#4b5563"
  rechazado-fondo: "#e7eaee"
  rechazado-texto: "#3a4452"
  cancelado: "#7d8794"
  cancelado-fondo: "#ffffff"
  cancelado-texto: "#4a5463"
  severidad: "#1f3350"
  severidad-pista: "#d6dbe1"
  barra: "#1f3350"
  pista: "#dde2e8"
  marca: "#1f3350"
  marca-calle: "#ffffff"
  barra-superior: "#1f3350"
  sobre-barra-superior: "#ffffff"
typography:
  display:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
  headline:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.333
  title:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
  title-sm:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.556
  body:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.429
  label:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.429
  caption:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.333
rounded:
  control: "8px"
  tarjeta: "12px"
  hoja: "16px"
  completo: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
  objetivo: "44px"
components:
  button-primary:
    backgroundColor: "{colors.primario}"
    textColor: "{colors.sobre-primario}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.primario-hover}"
  button-secondary:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.texto}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.superficie-2}"
  button-text:
    textColor: "{colors.enlace}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.error}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-danger-hover:
    backgroundColor: "{colors.error-fondo}"
  input:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.texto}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "44px"
  card:
    backgroundColor: "{colors.superficie}"
    rounded: "{rounded.tarjeta}"
    padding: "16px"
  chip-pendiente:
    backgroundColor: "{colors.pendiente-fondo}"
    textColor: "{colors.pendiente-texto}"
    typography: "{typography.label}"
    rounded: "{rounded.completo}"
    padding: "2px 10px"
  chip-recibido:
    backgroundColor: "{colors.recibido-fondo}"
    textColor: "{colors.recibido-texto}"
    typography: "{typography.label}"
    rounded: "{rounded.completo}"
    padding: "2px 10px"
  chip-en-proceso:
    backgroundColor: "{colors.en-proceso-fondo}"
    textColor: "{colors.en-proceso-texto}"
    typography: "{typography.label}"
    rounded: "{rounded.completo}"
    padding: "2px 10px"
  chip-resuelto:
    backgroundColor: "{colors.resuelto-fondo}"
    textColor: "{colors.resuelto-texto}"
    typography: "{typography.label}"
    rounded: "{rounded.completo}"
    padding: "2px 10px"
  chip-rechazado:
    backgroundColor: "{colors.rechazado-fondo}"
    textColor: "{colors.rechazado-texto}"
    typography: "{typography.label}"
    rounded: "{rounded.completo}"
    padding: "2px 10px"
  chip-cancelado:
    backgroundColor: "{colors.cancelado-fondo}"
    textColor: "{colors.cancelado-texto}"
    typography: "{typography.label}"
    rounded: "{rounded.completo}"
    padding: "2px 10px"
---

# Design System: Ciudad Viva

## Overview

**Creative North Star: "El registro público"**

Ciudad Viva se ve como un registro que cualquiera puede consultar: sobrio, claro y confiable. Tinta sobre blanco, una sola familia tipográfica y poco adorno. Lo único que tiene color propio es lo que significa algo: el estado de un reporte, un error, una confirmación. Así, un índice que califica a municipalidades no parece tomar partido.

La densidad cambia según quién trabaja. El vecino en la calle recibe una columna, controles grandes y una barra inferior al alcance del pulgar. El funcionario en escritorio recibe tablas y botones compactos. Los dos leen el mismo sistema.

El sistema tiene tres temas (claro, oscuro y alto contraste) que cambian con `data-theme` en `<html>`. Los valores de abajo son los del tema claro; los de los otros dos temas y la fuente normativa están en `frontend/src/app/globals.css`. Ciudad Viva no imita a gob.pe y evita el celeste y el rojo y blanco institucional.

**Key Characteristics:**
- Tinta y blanco; el color se reserva para lo que tiene significado.
- Public Sans en todos los niveles.
- Controles firmes y sin adorno, de 44 px de alto.
- Foco amarillo inconfundible en cualquier fondo.
- Sombras mínimas que separan y no decoran.
- Cada par de texto y fondo se mide contra AA.

## Colors

Una paleta de tinta y grises fríos, más una capa semántica que solo aparece cuando hay un significado que comunicar.

### Primary
- **Tinta cívica** (`primario`): acción principal, marca, navegación activa, barra superior del móvil, barras de severidad y del índice.
- **Tinta profunda** (`primario-hover`): la acción principal al pasar el puntero.
- **Azul de enlace** (`enlace`, `enlace-hover`): enlaces y botones de texto. No se usa en superficies.

### Secondary
- **Amarillo de foco** (`foco`, con `foco-contorno`): el indicador de foco del teclado y la línea discontinua de la calle en el logo.

### Tertiary
- **Rojo de pendiente, azul de recibido, ámbar de obra, verde de resuelto y gris de rechazado** (`pendiente`, `recibido`, `en-proceso`, `resuelto`, `rechazado`, `cancelado`, con sus `-fondo` y `-texto`): los estados del reporte. El color base pinta el marcador del mapa y no cambia entre temas; el fondo y el texto pintan el chip.
- **Mensajes** (`error`, `exito`, `aviso`, `info`, con sus `-fondo`, `-texto` y `-borde`): avisos en línea y errores de formulario.

### Neutral
- **Papel frío** (`fondo`): fondo de la aplicación.
- **Blanco de registro** (`superficie`): tarjetas, campos y diálogos.
- **Gris de hoja** (`superficie-2`): zonas secundarias, hover y campos deshabilitados.
- **Línea** (`linea`): divisores y bordes de tarjeta.
- **Línea de control** (`linea-campo`): borde de campos y botones secundarios; llega a 3:1 sobre la superficie.
- **Tinta de texto** (`texto`) y **gris de lectura** (`texto-2`): texto principal y secundario.

### Named Rules
**La regla de la marca callada.** El color de marca nunca se usa en un marcador ni en un chip de estado.

**La regla del amarillo único.** El amarillo es para el foco y la línea del logo. Ningún otro elemento lo usa.

**La regla de color, icono y nombre.** Un estado siempre lleva los tres; el color nunca va solo.

**La regla sin colores sueltos.** Solo existen los tokens del sistema. La paleta por defecto de Tailwind está desactivada y `sin-colores-sueltos.test.ts` la vigila.

**La regla de la barra única.** El índice de desempeño usa un solo color. La interfaz no inventa umbrales de bueno o malo.

## Typography

**Display Font:** Public Sans (con ui-sans-serif, system-ui, sans-serif)
**Body Font:** Public Sans (con ui-sans-serif, system-ui, sans-serif)

**Character:** Una sola sans-serif de origen público, autoalojada con `next/font`. La jerarquía sale del tamaño y el peso, no de combinar familias.

### Hierarchy
- **Display** (700): título de la portada.
- **Headline** (700): título principal de cada pantalla.
- **Title** (600): secciones grandes y diálogos de resultado.
- **Title-sm** (600): subsecciones.
- **Body** (400): lectura y controles.
- **Body-sm** (400): ayuda, metadatos y avisos; es el tamaño más usado de la interfaz.
- **Label** (600): etiquetas de campo y chips de estado.
- **Caption** (500): filtros de la bandeja y datos muy secundarios. La barra inferior usa este tamaño en semibold, y baja a 11 px en pantallas de menos de 360 px.

### Named Rules
**La regla de las cifras alineadas.** Las tablas usan números tabulares (`tabular-nums`), para que los distritos se comparen columna a columna.

## Layout

Escala de 4 px y diseño desde el móvil. Bajo 768 px hay una columna, una barra superior translúcida y una barra inferior de 64 px con los destinos del rol. Desde 768 px la navegación pasa a la barra superior y aparecen las tablas y paneles de escritorio. Los anchos de lectura se limitan por pantalla: `max-w-lg` en formularios y `max-w-2xl` a `max-w-4xl` en contenido.

Las tarjetas usan un relleno de 16 px, que sube a 20 px desde 640 px. El contenido respeta las áreas seguras de iOS (`env(safe-area-inset-*)`) y `scroll-padding-top` evita que la barra fija tape lo enfocado.

### Named Rules
**La regla de los 44.** Todo control mide al menos 44 px de alto. El tamaño compacto baja a 36 px solo con puntero fino; en una pantalla táctil vuelve a 44.

## Elevation & Depth

Casi plano. La profundidad viene de la diferencia entre el papel frío y el blanco, más un borde de línea; las sombras solo ayudan a separar. La excepción es la barra superior del móvil: tinta al 70 % con difuminado, opaca en alto contraste o con `prefers-reduced-transparency`.

### Shadow Vocabulary
- **Tarjeta** (`box-shadow: 0 1px 2px var(--cv-sombra)`): superficies en reposo.
- **Elevada** (`box-shadow: 0 4px 16px var(--cv-sombra), 0 1px 3px var(--cv-sombra)`): diálogos y menús.

### Named Rules
**La regla de la sombra que separa.** Una sombra separa una superficie de otra y no decora. En alto contraste desaparece y mandan los bordes.

## Shapes

Esquinas suaves y consistentes: 8 px en controles, 12 px en tarjetas y diálogos, 16 px en hojas y menús, y píldora completa solo en chips de estado. Los estados vacíos y la zona para elegir la foto usan borde discontinuo. En alto contraste todos los bordes de 1 px pasan a 2 px. El logo es un pin cruzado por una calle de línea discontinua.

## Components

### Buttons
Firmes y sin adorno.
- **Shape:** esquinas suaves (`rounded.control`), semibold, altura de 44 px.
- **Primary:** tinta sólida con texto blanco. Una por vista.
- **Hover / Focus:** oscurece a tinta profunda; el foco lo da la regla global.
- **Secundario:** borde de control sobre la superficie; en hover pasa a gris de hoja.
- **Texto:** azul de enlace sin caja; subraya en hover.
- **Peligro:** borde y texto de error sobre la superficie, para descartar o retirar.
- **Deshabilitado:** opacidad del 60 %.

### Chips
- **Style:** píldora con fondo y texto del estado, icono Lucide de 14 px y nombre (`ChipEstado`). Cancelado lleva borde gris sobre blanco; en alto contraste todos llevan contorno negro.
- **State:** solo indican. No son enlaces ni botones.

### Cards / Containers
- **Corner Style:** `rounded.tarjeta`.
- **Background:** blanco de registro.
- **Shadow Strategy:** sombra «Tarjeta».
- **Border:** línea de 1 px.
- **Internal Padding:** 16 px, 20 px desde 640 px. A sangre para tablas y fotos.

### Inputs / Fields
- **Style:** borde de control de 1 px, fondo blanco, altura de 44 px, y etiqueta real asociada con `htmlFor`.
- **Focus:** contorno amarillo global.
- **Error / Disabled:** borde de error de 2 px más el mensaje con `role="alert"`; deshabilitado en gris de hoja.

### Navigation
- **Móvil:** barra superior translúcida cuyo título aparece al desplazarse, y barra inferior con icono y nombre. La pestaña activa lleva una línea superior de 3 px en tinta y texto en negrita. «Reportar» se destaca con su icono sobre tinta.
- **Escritorio:** barra superior con enlaces, y la acción principal como botón compacto.
- **Movimiento:** el desplazamiento del título solo ocurre con `motion-safe`.

### Foco
Contorno amarillo de 3 px con un anillo oscuro de 2 px por fuera. Está fuera de las capas de Tailwind para que ninguna utilidad lo apague.

### Avisos
Caja en línea con borde, icono y texto (`Aviso`): información, éxito, advertencia, error y sin conexión. El tono lo dicen el icono y el texto.

### Indicador de severidad
Tres barras crecientes en tinta, siempre con el texto. Sin rojo: es una apreciación del vecino, no una medición, y no compite con el estado.

### Mapa
Las teselas de OpenStreetMap se desaturan con un filtro CSS, y en oscuro se invierten, para que los únicos colores con significado sean los marcadores y el calor. El calor usa una rampa violeta que ningún estado comparte.

## Do's and Don'ts

### Do:
- **Do** usar los tokens semánticos (`bg-superficie`, `text-texto-2`) y registrar cada par nuevo en `scripts/contraste-civica.json`.
- **Do** mostrar cada estado con color, icono y nombre.
- **Do** escribir «Sin datos» cuando no hay dato, con pista punteada en las barras.
- **Do** diseñar primero para el móvil y mantener 44 px en todo control táctil.
- **Do** comprobar cada pantalla nueva en los tres temas.

### Don't:
- **Don't** usar celeste, ni rojo y blanco institucional, ni imitar a gob.pe.
- **Don't** usar el color de marca en marcadores o chips de estado.
- **Don't** usar el amarillo fuera del foco y el logo.
- **Don't** convertir un chip de estado en enlace o botón.
- **Don't** colorear el índice con umbrales de bueno o malo, ni mostrar cero donde no hay dato.
- **Don't** usar más de una acción primaria por vista.
- **Don't** usar clases `dark:` por tema; el tema se resuelve con las variables.
