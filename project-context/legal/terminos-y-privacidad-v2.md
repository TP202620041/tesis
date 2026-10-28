# Términos de uso y política de privacidad de Ciudad Viva

> **BORRADOR para revisión** (versión `2026-10-v2`, 2026-10-26; ampliado el 2026-10-28). Reemplaza a `terminos-y-privacidad-v1.md` (`2026-10-v1`). Lo redactó la sesión coordinadora a partir de lo que hace la aplicación en `develop` con NC-04b (v0.8.0). El 28/10 se le sumaron la confirmación del correo de NC-09 (PR #122) y la moderación de contenido de NC-10 y NC-11 (`decisions/propuestas/2026-10-28-moderacion-de-contenido.md`). **No es asesoría legal.** Antes de publicarlo debe revisarlo el usuario (o su asesor), en especial:
> - lo marcado `[COMPLETAR]` (el domicilio del titular) y `[REVISAR]` (el flujo transfronterizo en §6, la cita de RDD2022 en §14 y el plazo de las cuentas sin confirmar en §8);
> - la inscripción del banco de datos ante la Autoridad Nacional de Protección de Datos Personales;
> - si el *share-alike* de RDD2022 alcanza a los pesos del modelo (§14, decisión 7).
>
> **Datos del usuario (26/10):**
> - Autores, titular y correo de contacto: los publica el usuario por decisión propia, sabiendo que el repositorio es público.
> - Plazos (§8): los reportes se conservan mientras opere la plataforma, con el autor anonimizado al cerrar la cuenta; las consultas de soporte, 3 meses después de respondidas. Los cumplen BE-13 y BE-14 (plan del S7).
> - Sesión: 120 minutos (`JWT_EXPIRATION_MINUTES`, runbook §5.2).
>
> **Decisiones del usuario (28/10):** la moderación va dentro de esta versión (no hay v3), y un reporte que oculta el ADMIN no cuenta en el índice de desempeño.
>
> **Antes de publicar:** este texto promete lo que hacen NC-09, NC-10 y NC-11. Se publica en la versión en que salgan las tres. Si alguna no llega, se quita su párrafo:
> - la confirmación del correo en §2 y §8;
> - la revisión de la foto y del texto en §5;
> - ocultar y denunciar en §5 y §8.
>
> **Qué cambia respecto de v1:**
> - §2: la confirmación del correo al crear la cuenta (NC-09) y las denuncias.
> - §4 nuevo: el análisis automático de la foto (NC-04 y NC-04b).
> - §5 nuevo: la revisión del contenido antes de publicar, el ocultamiento por el equipo de Ciudad Viva y las denuncias (NC-10 y NC-11).
> - §6: los proveedores técnicos, ya conocidos tras el despliegue del 25/10.
> - §14 nuevo: los reconocimientos de RDD2022, RF-DETR, el modelo de revisión de fotos y la lista de dominios desechables.
> - Las secciones 4 a 11 de v1 pasan a ser las 6 a 13.
>
> **Re-aceptación:** todos los usuarios vuelven a aceptar (decisión del usuario del 26/10). Se usa el mecanismo de D-12: al subir la versión vigente, la PWA pide aceptar la nueva en el próximo inicio de sesión. **Versión:** si se publica en noviembre, pasa a `2026-11-v2`, en este archivo y en los dos lugares que indica el pie.
>
> Marco: Ley N.° 29733, Ley de Protección de Datos Personales, y su reglamento (DS 016-2024-JUS; verificar la norma vigente al publicar). Decisión de diseño: D-12 en `ARCHITECTURE.md`.

## 1. Quiénes somos

Ciudad Viva es una plataforma de reporte ciudadano de daños en la infraestructura vial de Lima Metropolitana. La desarrollan Fabrizio Leon y Mario Lopez como parte de una tesis de la Universidad Peruana de Ciencias Aplicadas (UPC).

El titular del banco de datos personales es Fabrizio Leon, con domicilio en [COMPLETAR: domicilio]. Para cualquier consulta sobre tus datos puedes escribir a contacto@ciudadviva.app o usar la sección **Soporte** de la aplicación.

## 2. Qué datos tratamos

| Dato | Cuándo lo recogemos | Para qué |
|---|---|---|
| Correo electrónico, nombre, apellido y contraseña (guardada solo como hash, nunca en texto plano) | Al crear tu cuenta | Identificarte, iniciar sesión y escribirte sobre tus reportes |
| Confirmación de tu correo: la fecha en que confirmaste y, por cada enlace que te enviamos, una huella cifrada (hash) del enlace con sus fechas de envío, vencimiento y uso | Al crear tu cuenta y al confirmarla | Comprobar que el correo es tuyo y que recibe mensajes antes de activar la cuenta |
| Foto de perfil (opcional) | Si la subes en tu perfil | Mostrarla solo a ti; no es pública |
| Foto del daño, ubicación GPS (o el punto que marques en el mapa), descripción y tipo de daño | Al crear un reporte | Registrar el daño, enviarlo a la municipalidad del distrito donde está, sugerirte el tipo de daño (§4) y revisar que se pueda publicar (§5) |
| Sugerencia automática del tipo de daño (categoría, nivel de confianza y versión del modelo) | Al crear un reporte con foto | Evaluar la precisión del modelo (§4); no es pública |
| Tu adhesión a un reporte existente | Al reportar un daño ya registrado cerca | Contar cuántos vecinos respaldan ese reporte |
| Comentarios públicos y calificaciones de la atención | Si comentas o calificas un reporte | Mostrar la opinión ciudadana y medir el desempeño de cada municipalidad |
| Tus denuncias (el reporte, el motivo, el detalle si lo escribes y la fecha) | Si usas «Denunciar contenido» | Revisar el contenido denunciado y evitar abusos (§5) |
| Consultas de soporte (asunto, mensaje y tu correo) | Si contactas a soporte | Responder tu consulta |
| Datos de suscripción a notificaciones push del navegador (dirección técnica del servicio de push, claves de cifrado y tipo de navegador) | Si activas las notificaciones push | Avisarte cuando cambie el estado de tus reportes |
| Historial de tus consentimientos (qué aceptaste, qué versión y cuándo, y cuándo lo revocaste) | Al aceptar o revocar | Demostrar que aceptaste, como exige la ley |

**Confirmación del correo.** Al crear tu cuenta te enviamos un enlace de confirmación que vale **24 horas**. Hasta que lo abras no puedes iniciar sesión; si vence, puedes pedir otro.

Antes de enviarlo comprobamos que el correo sea real:
- **Consultamos el DNS** (el directorio público de internet) para saber si el **dominio** de tu correo puede recibir mensajes. El dominio es lo que va después de la @, por ejemplo `gmail.com`. La consulta lleva solo el dominio, nunca tu dirección completa, y no guardamos su resultado.
- **No aceptamos dominios de correo desechable o temporal.**

El enlace en sí no se guarda: solo su huella cifrada.

**Lo que no hacemos:** no vendemos tus datos, no los usamos para publicidad y no te pedimos datos sensibles.

## 3. Qué es público

- **El reporte es público:** cualquier persona puede ver en el mapa la foto del daño, su ubicación, la descripción, el tipo, el estado y la fecha. Así funciona una plataforma de transparencia: no fotografíes personas, placas de vehículos ni el interior de viviendas.
- **Tu identidad como autor no se publica:** el mapa y el detalle de un reporte no muestran quién lo hizo.
- **Comentarios públicos:** se muestran con tu nombre (no tu correo ni tu apellido completo).
- **Índice de desempeño:** con los reportes y calificaciones se calcula un índice público por distrito. Solo usa cifras agregadas; nunca datos de una persona. Un reporte que ocultamos por incumplir estos términos (§5) no cuenta en el índice mientras esté oculto.

## 4. Análisis automático de la foto

Cuando adjuntas la foto del daño, un modelo de visión por computadora la analiza para **sugerirte** el tipo de daño, por ejemplo «Bache» o «Grieta».

- **Es solo una sugerencia.** Tú eliges la categoría y puedes cambiarla o ignorarla. El reporte se crea igual aunque el análisis falle o no sugiera nada.
- **Mira el daño, no a ti.** El modelo solo busca daños en la vía: no te identifica, no te evalúa y no toma ninguna decisión sobre ti.
- **Dónde se hace.** En un servicio propio de Ciudad Viva, alojado con el mismo proveedor que el resto de la plataforma (§6). La foto no se envía a servicios de inteligencia artificial de terceros.
- **Qué guardamos:**
  - **Antes de enviar el reporte:** si la foto se analiza para mostrarte la sugerencia (vista previa), ni la foto ni el resultado se guardan.
  - **Al crear el reporte:** se guarda la sugerencia junto a él (categoría, nivel de confianza y versión del modelo), para medir qué tan bien acierta el modelo. Es parte de la evaluación de la tesis. No es pública y no se usa para decidir cómo se atiende tu reporte.
- **No entrenamos el modelo con tus fotos.** Si algún día quisiéramos hacerlo, te pediríamos un consentimiento nuevo y separado.

## 5. Revisión del contenido antes de publicar

Para que la plataforma no publique contenido sexual ni insultos, revisamos automáticamente lo que envías antes de publicarlo. Además, cualquier ciudadano puede denunciar lo que se nos escape.

**La foto del daño.**
- Antes de guardarla, el mismo servicio propio del §4 la analiza con un modelo que detecta **contenido sexual u obsceno**. La foto no se envía a terceros.
- **Si detecta ese contenido, la foto se rechaza:** no se guarda ni se publica, y te pedimos tomar otra. La revisión también se hace en la vista previa, para avisarte antes de enviar.
- **Si en ese momento el servicio no responde, no podemos aceptar la foto.** Puedes guardar el reporte en tu dispositivo, y se enviará cuando el servicio vuelva, o enviarlo sin foto.

**El texto.** Los textos que escribes para publicar, como la descripción del reporte, se comparan con una lista de palabras ofensivas. Si encontramos una, no publicamos el texto y te pedimos cambiarlo. El aviso no repite la palabra.

**Qué guardamos de lo rechazado:** nada. Ni la foto, ni el texto, ni el resultado del análisis. En el registro técnico del servidor queda solo que hubo un rechazo, con tu identificador de usuario y la fecha, para detectar abusos.

La revisión es automática y puede equivocarse. Si crees que rechazamos algo por error, escríbenos por **Soporte**.

**Ocultar contenido ya publicado.**
- El equipo de Ciudad Viva puede ocultar la foto de un reporte, o el reporte completo, si incumple estos términos (§11). **La municipalidad no puede ocultar reportes.**
- Lo hacemos con un motivo, que el autor ve en la línea de tiempo de su reporte, y lo podemos deshacer.
- Una **foto oculta** deja de mostrarse, pero el reporte sigue público.
- Un **reporte oculto** deja de ser público y **no cuenta en el índice de desempeño** mientras esté oculto. Su autor lo sigue viendo en «Mis reportes».
- Lo que alguien ya descargó en su dispositivo antes de que lo ocultáramos puede quedar en él.

**Denunciar.**
- Si ves un reporte con contenido que incumple estas reglas, usa el botón **«Denunciar contenido»**. Necesitas una cuenta.
- Puedes denunciar cada reporte una vez, con un máximo de denuncias por día.
- Cada denuncia la revisa el equipo de Ciudad Viva: por sí sola no oculta nada.
- Quien hizo el reporte no sabe quién lo denunció.

## 6. Con quién compartimos tus datos

- **La municipalidad del distrito** donde está el daño recibe el reporte para atenderlo. El personal municipal no ve tu correo.
- **Tus denuncias** solo las ve el equipo de Ciudad Viva. No se comparten con el autor del reporte ni con la municipalidad.
- **Proveedores técnicos que procesan datos en nuestro nombre:**
  - **Railway:** aloja el servidor de la aplicación, la base de datos y el análisis de fotos (§4 y §5).
  - **Cloudflare:** guarda las fotos y las copias de respaldo de la base, y protege la conexión con el servidor.
  - **Vercel:** publica la aplicación web. No guarda los datos de tu cuenta.
  - **Resend:** envía los correos.

  Para las notificaciones push, el aviso pasa por el servicio de push de tu navegador (Google, Mozilla, Microsoft o Apple), que solo recibe un mensaje cifrado.
- **Fuera del Perú:** los servidores de la aplicación y de la base de datos, y el almacenamiento de las fotos, están en Estados Unidos, así que tus datos se tratan fuera del país (flujo transfronterizo). [REVISAR: requisitos de la Ley N.° 29733 y su reglamento para el flujo transfronterizo y, si corresponde, su comunicación a la Autoridad.]
- **Autoridades**, solo cuando una ley o una orden judicial lo exija.

## 7. Tus consentimientos (y cómo retirarlos)

Te pedimos un consentimiento separado para cada finalidad, y puedes revisarlos en tu **Perfil**:

1. **Términos de uso y privacidad:** obligatorio para usar la plataforma. Si cambia este documento, te pediremos aceptar la nueva versión al iniciar sesión.
2. **Notificaciones push:** opcional. Puedes retirarlo cuando quieras; si lo haces, dejamos de enviarte push en todos tus navegadores.
3. **Notificaciones por correo:** opcional. Sin este consentimiento no te enviamos avisos por correo sobre tus reportes. Los correos que **tú pediste**, como la recuperación de contraseña o la respuesta a una consulta de soporte, se envían siempre (decisión del 19/10). El correo para confirmar tu cuenta (§2) también se envía siempre.

Retirar un consentimiento no invalida lo que hicimos antes con él. Para dejar de aceptar los términos de uso hay que cerrar la cuenta (ver §9).

## 8. Cuánto tiempo guardamos tus datos

- **Cuenta:** mientras esté activa. Si la cierras (§9), borramos tus datos de cuenta. [REVISAR: plazo para borrar las cuentas que nunca se confirmaron y los enlaces de confirmación vencidos; propuesta `decisions/propuestas/2026-10-28-cuentas-sin-confirmar.md`.]
- **Reportes y sus fotos:** mientras la plataforma esté en funcionamiento, porque forman parte del registro público de daños y del índice de desempeño de cada periodo de gestión. Si cierras tu cuenta, tus reportes, adhesiones, comentarios y calificaciones se conservan **sin ningún dato que te identifique** (anonimizados). Un reporte o una foto ocultos (§5) se conservan sin publicarse, por si hay que deshacer el ocultamiento.
- **Sugerencia automática del tipo de daño:** mientras exista el reporte.
- **Fotos y textos rechazados en la revisión (§5):** no se guardan.
- **Denuncias que haces:** mientras exista el reporte denunciado. Si cierras tu cuenta, se conservan sin ningún dato que te identifique.
- **Consultas de soporte:** 3 meses después de que te respondamos. Luego se borran.
- **Suscripciones push:** hasta que las desactives, cierres sesión en ese navegador o el servicio de push las dé por vencidas.

## 9. Tus derechos

Según la Ley N.° 29733 puedes ejercer tus derechos de **acceso, rectificación, cancelación y oposición** (ARCO), además de **revocar** tus consentimientos.

- Puedes corregir tu nombre y tu foto desde tu **Perfil**.
- Para lo demás, incluido cerrar tu cuenta, escribe a contacto@ciudadviva.app o usa **Soporte**. Te responderemos en los plazos que fija la ley.
- Si no quedas conforme, puedes presentar un reclamo ante la Autoridad Nacional de Protección de Datos Personales.

## 10. Seguridad

- La conexión va cifrada.
- Las contraseñas se guardan con un algoritmo de hash.
- El enlace para confirmar tu correo vence en 24 horas y solo guardamos su huella cifrada (§2).
- Las fotos de perfil solo se entregan a su dueño.
- Las notificaciones push van cifradas de extremo a extremo hasta tu navegador.
- La sesión vence 2 horas después de iniciarla.

Ningún sistema es infalible. Si detectamos un incidente que afecte tus datos, te lo informaremos.

## 11. Uso responsable de la plataforma

- Reporta solo daños reales en la vía pública.
- No subas fotos con personas identificables, placas de vehículos ni contenido ofensivo, sexual u obsceno.
- No uses los comentarios para insultar ni para difundir datos de terceros.

Si algo incumple estas reglas, lo rechazamos al enviarlo o lo ocultamos después (§5). Si lo ves publicado, puedes denunciarlo con «Denunciar contenido».

## 12. Responsabilidad sobre las fotografías y el contenido que subes

- Las fotografías, descripciones y comentarios que adjuntas son de tu exclusiva responsabilidad.
- Al subir una foto declaras que la tomaste tú o que tienes derecho a usarla, y que no vulnera derechos de terceros (imagen, intimidad, propiedad intelectual).
- Antes de publicar, una revisión automática rechaza las fotos con contenido sexual u obsceno y los textos con palabras ofensivas (§5). Esa revisión no es infalible ni revisa todo lo demás: por ejemplo, no comprueba si la foto muestra personas o placas. En la medida en que la ley lo permita, Ciudad Viva no se hace responsable del contenido, de su veracidad ni de los daños que su publicación cause a terceros; esa responsabilidad recae en quien lo subió.
- Nos autorizas, de forma gratuita y no exclusiva, a mostrar la foto en la plataforma, a compartirla con la municipalidad para atender el reporte y a analizarla automáticamente para sugerir el tipo de daño (§4) y para revisar que no tenga contenido sexual u obsceno (§5).
- Si una foto vulnera tus derechos, pide su retiro por Soporte o usa «Denunciar contenido». Podemos ocultar el contenido que incumpla estos términos (§5 y §11); el autor ve el motivo en la línea de tiempo de su reporte.

## 13. Cambios a este documento

Cada versión lleva una fecha. Si cambia algo importante, te pediremos que aceptes la nueva versión la próxima vez que entres; hasta que lo hagas, no podrás seguir usando la cuenta.

**Versión 2 (`2026-10-v2`):**
- se agregó la confirmación del correo al crear la cuenta (§2);
- se agregó el análisis automático de la foto (§4);
- se agregó la revisión del contenido antes de publicar, el ocultamiento de contenido por el equipo de Ciudad Viva y las denuncias (§5);
- se detallaron los proveedores técnicos y el tratamiento de datos fuera del Perú (§6);
- se agregaron los reconocimientos (§14).

Como el cambio es importante, te pedimos aceptarla de nuevo.

## 14. Reconocimientos

La sugerencia del tipo de daño (§4), la revisión de las fotos (§5) y la confirmación del correo (§2) usan trabajo de terceros publicado con licencias abiertas:

- **Conjunto de datos RDD2022:** D. Arya, H. Maeda, S. K. Ghosh, D. Toshniwal e Y. Sekimoto, «RDD2022: A multi-national image dataset for automatic Road Damage Detection» (2022). Publicado en [github.com/sekilab/RoadDamageDetector](https://github.com/sekilab/RoadDamageDetector), con imágenes bajo licencia [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Ciudad Viva no redistribuye las imágenes. Agrupa sus cuatro clases de daño en «bache» y «grieta». [REVISAR: autores y título contra la publicación, arXiv 2209.08538.]
- **Modelo:** RF-DETR Nano, de Roboflow ([github.com/roboflow/rf-detr](https://github.com/roboflow/rf-detr)), con los pesos entrenados sobre RDD2022 que publicó dronefreak ([huggingface.co/dronefreak/rdd2022-rfdetr-nano](https://huggingface.co/dronefreak/rdd2022-rfdetr-nano)). Ambos bajo licencia [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0). Ciudad Viva usa los pesos sin reentrenarlos, exportados a ONNX.
- **Revisión de fotos:** modelo `nsfw-image-detection-384` de Marqo ([huggingface.co/Marqo/nsfw-image-detection-384](https://huggingface.co/Marqo/nsfw-image-detection-384)), afinado a partir de ViT-Tiny de `timm`, bajo licencia [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0). Ciudad Viva lo usa sin reentrenarlo, exportado a ONNX.
- **Dominios de correo desechable:** la lista de [github.com/disposable-email-domains/disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains), dedicada al dominio público ([CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)).

---

**Versión:** `2026-10-v2` (borrador). Debe coincidir con `app.legal.version-terminos` (`LEGAL_VERSION_TERMINOS`) en el backend, con `VERSION_TERMINOS` en `frontend/src/features/auth/model/terminos.ts` y con lo que muestra la página `/privacidad`.
