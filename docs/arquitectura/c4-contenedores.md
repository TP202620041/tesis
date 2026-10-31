# C4 · Nivel 2: contenedores

> Diagrama **escrito a mano** a partir de `CLAUDE.md`, `ARCHITECTURE.md` (§4.3, §6 y §7) y el código (`application.yml`, `application-prod.yml`, `docker-compose.yml`). `/diagramas` no lo regenera: revísalo cuando aparezca un contenedor o cambie un protocolo. Las cajas claras son lo que solo se usa en desarrollo. Dónde corre cada contenedor en producción: [c4-despliegue.md](c4-despliegue.md).

```mermaid
flowchart TB
  ciudadano(["Ciudadano"])
  funcionario(["Funcionario municipal"])
  admin(["ADMIN"])

  subgraph viasegura["Ciudad Viva"]
    pwa["PWA<br/>Next.js 16 · React 19 · App Router<br/>frontend/"]
    sw["Service Worker<br/>Serwist: precache del App Shell y caché en runtime de otros orígenes, teselas incluidas (el API nunca se cachea)<br/>muestra los avisos push y abre la página al hacer clic"]
    api["API REST<br/>Spring Boot 3.4 · Java 21 · JWT<br/>backend/ · OpenAPI en /v3/api-docs (apagado en prod)<br/>GET públicos sin token: reportes, densidad del mapa de calor (US-11), catálogos, fotos de reporte y /actuator/health"]
    db[("PostgreSQL 16 + PostGIS 3.4<br/>Esquema por Flyway · índice GiST · vista materializada del índice")]
    disco[("Fotos en disco · desarrollo<br/>LocalFotoStorageService (FOTOS_ALMACEN=local)")]
    inferencia["Servicio de inferencia<br/>FastAPI + ONNX en CPU · inferencia/<br/>RF-DETR Nano (detección) y Marqo NSFW (moderación)<br/>no guarda nada; solo lo llama el API"]
  end

  r2[("Cloudflare R2 · producción<br/>buckets privados: fotos de reportes y de perfil<br/>S3FotoStorageService (FOTOS_ALMACEN=s3)")]
  resend["Resend · producción<br/>API HTTP de correo<br/>ResendCorreoAdapter (CORREO_TIPO=resend)"]
  mailhog["Mailhog · desarrollo<br/>SMTP 1025, UI 8025<br/>SmtpCorreoAdapter (CORREO_TIPO=smtp)"]
  push["Servicio Web Push del navegador"]
  osm["Teselas de OpenStreetMap"]
  turnstile["Cloudflare Turnstile · producción<br/>widget del registro y siteverify<br/>TurnstileAdapter (CAPTCHA_TIPO=turnstile)"]

  ciudadano -->|"HTTPS"| pwa
  funcionario -->|"HTTPS"| pwa
  admin -->|"HTTPS"| pwa
  pwa -->|"Registra y usa"| sw
  pwa -->|"JSON/HTTPS · Authorization: Bearer JWT<br/>(también registra la suscripción push)"| api
  pwa -->|"Teselas (HTTPS, listadas en la CSP)"| osm
  sw -->|"Repite la petición de teselas (CORS, connect-src)"| osm
  api -->|"JDBC · Hibernate Spatial"| db
  api -->|"API S3 sobre HTTPS (AWS SDK v2)<br/>guarda, lee y borra; sirve /media/fotos y /api/perfiles/fotos"| r2
  api -->|"Archivos locales"| disco
  api -->|"HTTPS · POST /emails con clave de API"| resend
  api -->|"SMTP · JavaMailSender"| mailhog
  api -->|"HTTPS + VAPID (RFC 8292)"| push
  push -->|"Entrega el aviso (evento push)"| sw
  api -->|"HTTP · POST /v1/detecciones y /v1/moderacion (multipart)<br/>foto saneada · 0,5 s + 2,5 s · sin reintentos"| inferencia
  pwa -->|"Script e iframe del widget (CSP: challenges.cloudflare.com)"| turnstile
  api -->|"HTTPS · POST siteverify con CAPTCHA_SECRET"| turnstile

  classDef persona fill:#08427b,stroke:#052e56,color:#ffffff
  classDef contenedor fill:#438dd5,stroke:#2e6295,color:#ffffff
  classDef externo fill:#8a8a8a,stroke:#6b6b6b,color:#ffffff
  classDef desarrollo fill:#eef2f7,stroke:#6b7a90,color:#1f2937
  class ciudadano,funcionario,admin persona
  class pwa,sw,api,db,inferencia contenedor
  class r2,resend,push,osm,turnstile externo
  class disco,mailhog desarrollo
```

