# Propuesta: correo saliente por API HTTP detrás de un puerto (`CorreoSaliente`)

- **Estado:** abierta <!-- abierta | aceptada | rechazada -->
- **Fecha:** 2026-10-21
- **Origen:** subagente arquitecto, encargo ARQ-1 (despliegue del MVP, paquete DEP-08)
- **Decide:** el usuario. Si se acepta, la sesión de raíz actualiza ARCHITECTURE.md o el plan.

## Contexto

Decisión del usuario del 21/10: el correo sale por un **servicio HTTP** (Brevo o Resend), porque el plan Hobby de Railway bloquea el SMTP saliente. Hoy hay tres usos directos de `JavaMailSender`, ninguno detrás de un puerto:

| Uso | Archivo | Cómo envía hoy | Problema |
|---|---|---|---|
| Recuperación de contraseña (US-03) | `auth/service/PasswordResetService#solicitarRecuperacion` | `mailSender.send` **dentro** del `@Transactional` que guarda el token | Ver «Recuperación de contraseña» más abajo. |
| Respuesta a un ticket (US-25) | `soporte/service/TicketSoporteService#responder` | `mailSender.send` dentro del `@Transactional` que guarda la respuesta | Si el SMTP falla, se revierte la respuesta del ADMIN y el API da 500. |
| Aviso de cambio de estado (US-16) | `notificaciones/infra/EmailNotificacionAdapter` (canal EMAIL del Strategy de `NotificacionCanalAdapter`) | `mailSender.send`, ya `@Async` y fuera de transacción (D-13) | Solo el transporte. |

Además:

