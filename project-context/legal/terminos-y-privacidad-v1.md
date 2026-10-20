# Términos de uso y política de privacidad de Ciudad Viva

> **BORRADOR para revisión** (versión `2026-10-v1`, 2026-10-19). Lo redactó la sesión coordinadora a partir de lo que la aplicación hace hoy (esquema de datos y endpoints del código en `develop`). **No es asesoría legal.** Antes de publicarlo debe revisarlo el usuario (o su asesor), en especial:
> - lo marcado `[COMPLETAR]`;
> - la identidad del titular del banco de datos y su inscripción ante la Autoridad Nacional de Protección de Datos Personales;
> - los plazos de conservación.
>
> Marco: Ley N.° 29733, Ley de Protección de Datos Personales, y su reglamento vigente (verificar la norma reglamentaria vigente al publicar). Decisión de diseño: D-12 en `ARCHITECTURE.md`.

## 1. Quiénes somos

Ciudad Viva es una plataforma de reporte ciudadano de daños en la infraestructura vial de Lima Metropolitana. La desarrolla [COMPLETAR: nombres de los autores] como parte de una tesis de la Universidad Peruana de Ciencias Aplicadas (UPC).

El titular del banco de datos personales es [COMPLETAR: persona natural o jurídica responsable, domicilio y correo de contacto]. Para cualquier consulta sobre tus datos puedes escribir a [COMPLETAR: correo de contacto] o usar la sección **Soporte** de la aplicación.

## 2. Qué datos tratamos

| Dato | Cuándo lo recogemos | Para qué |
|---|---|---|
| Correo electrónico, nombre, apellido y contraseña (guardada solo como hash, nunca en texto plano) | Al crear tu cuenta | Identificarte, iniciar sesión y escribirte sobre tus reportes |
| Foto de perfil (opcional) | Si la subes en tu perfil | Mostrarla solo a ti; no es pública |
| Foto del daño, ubicación GPS (o el punto que marques en el mapa), descripción y tipo de daño | Al crear un reporte | Registrar el daño y enviarlo a la municipalidad del distrito donde está |
| Tu adhesión a un reporte existente | Al reportar un daño ya registrado cerca | Contar cuántos vecinos respaldan ese reporte |
| Comentarios públicos y calificaciones de la atención | Si comentas o calificas un reporte | Mostrar la opinión ciudadana y medir el desempeño de cada municipalidad |
| Consultas de soporte (asunto, mensaje y tu correo) | Si contactas a soporte | Responder tu consulta |
| Datos de suscripción a notificaciones push del navegador (dirección técnica del servicio de push, claves de cifrado y tipo de navegador) | Si activas las notificaciones push | Avisarte cuando cambie el estado de tus reportes |
| Historial de tus consentimientos (qué aceptaste, qué versión y cuándo, y cuándo lo revocaste) | Al aceptar o revocar | Demostrar que aceptaste, como exige la ley |

**Lo que no hacemos:** no vendemos tus datos, no los usamos para publicidad y no te pedimos datos sensibles.

## 3. Qué es público

- **El reporte es público:** cualquier persona puede ver en el mapa la foto del daño, su ubicación, la descripción, el tipo, el estado y la fecha. Así funciona una plataforma de transparencia: no fotografíes personas, placas de vehículos ni el interior de viviendas.
- **Tu identidad como autor no se publica:** el mapa y el detalle de un reporte no muestran quién lo hizo.
- **Comentarios públicos:** se muestran con tu nombre (no tu correo ni tu apellido completo).
- **Índice de desempeño:** con los reportes y calificaciones se calcula un índice público por distrito. Solo usa cifras agregadas; nunca datos de una persona.

## 4. Con quién compartimos tus datos

- **La municipalidad del distrito** donde está el daño recibe el reporte para atenderlo. El personal municipal no ve tu correo.
- **Proveedores técnicos que procesan datos en nuestro nombre**: [COMPLETAR: servicio de correo, alojamiento del servidor y de la base de datos]. Para las notificaciones push, el aviso pasa por el servicio de push de tu navegador (Google, Mozilla, Microsoft o Apple), que solo recibe un mensaje cifrado.
- **Autoridades**, solo cuando una ley o una orden judicial lo exija.

## 5. Tus consentimientos (y cómo retirarlos)

Te pedimos un consentimiento separado para cada finalidad, y puedes revisarlos en tu **Perfil**:

1. **Términos de uso y privacidad:** obligatorio para usar la plataforma. Si cambia este documento, te pediremos aceptar la nueva versión al iniciar sesión.
2. **Notificaciones push:** opcional. Puedes retirarlo cuando quieras; si lo haces, dejamos de enviarte push en todos tus navegadores.
3. **Notificaciones por correo:** opcional. Sin este consentimiento no te enviamos avisos por correo sobre tus reportes. Los correos que **tú pediste**, como la recuperación de contraseña o la respuesta a una consulta de soporte, se envían siempre (decisión del 19/10).

Retirar un consentimiento no invalida lo que hicimos antes con él. Para dejar de aceptar los términos de uso hay que cerrar la cuenta (ver §7).

## 6. Cuánto tiempo guardamos tus datos

- **Cuenta:** mientras esté activa.
- **Reportes:** forman parte del registro público de daños y del índice de desempeño. [COMPLETAR: plazo, o la anonimización del autor al cerrar la cuenta.]
- **Consultas de soporte:** [COMPLETAR: plazo].
- **Suscripciones push:** hasta que las desactives, cierres sesión en ese navegador o el servicio de push las dé por vencidas.

## 7. Tus derechos

Según la Ley N.° 29733 puedes ejercer tus derechos de **acceso, rectificación, cancelación y oposición** (ARCO), además de **revocar** tus consentimientos.

- Puedes corregir tu nombre y tu foto desde tu **Perfil**.
- Para lo demás, incluido cerrar tu cuenta, escribe a [COMPLETAR: correo de contacto] o usa **Soporte**. Te responderemos en los plazos que fija la ley.
- Si no quedas conforme, puedes presentar un reclamo ante la Autoridad Nacional de Protección de Datos Personales.

## 8. Seguridad

- La conexión va cifrada.
- Las contraseñas se guardan con un algoritmo de hash.
- Las fotos de perfil solo se entregan a su dueño.
- Las notificaciones push van cifradas de extremo a extremo hasta tu navegador.
- La sesión vence a las [COMPLETAR: confirmar] 2 horas.

Ningún sistema es infalible. Si detectamos un incidente que afecte tus datos, te lo informaremos.

## 9. Uso responsable de la plataforma

- Reporta solo daños reales en la vía pública.
- No subas fotos con personas identificables, placas de vehículos ni contenido ofensivo.
- No uses los comentarios para insultar ni para difundir datos de terceros.

Podemos rechazar o retirar contenido que incumpla estas reglas.

## 10. Cambios a este documento

Cada versión lleva una fecha. Si cambia algo importante, te pediremos que aceptes la nueva versión la próxima vez que entres; hasta que lo hagas, no podrás seguir usando la cuenta.

---

**Versión:** `2026-10-v1` (borrador). Debe coincidir con `app.legal.version-terminos` en el backend y con la que muestra la página `/privacidad`.
