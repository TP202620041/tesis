# Benchmarking - Selección de Stack Tecnológico

Fuente: `TI_Leon_Fabrizio_Lopez_Mario.pdf`

## Backend

| Propuesta | Rendimiento (20%) | Integración (10%) | Seguridad (30%) | V. Desarrollo (0%) | Tiempo real (40%) | Total |
|---|---|---|---|---|---|---|
| Node.js + Express | 4 | 5 | 3 | 4 | 5 | 4.20 |
| Django | 3 | 4 | 5 | 4 | 3 | 3.70 |
| **Spring Boot** | 5 | 3 | 5 | 2 | 4 | **4.40** ✅ |
| FastAPI | 4 | 5 | 4 | 5 | 4 | 4.10 |

**Seleccionado: Spring Boot (Java)** — mejor seguridad y rendimiento bajo
alta concurrencia, crítico para datos ciudadanos sensibles de 43
municipalidades. Curva de aprendizaje mitigada con Spring Initializr y
documentación amplia.

## Frontend / PWA

| Propuesta | PWA Offline (30%) | Rendimiento (25%) | Mapas (15%) | Facilidad (15%) | Accesibilidad (15%) | Total |
|---|---|---|---|---|---|---|
| React.js | 4 | 4 | 5 | 4 | 4 | 4.15 |
| **Next.js** | 5 | 5 | 5 | 4 | 4 | **4.70** ✅ |
| Angular | 4 | 4 | 4 | 3 | 5 | 4.00 |
| Vue.js + Nuxt | 4 | 4 | 4 | 5 | 4 | 4.15 |

**Seleccionado: Next.js** — mejor soporte PWA offline-first (Service
Worker), mejor rendimiento vía SSR/SSG, integración directa con
ecosistema React de librerías de mapas.

## Base de Datos

| Propuesta | Geoespacial (30%) | Analítica (25%) | Consistencia (20%) | Escalabilidad (15%) | Integración (10%) | Total |
|---|---|---|---|---|---|---|
| **PostgreSQL + PostGIS** | 5 | 5 | 5 | 4 | 5 | **4.85** ✅ |
| MySQL | 2 | 4 | 5 | 4 | 5 | 3.70 |
| MongoDB | 4 | 3 | 3 | 5 | 4 | 3.70 |
| Firebase Firestore | 3 | 2 | 2 | 5 | 3 | 2.85 |

**Seleccionado: PostgreSQL + PostGIS** — puntaje más alto del
benchmarking completo. Único con soporte geoespacial nativo completo
(índices espaciales, consultas de proximidad, mapas de calor), garantías
ACID para auditoría municipal, integración madura con Spring Data JPA.

## Conclusión (stack final)

**Spring Boot (backend) + Next.js (frontend/PWA) + PostgreSQL/PostGIS (base de datos)**

Stack coherente, maduro, open source, adecuado al contexto universitario
y a los requisitos funcionales (geolocalización, offline-first,
auditoría, escalabilidad ante 43 distritos).