**Cómo leerlo.** Toda interacción pasa por la PWA, que llama al API con el JWT; el API es el único que escribe en PostgreSQL/PostGIS y el único que habla con el almacén de fotos, el correo y el servicio push. El respaldo diario de la base es el cron `respaldo-bd`, un servicio del despliegue (`c4-despliegue.md`) que no forma parte de la aplicación. Las fotos y el correo entran por un puerto de `common` (`FotoStorageService` y `CorreoSaliente`, §4.3) con dos adaptadores cada uno, elegidos por variable: en producción las fotos van a dos buckets privados de Cloudflare R2 por la API S3 y el correo sale por la API HTTP de Resend; en desarrollo, al disco y a Mailhog por SMTP. El perfil `prod` no arranca sin `FOTOS_ALMACEN`, `CORREO_TIPO`, `CAPTCHA_TIPO`, `CLASIFICACION_TIPO`, `MODERACION_TIPO` ni `ORIGEN_SECRETO`. El registro de cuenta (US-01) verifica el token de Cloudflare Turnstile por el puerto `auth/port/VerificadorDeCaptcha` (NC-08; Turnstile reemplazó a reCAPTCHA v2 en NC-08b, 28/10): en producción contra el `siteverify` de Cloudflare (`CAPTCHA_TIPO=turnstile`); en desarrollo y en los tests, `CAPTCHA_TIPO=ninguno`. La PWA carga el script y el iframe del widget desde `challenges.cloudflare.com` (`script-src`, `frame-src` y `connect-src`, por host), el único origen externo que el captcha suma a su CSP, y su Service Worker nunca cachea ese origen. Con cualquier adaptador las URL de las fotos son las mismas: el API sirve las de reporte en `/media/fotos/reportes/…` (públicas) y las de perfil en `/api/perfiles/fotos/…` (solo a su dueño), así que la PWA nunca habla con R2. Los correos salen después del commit, en el executor asíncrono acotado (D-13). La PWA suscribe el navegador con la clave pública VAPID y registra la suscripción en el API. Cuando cambia el estado de un reporte, el API envía el aviso al servicio push del navegador, que lo entrega al Service Worker para que muestre la notificación (US-21). La cola de reportes sin conexión vive en IndexedDB y la reenvía la página, no el Service Worker (ver `frontend/README.md`). La densidad de reportes (US-11) es pública y la PWA la dibuja como capa de calor en `/mapa`. En producción el Service Worker intercepta las teselas de OpenStreetMap y las repite con `fetch()`; por eso el host de teselas está también en `connect-src` y el mapa las pide con CORS (`frontend/README.md`, sección Mapa). El servicio de inferencia existe desde la v0.8.0 (NC-03a y NC-10a) y solo lo llama el API, con la foto ya saneada, por dos puertos. `clasificacion/infra/InferenciaHttpAdapter` (`/v1/detecciones`) sugiere la categoría (§4.3, D-08); si falla, el reporte queda «sin sugerencia». `moderacion/infra/InferenciaModeracionHttpAdapter` (`/v1/moderacion`) revisa la foto antes de guardarla; si falla al crear un reporte con foto, el API responde 503 (falla cerrada, D-15). Cada adaptador tiene su propio tope de 4 llamadas a la vez. En desarrollo y en los tests, `CLASIFICACION_TIPO=falso` y `MODERACION_TIPO=ninguna` evitan el servicio.
