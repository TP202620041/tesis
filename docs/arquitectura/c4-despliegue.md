# C4 · Despliegue del MVP

> Diagrama **escrito a mano** a partir de las propuestas aceptadas el 21/10 (`project-context/decisions/propuestas/2026-10-21-despliegue-mvp.md`, `2026-10-21-fotos-r2.md` y `2026-10-21-correo-saliente-http.md`), del runbook `docs/despliegue.md` y del código (`application-prod.yml`, `backend/Dockerfile`). `/diagramas` no lo regenera: revísalo cuando cambie un proveedor, un servicio de Railway o la forma de servir las fotos. Las líneas y cajas punteadas son lo que todavía no existe.

```mermaid
flowchart TB
  persona(["Ciudadano · funcionario · ADMIN"])
  publico(["Público anónimo<br/>mapa, detalle e índice"])

  dispositivo["Dispositivo<br/>navegador o PWA instalada, con su Service Worker<br/>guarda el JWT (localStorage) y la cola offline (IndexedDB)"]

  subgraph vercel["Vercel · plan Hobby · raíz frontend/ · rama de producción main"]
    pwa["Archivos de la PWA (Next.js 16)<br/>HTML, JS, CSS, manifest, iconos y sw.js<br/>dominio ciudadviva.app (www redirige a la raíz)<br/>NEXT_PUBLIC_API_BASE_URL=https://api.ciudadviva.app, horneada en el build y en la CSP"]
  end

  proxy["Cloudflare · DNS y proxy de api.ciudadviva.app<br/>nube naranja · SSL Full · no cachea lo privado<br/>(ciudadviva.app y www van sin proxy, directo a Vercel)"]

  subgraph railway["Railway · proyecto Ciudad Viva · entorno production"]
    api["backend<br/>contenedor Spring Boot 3.4 · Java 21 (backend/Dockerfile)<br/>perfil prod · FOTOS_ALMACEN=s3 · CORREO_TIPO=resend<br/>health check /actuator/health · PORT=8080<br/>dominio propio api.ciudadviva.app; *.up.railway.app solo para depurar"]
    db[("postgis<br/>postgis/postgis:16-3.4 + volumen<br/>solo red privada (*.railway.internal)")]
    respaldo["respaldo-bd<br/>cron diario 08:00 UTC (backend/scripts/respaldo-bd)<br/>pg_dump custom, validado con pg_restore --list"]
    inferencia["inferencia (planificado, NC-03a, v0.8.0)<br/>FastAPI + ONNX en CPU"]
  end

  subgraph cloudflare["Cloudflare R2"]
    fotos[("Buckets privados de fotos<br/>ciudadviva-fotos-reportes y ciudadviva-fotos-perfiles")]
    copias[("Bucket privado de respaldos<br/>ciudadviva-respaldos, expira a los 30 días")]
  end

  correo["Resend<br/>API HTTP de correo (POST /emails)<br/>remitente de un dominio verificado"]
  push["Servicios Web Push<br/>FCM, Mozilla, WNS, Apple"]
  osm["Teselas de OpenStreetMap"]
  github["GitHub<br/>main, develop y CI (Actions)"]

  persona -->|"Usa"| dispositivo
  publico -->|"Usa"| dispositivo
  dispositivo -->|"Descarga la app (HTTPS, ciudadviva.app)"| pwa
  dispositivo -->|"JSON/HTTPS + Bearer JWT · CORS<br/>fotos: /media/fotos/reportes/… y /api/perfiles/fotos/…"| proxy
  proxy -->|"HTTPS hacia el dominio de Railway"| api
  dispositivo -->|"Teselas (HTTPS, en la CSP)"| osm
  api -->|"JDBC por la red privada"| db
  api -->|"API S3 por HTTPS (AWS SDK v2)<br/>guarda, lee y borra; nunca expone el bucket"| fotos
  api -->|"HTTPS + clave de API (después del commit)"| correo
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
  class correo,push,osm,github,proxy externo
  class inferencia planificado
```

**Cómo leerlo.** La PWA corre en el **dispositivo** de cada persona (navegador o app instalada, con su Service Worker). Vercel solo le entrega los archivos estáticos de la app, desde `ciudadviva.app`, el único origen de la PWA. Las teselas de OpenStreetMap y los avisos push van directo entre el dispositivo y cada servicio. Las llamadas al API, en cambio, pasan por el proxy de Cloudflare de `api.ciudadviva.app` (decisión 3b; SSL Full, porque el modo estricto no funciona con Railway). Por eso la prueba de humo revisa que Cloudflare no cachee la foto de perfil ni otra respuesta privada (runbook §7.3, punto 16). El dispositivo habla con el API en Railway con el JWT. El API es el único que escribe en la base PostGIS, que no tiene puerto público y se alcanza por la red privada de Railway (el cron `respaldo-bd` solo la lee con `pg_dump`), y el único con credenciales de los buckets de fotos (`FOTOS_S3_*`, token de fotos; `respaldo-bd` usa su propio token, limitado a `ciudadviva-respaldos`): los buckets son privados y el API sirve las fotos con las mismas URLs de desarrollo, públicas las de reporte y solo para su dueño las de perfil, así que ni el contrato ni la CSP cambian. El correo sale por la API HTTP de Resend (`CORREO_API_KEY`), porque Railway Hobby bloquea el SMTP saliente; se envía después del commit, en el executor asíncrono del API. En el perfil `prod`, `FOTOS_ALMACEN` y `CORREO_TIPO` son obligatorias: sin ellas el API no arranca, para que un despliegue nunca guarde fotos en el disco efímero del contenedor ni intente un SMTP bloqueado. Railway solo consulta `/actuator/health` al desplegar, para cambiar de versión sin corte (responde `{"status":"UP"}` sin detalles), y su configuración vive en el panel, sin `railway.toml` (runbook §0). Los avisos push van del API al servicio push de cada navegador, que los entrega al Service Worker del dispositivo. Un servicio cron de Railway hace cada noche un `pg_dump` por la red privada y lo guarda en un bucket de respaldos separado. Vercel y Railway despliegan solos al fusionar en `main` (las versiones etiquetadas); la CI de GitHub corre las pruebas en cada PR. El servicio de inferencia está planificado (NC-03a, v0.8.0) y viviría en la misma red privada.
