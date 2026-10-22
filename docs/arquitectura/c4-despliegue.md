# C4 · Despliegue del MVP

> Diagrama **escrito a mano** a partir de la propuesta `project-context/decisions/propuestas/2026-10-21-despliegue-mvp.md` (estado: abierta) y del runbook `docs/despliegue.md`. `/diagramas` no lo regenera: revísalo cuando cambie un proveedor, un servicio de Railway o la forma de servir las fotos. Las líneas y cajas punteadas son lo que todavía no existe.

```mermaid
flowchart TB
  persona(["Ciudadano · funcionario · ADMIN"])
  publico(["Público anónimo<br/>mapa, detalle e índice"])

  dispositivo["Dispositivo<br/>navegador o PWA instalada, con su Service Worker<br/>guarda el JWT (localStorage) y la cola offline (IndexedDB)"]

  subgraph vercel["Vercel · plan Hobby · raíz frontend/ · rama de producción main"]
    pwa["Archivos de la PWA (Next.js 16)<br/>HTML, JS, CSS, manifest, iconos y sw.js<br/>NEXT_PUBLIC_API_BASE_URL horneada en el build y en la CSP"]
  end

  subgraph railway["Railway · proyecto Ciudad Viva · entorno production"]
    api["backend<br/>contenedor Spring Boot 3.4 · Java 21 (Dockerfile)<br/>perfil prod · /actuator/health · dominio *.up.railway.app"]
    db[("postgis<br/>postgis/postgis:16-3.4 + volumen<br/>solo red privada (*.railway.internal)")]
    respaldo["respaldo-bd<br/>cron diario (plantilla Postgres S3 Backups): pg_dump"]
    inferencia["inferencia (planificado, NC-03)<br/>FastAPI + ONNX en CPU"]
  end

  subgraph cloudflare["Cloudflare R2"]
    fotos[("Buckets privados de fotos<br/>reportes y perfiles")]
    copias[("Bucket privado de respaldos<br/>con regla de expiración")]
  end

  correo["API de correo HTTP<br/>Brevo o Resend (por decidir)"]
  push["Servicios Web Push<br/>FCM, Mozilla, WNS, Apple"]
  osm["Teselas de OpenStreetMap"]
  github["GitHub<br/>main, develop y CI (Actions)"]

  persona -->|"Usa"| dispositivo
  publico -->|"Usa"| dispositivo
  dispositivo -->|"Descarga la app (HTTPS)"| pwa
  dispositivo -->|"JSON/HTTPS + Bearer JWT · CORS<br/>fotos: /media/fotos/reportes/… y /api/perfiles/fotos/…"| api
  dispositivo -->|"Teselas (HTTPS, en la CSP)"| osm
  api -->|"JDBC por la red privada"| db
  api -->|"API S3 por HTTPS (AWS SDK v2)<br/>guarda y lee; nunca expone el bucket"| fotos
  api -->|"HTTPS + clave de API"| correo
  api -->|"HTTPS + VAPID"| push
  push -->|"Entrega el aviso al Service Worker"| dispositivo
  api -.->|"POST /v1/detecciones (red privada)"| inferencia
  respaldo -->|"pg_dump por la red privada"| db
  respaldo -->|"Sube el volcado (API S3)"| copias
  github -->|"Despliega al fusionar en main"| pwa
  github -->|"Despliega al fusionar en main"| api

  classDef persona fill:#08427b,stroke:#052e56,color:#ffffff
  classDef contenedor fill:#438dd5,stroke:#2e6295,color:#ffffff
  classDef externo fill:#8a8a8a,stroke:#6b6b6b,color:#ffffff
  classDef planificado fill:#ffffff,stroke:#438dd5,stroke-dasharray:5 5,color:#2e6295
  class persona,publico persona
  class dispositivo,pwa,api,db,respaldo,fotos,copias contenedor
  class correo,push,osm,github externo
  class inferencia planificado
```

**Cómo leerlo.** La PWA corre en el **dispositivo** de cada persona (navegador o app instalada, con su Service Worker). Vercel solo le entrega los archivos estáticos de la app; las llamadas al API, las teselas de OpenStreetMap y los avisos push van directo entre el dispositivo y cada servicio. El dispositivo habla con el API en Railway con el JWT. El API es el único que toca la base PostGIS, que no tiene puerto público y se alcanza por la red privada de Railway, y el único que tiene credenciales de R2: los buckets son privados y el API sirve las fotos con las mismas URLs de hoy, públicas las de reporte y solo para su dueño las de perfil, así que ni el contrato ni la CSP cambian. El correo sale por la API HTTP de un proveedor (Railway Hobby bloquea el SMTP saliente). Los avisos push van del API al servicio push de cada navegador, que los entrega al Service Worker del dispositivo. Un servicio cron de Railway hace cada noche un `pg_dump` por la red privada y lo guarda en un bucket de respaldos separado. Vercel y Railway despliegan solos al fusionar en `main` (las versiones etiquetadas); la CI de GitHub corre las pruebas en cada PR. El servicio de inferencia está planificado (NC-03) y viviría en la misma red privada.
