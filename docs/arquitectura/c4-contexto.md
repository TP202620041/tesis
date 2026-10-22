# C4 · Nivel 1: contexto

> Diagrama **escrito a mano** a partir de `CLAUDE.md`, `ARCHITECTURE.md` y el código (`application.yml`, `application-prod.yml`, `next.config.ts`, `docker-compose.yml`). `/diagramas` no lo regenera: revísalo cuando cambie un actor o un sistema externo. Los sistemas externos son los de producción; en desarrollo las fotos van al disco y el correo a Mailhog por SMTP ([c4-contenedores.md](c4-contenedores.md)).

```mermaid
flowchart TB
  ciudadano(["Ciudadano<br/>Reporta daños viales con foto y GPS, sigue sus reportes y califica la atención"])
  funcionario(["Funcionario municipal<br/>Gestiona la bandeja de su distrito: estados, responsable y categorías"])
  admin(["ADMIN<br/>Atiende los tickets de soporte y puede consultar cualquier reporte"])

  viasegura["Ciudad Viva<br/>Crowdsourcing geoespacial de daños viales en Lima Metropolitana: asigna cada reporte a su distrito y publica un índice de desempeño"]

  r2["Cloudflare R2<br/>Almacenamiento de objetos: fotos de reportes y de perfil, y respaldos de la base (buckets privados)"]
  resend["Resend<br/>API de correo: notificaciones, recuperación de contraseña y respuestas de soporte"]
  push["Servicio Web Push del navegador<br/>FCM, Mozilla, WNS o Apple"]
  osm["Teselas de OpenStreetMap<br/>Mapa base"]

  ciudadano -->|"Reporta, consulta y califica (HTTPS)"| viasegura
  funcionario -->|"Gestiona reportes y ve su dashboard (HTTPS)"| viasegura
  admin -->|"Responde tickets (HTTPS)"| viasegura
  viasegura -->|"Guarda y lee fotos; sube respaldos (API S3 sobre HTTPS)"| r2
  viasegura -->|"Envía correos (HTTPS, API de Resend)"| resend
  viasegura -->|"Envía avisos push (HTTPS + VAPID)"| push
  viasegura -->|"Pide teselas (HTTPS)"| osm
  resend -->|"Correo"| ciudadano
  push -->|"Aviso en el dispositivo"| ciudadano

  classDef persona fill:#08427b,stroke:#052e56,color:#ffffff
  classDef sistema fill:#1168bd,stroke:#0b4884,color:#ffffff
  classDef externo fill:#8a8a8a,stroke:#6b6b6b,color:#ffffff
  class ciudadano,funcionario,admin persona
  class viasegura sistema
  class r2,resend,push,osm externo
```

**Cómo leerlo.** Los tres actores usan Ciudad Viva desde el navegador; el sistema depende de cuatro servicios externos: Cloudflare R2 para guardar las fotos y los respaldos de la base, Resend para enviar los correos, el servicio push de cada navegador para los avisos y OpenStreetMap para el mapa base. Los buckets son privados: las fotos se sirven desde el propio sistema, con las mismas URL, y los respaldos solo se suben (restaurarlos es manual, desde el panel de R2: `docs/despliegue.md` §8). El mapa de reportes y el índice de desempeño también son públicos: cualquiera los consulta sin cuenta.