- `application.yml` deja `spring.mail.host` en `localhost:1025` por defecto. Con `spring-boot-starter-actuator` (DEP-02), el indicador de salud del correo intentaría conectarse a ese host y pondría `/actuator/health` en `DOWN`, y el health check de Railway nunca daría por sano el despliegue.
- JavaMail no tiene timeouts por defecto: un servidor que no responde deja el hilo esperando sin límite. Spring Boot lo advierte en su guía de correo y recomienda fijar `mail.smtp.connectiontimeout`, `mail.smtp.timeout` y `mail.smtp.writetimeout` ([docs.spring.io, Spring Boot 3.4, «Sending Email»](https://docs.spring.io/spring-boot/3.4/reference/io/email.html), consultado el 21/10/2026).
- `ARCHITECTURE.md` ya nombra el puerto: §4.1 lista `CorreoSaliente` entre los ejemplos de `port/`, y §4.3 (paso 5, NC-05) lo ubica en `notificaciones` con `infra/SmtpCorreoAdapter`. Pero D-11 dice que `common/port` es para la E/S que usan **dos o más** módulos, y el correo lo usan tres (`auth`, `soporte`, `notificaciones`).
- Los IT de correo (`PasswordResetIT`, `TicketSoporteIT`, `NotificacionIT`, `GestionMunicipalIT`) extienden `AbstractPostgisMailIT`, que levanta GreenMail en el puerto 3025. Ya esperan el correo con `waitForIncomingEmail`, así que un envío asíncrono no los rompe.

## Problema

El correo no puede salir por SMTP en producción, y hoy tres módulos dependen directamente de `JavaMailSender`, dos de ellos enviando dentro de una transacción.

## Opciones de diseño

| Opción | Qué implica | Costo | Riesgo |
|---|---|---|---|
| **A. Puerto `common/port/CorreoSaliente` con dos adaptadores en `common/infra`** | `SmtpCorreoAdapter` (JavaMailSender: Mailhog en local, GreenMail en los IT) y un adaptador HTTP (`BrevoCorreoAdapter` o `ResendCorreoAdapter`, según el proveedor elegido). Se elige con `app.correo.tipo` (`smtp` por defecto, `brevo` o `resend` en producción) y `@ConditionalOnProperty`. Los tres usos pasan a llamar al puerto. | 1 puerto, 1 record de mensaje, 2 adaptadores, cambios en 3 clases y 2 listeners nuevos. | Bajo. Es el patrón de D-11 (fotos) y del Strategy de notificaciones. |
| B. Puerto en `notificaciones` (como dice §4.3, paso 5) | `auth` y `soporte` usarían el `port` de `notificaciones`. | Igual que A. | Crea la dependencia `auth` → `notificaciones`, y `notificaciones` ya depende de `auth`: **ciclo** (`modulosSinCiclos` falla). No es una opción real. |
| C. Cambiar solo el transporte: un `JavaMailSender` propio que hable HTTP | Ningún servicio cambia. | Una clase que implementa una interfaz de SMTP sin serlo. | Medio: oculta el cambio de protocolo, mantiene los envíos dentro de las transacciones y deja sin puerto una E/S externa (principio 4 de ARCHITECTURE.md). |

### Forma del puerto

```java
// common/port/CorreoSaliente.java  (DOMINIO: sin tipos de Spring Mail ni HTTP)
public interface CorreoSaliente {
    /** Envía un correo de texto. Lanza CorreoNoEnviadoException si el proveedor lo rechaza o no responde. */
    void enviar(MensajeCorreo mensaje);
}

// common/port/MensajeCorreo.java
public record MensajeCorreo(String para, String asunto, String texto, String etiqueta) { }
// etiqueta: "recuperacion" | "soporte" | "aviso-reporte" (para filtrar en el panel del proveedor, nunca datos personales)
```

- El **remitente** no viaja en el mensaje: lo fija el adaptador desde `app.notificaciones.email-remitente` (`NOTIF_FROM`), igual que hoy.
- `CorreoNoEnviadoException` (no comprobada) va en `common/port` o `common/exception`; los adaptadores traducen a ella los errores del proveedor (4xx, 5xx, timeout) sin volcar el cuerpo del correo al log.
- El adaptador HTTP usa `RestClient` de Spring con **timeouts** (conexión 3 s, lectura 10 s) y **sin reintentos propios** en esta versión: los reintentos con registro de intentos llegan con ENVIO_CORREO (NC-05, §4.3 paso 5). No hace falta SDK: las dos APIs son un `POST` JSON con una clave en una cabecera.
- `SmtpCorreoAdapter` se queda para desarrollo y pruebas: Mailhog y GreenMail siguen funcionando sin tocar `AbstractPostgisMailIT`.
- En producción `spring.mail.host` no se define y `management.health.mail.enabled=false` (DEP-02), así que ni existe un `JavaMailSender` que pueda tumbar el health check, ni nadie lo inyecta fuera de `SmtpCorreoAdapter`.

### Recuperación de contraseña: fuera de la transacción y sin revelar si la cuenta existe

Hoy `PasswordResetService#solicitarRecuperacion` filtra la existencia de la cuenta de dos maneras, aunque responda 202 en ambos casos cuando todo va bien:

1. **Por el código de estado:** si el envío falla, la excepción revierte el token y el API responde **500**, pero solo para correos registrados. Para uno no registrado siempre es 202.
2. **Por el tiempo:** con una cuenta existente la respuesta espera la conversación con el servidor de correo (cientos de milisegundos o, sin timeouts, indefinidamente); sin cuenta, vuelve enseguida.

Además, mientras espera al servidor de correo retiene una conexión del pool de la base (lo que D-13 evita en las notificaciones), y registra en el log el correo no registrado (`log.info(... email)`), un dato personal que no aporta.

Propuesta, con el patrón de D-13:

1. `PasswordResetService#solicitarRecuperacion` (transaccional y corto) guarda el token y publica `auth/event/RecuperacionSolicitadaEvent(usuarioId)`. Si la cuenta no existe, no hace nada más. No envía.
2. `auth/listener/RecuperacionSolicitadaListener` (`@TransactionalEventListener(AFTER_COMMIT)`) encola en el ejecutor acotado de `AsyncConfig` (`@Async(AsyncConfig.EJECUTOR)`); el envío por `CorreoSaliente` corre **sin transacción**. Si falla, se registra con el id del usuario (no el correo) y el token queda guardado: el ciudadano puede volver a pedirlo.
3. El controller responde **202 siempre** que el cuerpo sea válido, exista o no la cuenta, y con el mismo tiempo de respuesta en la práctica (una consulta y, si existe, un `INSERT`).
4. **Tope por cuenta** (nuevo, sin migración): si la cuenta ya tiene N tokens creados en la última hora (`password_reset_token.created_at`, N = 3), no se crea otro ni se envía, y la respuesta sigue siendo 202. Sin este tope, cualquiera puede gastar la cuota diaria gratuita del proveedor con un bucle sobre `POST /api/auth/recuperar-password` y dejar sin avisos a todos los ciudadanos.

La respuesta del ticket (US-25) sigue el mismo camino: `TicketSoporteService#responder` guarda la respuesta y publica `soporte/event/TicketRespondidoEvent`; `soporte/listener/TicketRespondidoListener` envía después del commit. **Cambio de comportamiento:** hoy un fallo del correo revierte la respuesta y da 500; después la respuesta queda guardada (el ciudadano la ve en `GET /mis-tickets`) y el fallo solo se registra. Es lo correcto: el correo es un aviso, no la respuesta.

`EmailNotificacionAdapter` cambia solo su transporte: llama a `CorreoSaliente` en vez de a `JavaMailSender`. Su ejecución ya es asíncrona y fuera de transacción (D-13).

## Brevo frente a Resend

Consultado el 21/10/2026 en las páginas oficiales citadas. El volumen esperado del MVP es bajo: menos de 100 correos al día.

| Criterio | Brevo | Resend |
|---|---|---|
| **Gratis** | 300 correos/día, sin vencimiento ni tarjeta; al pasar el tope, hasta 1.000 transaccionales quedan en cola de reintento ([FAQ Free](https://help.brevo.com/hc/en-us/articles/208580669), 09/09/2026). Una cuenta Free **sin actividad durante 4 meses se borra** (enviar cuenta como actividad). | 100/día y 3.000/mes, contados por día UTC y por destinatario ([quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits)). Queda justo en el volumen previsto. |
| **Primer plan de pago** | Starter desde US$ 9/mes por 5.000 correos ([planes](https://help.brevo.com/hc/en-us/articles/208589409), 08/10/2026). | Pro US$ 20/mes por 50.000 ([pricing](https://resend.com/pricing)). |
| **Sin dominio propio** | Funciona: permite un remitente con una dirección gratuita (p. ej. Gmail) verificada por código. Pero desde las reglas de Gmail y Yahoo de 2024, **reescribe ese remitente** a una dirección suya (`…@…t-sender-sib.com`) y advierte que sin DMARC los correos a Outlook/Hotmail van a spam o se rechazan ([remitentes](https://help.brevo.com/hc/en-us/articles/208836149), 09/07/2026; [DMARC](https://help.brevo.com/hc/en-us/articles/14925263522578), 06/10/2026). | **No sirve:** sin dominio verificado, `onboarding@resend.dev` solo envía al correo del dueño de la cuenta; a cualquier otro destinatario responde 403 ([KB](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)). |
| **Con dominio propio** | Se autentica con SPF, DKIM y DMARC. | Se verifica con SPF (MX + TXT en `send.`) y DKIM; DMARC recomendado ([domains](https://resend.com/docs/dashboard/domains/introduction)). |
| **API** | `POST https://api.brevo.com/v3/smtp/email`, cabecera `api-key`; cuerpo `{"sender":{…},"to":[{"email":…}],"subject":…,"textContent":…}`; responde 201 ([guía](https://developers.brevo.com/docs/send-a-transactional-email)). Límite 1.000 req/s. | `POST https://api.resend.com/emails`, `Authorization: Bearer …`; **exige cabecera `User-Agent`** (sin ella, 403); cuerpo `{"from":…,"to":[…],"subject":…,"text":…}` ([send-email](https://resend.com/docs/api-reference/emails/send-email)). Límite 10 req/s. |
| **SDK Java** | `com.brevo:brevo` (MIT). No hace falta: un `POST` con `RestClient`. | `com.resend:resend-java` (MIT). Tampoco hace falta. |
| **Riesgo operativo** | **Bloquea por defecto las IP desconocidas en la API** ([artículo](https://help.brevo.com/hc/en-us/articles/5740111683858), 01/06/2026), y Railway solo da IP de salida fija en Pro: hay que **desactivar ese bloqueo** o los envíos se cortan sin aviso. | Ninguno equivalente. Es el proveedor que recomienda Railway ([outbound networking](https://docs.railway.com/networking/outbound-networking)). |
| **Marca en el correo** | Los correos del plan Free llevan el sello «Sent with Brevo» ([add-ons](https://help.brevo.com/hc/en-us/articles/4409354969746)); que aparezca también en los transaccionales por API: NO VERIFICADO. | Sin sello en Free, según su página de precios (NO VERIFICADO del todo). |
| **Dónde están los datos** (flujo transfronterizo, Ley N.° 29733) | UE: OVH en Francia y Alemania, Google Cloud en Bélgica ([data storage](https://help.brevo.com/hc/en-us/articles/360001005510)). DPA en los términos. Logs de transaccionales configurables de 1 a 24 meses. | **EE. UU.** (la región de envío puede ser São Paulo, pero los datos se guardan en EE. UU.) ([regions](https://resend.com/docs/dashboard/domains/regions)). DPA prefirmado con SCC y DPF; retención de 30 días. |

## Recomendación

1. **El puerto primero (opción A):** el proveedor queda detrás de `CorreoSaliente` y se cambia con `app.correo.tipo`. Así la elección del proveedor no bloquea el código: DEP-08 implementa el adaptador del proveedor elegido y el otro queda como una clase de ~60 líneas si algún día se cambia.
2. **Proveedor según el dominio:**
   - **Sin dominio propio: Brevo.** Es la única opción que entrega a cualquier destinatario. Se acepta el remitente reescrito, el sello y el riesgo de spam en Outlook; hay que desactivar el bloqueo de IP desconocidas y enviar algo al menos una vez cada 4 meses.
   - **Con dominio propio: Brevo igual**, con el dominio autenticado (SPF, DKIM y DMARC). Da tres veces más margen diario que Resend (300 frente a 100) y deja los datos en la UE, y el flujo transfronterizo hacia la UE es más fácil de justificar que hacia EE. UU. Resend sería mejor solo si el volumen se mantiene muy por debajo de 100/día y se prefiere su API (sin bloqueo de IP).
3. **Remitente:** `no-reply@<dominio>` si hay dominio; si no, la dirección verificada en Brevo. Nunca `viasegura.pe` mientras no conste que el proyecto es dueño de ese dominio.
4. **Recuperación de contraseña y ticket fuera de la transacción**, con 202 siempre y tope por cuenta, como se describe arriba, en el mismo DEP-08.

## Impacto

- **Capas:** `common/port/CorreoSaliente` + `MensajeCorreo`; `common/infra/SmtpCorreoAdapter` y el adaptador HTTP; `auth/event` + `auth/listener` y `soporte/event` + `soporte/listener` nuevos (sufijos `*Event` y `*Listener`, como exige ArchUnit). `ARCHITECTURE.md` §4.3 (paso 5) y §4.1 deben decir que `CorreoSaliente` vive en `common` (D-11) y no en `notificaciones`: lo hace la sesión de raíz si se acepta.
- **Contrato del API:** ninguno. `POST /api/auth/recuperar-password` ya responde 202 y `PATCH /api/soporte/tickets/{id}/responder` sigue devolviendo el ticket.
- **Migraciones:** ninguna (el tope usa `password_reset_token.created_at`, que existe desde V8).
- **Tests:** los IT de correo siguen con GreenMail (`app.correo.tipo=smtp` en el perfil de test). Nuevos: el adaptador HTTP con `MockRestServiceServer` (cuerpo JSON, cabecera de la clave, error 4xx/5xx → `CorreoNoEnviadoException`, timeout); `PasswordResetIT` con el servidor de correo caído responde 202 y el token queda guardado; el tope por cuenta; `TicketSoporteIT` con el correo caído conserva la respuesta. Failsafe `completed` sube.
- **Despliegue:** variables `CORREO_TIPO`, `CORREO_API_KEY` y `NOTIF_FROM` en Railway (sin valores en el repo); registros DNS del dominio remitente si se usa uno propio (SPF, DKIM y DMARC, ver `2026-10-21-despliegue-mvp.md`).

## Qué queda bloqueado mientras no se decida

DEP-08 y, con él, la salida a producción con correo: sin un proveedor no funcionan la recuperación de contraseña (US-03), la respuesta de soporte por correo (US-25) ni el aviso por correo (US-16). El resto del despliegue puede avanzar: el adaptador SMTP sigue en desarrollo y en los IT.
