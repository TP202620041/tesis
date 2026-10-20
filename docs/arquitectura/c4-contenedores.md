# C4 · Nivel 2: contenedores

> Diagrama **escrito a mano** a partir de `CLAUDE.md`, `ARCHITECTURE.md` (§6 y §7) y el código. `/diagramas` no lo regenera: revísalo cuando aparezca un contenedor o cambie un protocolo. Las líneas punteadas son lo que todavía no existe.

```mermaid
flowchart TB
  ciudadano(["Ciudadano"])
  funcionario(["Funcionario municipal"])
  admin(["ADMIN"])

  subgraph viasegura["Ciudad Viva"]
    pwa["PWA<br/>Next.js 16 · React 19 · App Router<br/>frontend/"]
    sw["Service Worker<br/>Serwist: precache del App Shell (el API nunca se cachea)<br/>muestra los avisos push y abre la página al hacer clic"]
    api["API REST<br/>Spring Boot 3.4 · Java 21 · JWT<br/>backend/ · OpenAPI en /v3/api-docs<br/>GET públicos sin token: reportes, densidad del mapa de calor (US-11), catálogos, fotos"]
    db[("PostgreSQL 16 + PostGIS 3.4<br/>Esquema por Flyway · índice GiST · vista materializada del índice")]
    fotos[("Fotos en disco<br/>common/infra/LocalFotoStorageService")]
    inferencia["Servicio de inferencia (planificado, NC-03)<br/>FastAPI + ONNX en CPU<br/>inferencia/"]
  end

  smtp["Servidor SMTP<br/>Mailhog en desarrollo (SMTP 1025, UI 8025)"]
  push["Servicio Web Push del navegador"]
  osm["Teselas de OpenStreetMap"]

  ciudadano -->|"HTTPS"| pwa
  funcionario -->|"HTTPS"| pwa
  admin -->|"HTTPS"| pwa
  pwa -->|"Registra y usa"| sw
  pwa -->|"JSON/HTTPS · Authorization: Bearer JWT<br/>(también registra la suscripción push)"| api
  pwa -->|"Teselas (HTTPS, listadas en la CSP)"| osm
  api -->|"JDBC · Hibernate Spatial"| db
  api -->|"Guarda y sirve /media/fotos"| fotos
  api -->|"SMTP · JavaMailSender"| smtp
  api -->|"HTTPS + VAPID (RFC 8292)"| push
  push -->|"Entrega el aviso (evento push)"| sw
  api -.->|"POST /v1/detecciones (multipart)"| inferencia

  classDef persona fill:#08427b,stroke:#052e56,color:#ffffff
  classDef contenedor fill:#438dd5,stroke:#2e6295,color:#ffffff
  classDef externo fill:#8a8a8a,stroke:#6b6b6b,color:#ffffff
  classDef planificado fill:#ffffff,stroke:#438dd5,stroke-dasharray:5 5,color:#2e6295
  class ciudadano,funcionario,admin persona
  class pwa,sw,api,db,fotos contenedor
  class smtp,push,osm externo
  class inferencia planificado
```

**Cómo leerlo.** Toda interacción pasa por la PWA, que llama al API con el JWT; el API es el único que toca PostgreSQL/PostGIS, el disco de fotos, el SMTP y el servicio push. La PWA suscribe el navegador con la clave pública VAPID y registra la suscripción en el API. Cuando cambia el estado de un reporte, el API envía el aviso al servicio push del navegador, que lo entrega al Service Worker para que muestre la notificación (US-21). La cola de reportes sin conexión vive en IndexedDB y la reenvía la página, no el Service Worker (ver `frontend/README.md`). La densidad de reportes (US-11) es pública; la PWA todavía no la consume. El servicio de inferencia está planificado: el API lo llamará por `clasificacion/infra` para sugerir la categoría de la foto (§4.3, D-08).
