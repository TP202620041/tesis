# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Usuario prioritario: el vecino en la calle.** Ve un daño vial en Lima Metropolitana y lo reporta desde el celular, a pie, con poco tiempo y a veces sin señal. Cuando las necesidades de los públicos choquen, se decide a su favor.

Otros públicos:
- **Funcionario municipal** (`FUNCIONARIO_MUNICIPAL`): atiende en escritorio los reportes de su jurisdicción; cambia estados, asigna responsable y responde.
- **Visitante sin cuenta**: consulta el mapa de reportes y compara a los distritos en el índice público.
- **Administrador** (`ADMIN`): modera lo publicado, atiende denuncias y soporte.
- **Jurado y asesores de la tesis**: evalúan el sistema y cómo se sustenta.

## Product Purpose

Ciudad Viva es la tesis UPC *Sistema web de crowdsourcing geoespacial para el reporte y seguimiento de la gestión municipal de la infraestructura vial en Lima Metropolitana*. El vecino reporta un daño con su ubicación y una foto opcional, el sistema lo asigna al distrito por punto en polígono y la municipalidad lo gestiona a la vista de todos.

Existe porque ninguna fuente pública mide el estado de las vías de Lima ni cómo responde cada municipalidad, y las competencias están repartidas entre 42 municipalidades distritales y la Municipalidad Metropolitana de Lima.

**Éxito en los próximos meses:** aprobar la tesis ante el jurado y pasar la validación con funcionarios (SUS de 68 o más, 80 % o más de tareas logradas, WCAG). La adopción real por vecinos o municipalidades no es un objetivo declarado.

## Positioning

Es una plataforma cívica independiente y políticamente neutral. Su índice de desempeño distrital sale de los reportes ciudadanos y de sus cambios de estado, no de cifras declaradas por las municipalidades.

## Operating Context

- **Vecino:** PWA en el navegador del celular, sin instalar desde una tienda. Sin señal, el reporte se guarda y se reenvía después; si el GPS falla, se marca el punto en el mapa.
- **Funcionario:** trabajo de escritorio en bandeja y dashboard.
- **Visitante:** entra sin cuenta a `/mapa`, `/desempeno` y `/reportes/[id]`.
- **Sustentación:** el sistema se demuestra en producción (ciudadviva.app) ante el jurado.

## Capabilities and Constraints

**Hecho (v0.8.0):**
- Los 43 distritos de Lima; fuera de Lima el reporte se rechaza.
- Reportes con deduplicación: la misma categoría a 20 m o menos suma una adhesión.
- Estados: Pendiente, Recibido, En proceso, Resuelto, Rechazado y Cancelado.
- Sugerencia de categoría por IA: solo sugiere, decide el vecino, y la municipalidad no la ve.
- Moderación de fotos y textos antes de publicar; denuncias; solo el administrador oculta, con motivo.
- Registro con captcha y confirmación del correo; consentimiento por finalidad.
- Notificaciones push y por correo, solo con permiso.
- Mapa, vista en lista, mapa de calor e índice público; temas claro, oscuro y alto contraste.

**No existe y no se debe presentar como hecho:** correo formal a la municipalidad (NC-05, US-33), dashboard por periodo de gestión (NC-06), guía de uso (US-24), catálogo ampliado de categorías (US-34), notificaciones dentro de la app, actualización en tiempo real, búsqueda por dirección, porcentaje de confianza de la IA.

**Sin decidir:** jurisdicción del funcionario por distrito o por municipalidad (D-10), fórmulas de los KPIs por periodo, términos de uso v2. Los criterios del índice son provisionales.

**Términos del dominio:** reporte, adhesión, vecino, distrito, municipalidad, índice de desempeño. Un dato ausente es «Sin datos», nunca cero.

## Brand Commitments

- **Nombre:** Ciudad Viva. Los identificadores técnicos `viasegura` se conservan solo en el código.
- **No es un canal del Estado y no debe parecerlo.** No imita a gob.pe.
- **Neutralidad política:** como el índice califica a municipalidades, la identidad evita los colores con carga partidaria en Lima, en especial el celeste, y el rojo y blanco institucional.
- **Marca existente:** logo e iconos en `docs/diseno/marca/`. La dirección visual elegida («Cívica», 21/10/2026) está en `docs/diseno/README.md`.
- **Idioma:** español. La interfaz actual tutea y usa frases simples («Tu reporte…», «Cuéntanos…»); se observó en la PWA y no se fijó como regla.

## Evidence on Hand

- Sistema en producción: https://ciudadviva.app y https://api.ciudadviva.app.
- Calidad al 31/10/2026 (`CHANGELOG.md`, `docs/qa/`): 612 pruebas de integración, 830 unitarias, 1420 de frontend y 264 de inferencia.
- Investigación de plataformas cívicas y sistemas de diseño públicos: `docs/diseno/2026-10-21-propuesta.md`.
- Prototipos: `docs/diseno/prototipo/`. Son propuesta, no pantallas implementadas.

**No existen y no se deben inventar:** usuarios reales, testimonios, municipalidades que lo usen, resultados citables de la validación (SUS, éxito de tareas), métricas propias del modelo en Lima, costo o latencia medidos en producción. Los datos de las capturas son de prueba.

## Product Principles

1. **Primero el vecino en la calle.** Reportar debe poder hacerse con una mano, con prisa y con mala señal.
2. **Neutralidad visible.** Nada en la plataforma debe sugerir un partido, un gobierno o una municipalidad.
3. **Nadie altera su propia medición.** Ningún actor puede manipular las métricas que miden su desempeño.
4. **Decir solo lo que es cierto.** Lo provisional se dice, lo que no se sabe es «Sin datos» y la IA nunca se presenta como autoridad.
5. **Sustentable ante el jurado.** Cada decisión visible debe poder justificarse con evidencia.

## Accessibility & Inclusion

- Objetivo: WCAG 2.2 nivel AA, a evaluar en la validación. No se afirma cumplimiento.
- El estado nunca se comunica solo con color.
- Objetivos táctiles de 44 px, tema de alto contraste y vista en lista como alternativa textual al mapa.
- Brecha digital: reportar exige celular, datos y correo, y la interfaz solo está en español. Es una limitación reconocida.
