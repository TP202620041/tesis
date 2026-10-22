# C4 · Nivel 2: contenedores

> Diagrama **escrito a mano** a partir de `CLAUDE.md`, `ARCHITECTURE.md` (§4.3, §6 y §7) y el código (`application.yml`, `application-prod.yml`, `docker-compose.yml`). `/diagramas` no lo regenera: revísalo cuando aparezca un contenedor o cambie un protocolo. Las líneas punteadas son lo que todavía no existe; las cajas claras, lo que solo se usa en desarrollo. Dónde corre cada contenedor en producción: [c4-despliegue.md](c4-despliegue.md).

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
    inferencia["Servicio de inferencia (planificado, NC-03)<br/>FastAPI + ONNX en CPU<br/>inferencia/"]
  end

  r2[("Cloudflare R2 · producción<br/>buckets privados: fotos de reportes y de perfil<br/>S3FotoStorageService (FOTOS_ALMACEN=s3)")]
  resend["Resend · producción<br/>API HTTP de correo<br/>ResendCorreoAdapter (CORREO_TIPO=resend)"]
  mailhog["Mailhog · desarrollo<br/>SMTP 1025, UI 8025<br/>SmtpCorreoAdapter (CORREO_TIPO=smtp)"]
  push["Servicio Web Push del navegador"]
  osm["Teselas de OpenStreetMap"]

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
  api -.->|"POST /v1/detecciones (multipart)"| inferencia

  classDef persona fill:#08427b,stroke:#052e56,color:#ffffff
  classDef contenedor fill:#438dd5,stroke:#2e6295,color:#ffffff
  classDef externo fill:#8a8a8a,stroke:#6b6b6b,color:#ffffff
  classDef desarrollo fill:#eef2f7,stroke:#6b7a90,color:#1f2937
  classDef planificado fill:#ffffff,stroke:#438dd5,stroke-dasharray:5 5,color:#2e6295
  class ciudadano,funcionario,admin persona
  class pwa,sw,api,db contenedor
  class r2,resend,push,osm externo
  class disco,mailhog desarrollo
  class inferencia planificado
```

**Cómo leerlo.** Toda interacción pasa por la PWA, que llama al API con el JWT; el API es el único que toca PostgreSQL/PostGIS, el almacén de fotos, el correo y el servicio push. Las fotos y el correo entran por un puerto de `common` (`FotoStorageService` y `CorreoSaliente`, §4.3) con dos adaptadores cada uno, elegidos por variable: en producción las fotos van a dos buckets privados de Cloudflare R2 por la API S3 y el correo sale por la API HTTP de Resend; en desarrollo, al disco y a Mailhog por SMTP. El perfil `prod` no arranca sin `FOTOS_ALMACEN` ni `CORREO_TIPO`. Con cualquier adaptador las URL de las fotos son las mismas: el API sirve las de reporte en `/media/fotos/reportes/…` (públicas) y las de perfil en `/api/perfiles/fotos/…` (solo a su dueño), así que la PWA nunca habla con R2. Los correos salen después del commit, en el executor asíncrono acotado (D-13). La PWA suscribe el navegador con la clave pública VAPID y registra la suscripción en el API. Cuando cambia el estado de un reporte, el API envía el aviso al servicio push del navegador, que lo entrega al Service Worker para que muestre la notificación (US-21). La cola de reportes sin conexión vive en IndexedDB y la reenvía la página, no el Service Worker (ver `frontend/README.md`). La densidad de reportes (US-11) es pública y la PWA la dibuja como capa de calor en `/mapa`. En producción el Service Worker intercepta las teselas de OpenStreetMap y las repite con `fetch()`; por eso el host de teselas está también en `connect-src` y el mapa las pide con CORS (`frontend/README.md`, sección Mapa). El servicio de inferencia está planificado: el API lo llamará por `clasificacion/infra` para sugerir la categoría de la foto (§4.3, D-08).
