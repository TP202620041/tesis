# Módulos y dependencias

> Lo que está entre los marcadores `generado` lo escribe `/diagramas` a partir del código; **no se edita a mano** (se pierde en la siguiente corrida). El texto fuera de los marcadores es manual.

Estos diagramas muestran el código **como es**, no como debería ser. Cuando una dependencia real no coincide con `ARCHITECTURE.md`, se dibuja igual, punteada y en rojo, y se lista debajo. No se corrige en el dibujo: si hay que cambiar la norma o el código, se registra con `/propuesta`.

## Backend: módulos de `pe.edu.upc.viasegura`

**Cómo leerlo.** Cada caja es un módulo con sus subpaquetes; una flecha `A → B` significa que alguna clase de `A` importa algo de `B`, y la etiqueta dice de qué subpaquetes de `B`. La comparación es con la tabla de §4.3 («Usa a») y con la regla de API pública: de otro módulo solo `service`, `domain`, `event`, `port` y `dto`. `common` es transversal: cualquier módulo puede usarlo y él no usa a ninguno. La guarda oficial es `ArquitecturaCapasTest` (ArchUnit); este diagrama solo mira los `import`.

<!-- generado:inicio modulos-backend -->
<!-- No editar a mano: lo regenera /diagramas (.claude/skills/diagramas/modulos-backend.mjs). -->

```mermaid
flowchart LR
  m_auth["auth<br/>controller · domain · dto · event · repository · service"]
  m_common["common<br/>config* · domain · exception* · geo* · infra · port · security*"]
  m_desempeno["desempeno<br/>controller · domain · dto · listener · repository · service"]
  m_distritos["distritos<br/>controller · domain · dto · infra · port · repository · service"]
  m_notificaciones["notificaciones<br/>controller · domain · dto · infra · listener · port · repository · service"]
  m_reportes["reportes<br/>controller · domain · dto · event · infra · port · repository · service"]
  m_soporte["soporte<br/>controller · domain · dto · repository · service"]
  m_auth -->|"domain, exception, port, security"| m_common
  m_auth -->|"domain, service"| m_distritos
  m_desempeno -.->|"domain, service (fuera de §4.3)"| m_auth
  m_desempeno -->|"exception"| m_common
  m_desempeno -.->|"domain, event, service (fuera de §4.3)"| m_reportes
  m_distritos -->|"exception, geo"| m_common
  m_notificaciones -->|"domain, event, service"| m_auth
  m_notificaciones -->|"config, domain, exception"| m_common
  m_notificaciones -.->|"domain, event, service (fuera de §4.3)"| m_reportes
  m_reportes -->|"domain, service"| m_auth
  m_reportes -->|"domain, exception, geo, port"| m_common
  m_reportes -->|"domain, port"| m_distritos
  m_soporte -->|"domain, service"| m_auth
  m_soporte -->|"domain, exception"| m_common
  classDef transversal fill:#eef2f7,stroke:#6b7a90,color:#1f2937
  class m_common transversal
  linkStyle 2,4,8 stroke:#c62828,stroke-width:2px
```

| Origen | Destino | Subpaquetes usados | ¿Prevista en §4.3? |
|---|---|---|---|
| `auth` | `common` | `domain`, `exception`, `port`, `security` | sí (common es transversal) |
| `auth` | `distritos` | `domain`, `service` | sí |
| `desempeno` | `auth` | `domain`, `service` | **no** |
| `desempeno` | `common` | `exception` | sí (common es transversal) |
| `desempeno` | `reportes` | `domain`, `event`, `service` | **no** |
| `distritos` | `common` | `exception`, `geo` | sí (common es transversal) |
| `notificaciones` | `auth` | `domain`, `event`, `service` | sí |
| `notificaciones` | `common` | `config`, `domain`, `exception` | sí (common es transversal) |
| `notificaciones` | `reportes` | `domain`, `event`, `service` | **no** |
| `reportes` | `auth` | `domain`, `service` | sí |
| `reportes` | `common` | `domain`, `exception`, `geo`, `port` | sí (common es transversal) |
| `reportes` | `distritos` | `domain`, `port` | sí |
| `soporte` | `auth` | `domain`, `service` | sí |
| `soporte` | `common` | `domain`, `exception` | sí (common es transversal) |

Subpaquetes marcados con `*`: fuera de la lista estándar de §4.1. `common`: `config`, `exception`, `geo`, `security`.

Módulos de §4.3 que todavía no existen en el código: `clasificacion` (nuevo), `municipalidades` (nuevo).

**Diferencias con §4.3** (se dibujan como son; si hay que cambiar la norma o el código, `/propuesta`):

- `desempeno` → `auth`: §4.3 no prevé que desempeno use a auth.
- `desempeno` → `reportes`: §4.3 limita desempeno → reportes a event y usa domain (desempeno/listener/IndiceDesempenoRefreshListener.java).
- `desempeno` → `reportes`: §4.3 limita desempeno → reportes a event y usa service (desempeno/service/DesempenoService.java).
- `notificaciones` → `reportes`: §4.3 limita notificaciones → reportes a event y usa domain (notificaciones/domain/Notificacion.java, notificaciones/service/NotificacionService.java).
- `notificaciones` → `reportes`: §4.3 limita notificaciones → reportes a event y usa service (notificaciones/service/NotificacionService.java).
<!-- generado:fin modulos-backend -->

## Frontend: features, compartidos y rutas

**Cómo leerlo.** El primer diagrama muestra qué features y compartidos usa cada grupo de rutas de `app/`; el segundo, cómo se relacionan las features con `lib/`, `map/`, `pwa/` y `components/`. La etiqueta de una flecha hacia una feature dice qué capa usa (`components`, `hooks`, `model`, `api.ts`); hacia un compartido, qué archivo. No se cuentan los tests ni los tipos generados, ni los imports dentro de una misma feature. La medición oficial de capas es la de `eslint.capas.mjs` (`/verificar`).

<!-- generado:inicio features-frontend -->
<!-- No editar a mano: lo regenera /diagramas (.claude/skills/diagramas/features-frontend.mjs). -->

### Rutas (app/) hacia features y compartidos

```mermaid
flowchart LR
  subgraph g_app_rutas["app/ (rutas)"]
    n_app["app"]
    n_app_admin["app/(admin)"]
    n_app_auth["app/(auth)"]
    n_app_ciudadano["app/(ciudadano)"]
    n_app_cuenta["app/(cuenta)"]
    n_app_municipal["app/(municipal)"]
    n_app_public["app/(public)"]
    n_app_sesion["app/sesion"]
  end
  subgraph g_features["features/"]
    n_features_auth["features/auth<br/>api.ts · components · fotoPerfil (fuera de capa) · hooks · model"]
    n_features_desempeno["features/desempeno<br/>api.ts · components · hooks · model"]
    n_features_gestion["features/gestion<br/>api.ts · components · hooks · model"]
    n_features_legal["features/legal<br/>components"]
    n_features_reportes["features/reportes<br/>api.ts · components · hooks · model"]
    n_features_soporte["features/soporte<br/>api.ts · components · hooks · model"]
  end
  subgraph g_compartidos["compartidos"]
    n_map["map"]
    n_pwa["pwa"]
  end
  n_app -->|"hooks"| n_features_auth
  n_app -->|"components, hooks"| n_features_reportes
  n_app -->|"ProveedorPwa"| n_pwa
  n_app_admin -->|"components, model"| n_features_auth
  n_app_admin -->|"components"| n_features_soporte
  n_app_auth -->|"components"| n_features_auth
  n_app_ciudadano -->|"components, hooks"| n_features_auth
  n_app_ciudadano -->|"components"| n_features_reportes
  n_app_cuenta -->|"components, hooks, model"| n_features_auth
  n_app_cuenta -->|"components"| n_features_legal
  n_app_cuenta -->|"components"| n_features_soporte
  n_app_municipal -->|"components, model"| n_features_auth
  n_app_municipal -->|"components"| n_features_desempeno
  n_app_municipal -->|"components"| n_features_gestion
  n_app_public -->|"hooks, model"| n_features_auth
  n_app_public -->|"components"| n_features_desempeno
  n_app_public -->|"components"| n_features_legal
  n_app_public -->|"components, hooks, model"| n_features_reportes
  n_app_public -->|"MapaReportes"| n_map
  n_app_sesion -->|"components, hooks"| n_features_auth
```

### Features y compartidos

```mermaid
flowchart LR
  subgraph g_features["features/"]
    n_features_auth["features/auth<br/>api.ts · components · fotoPerfil (fuera de capa) · hooks · model"]
    n_features_desempeno["features/desempeno<br/>api.ts · components · hooks · model"]
    n_features_gestion["features/gestion<br/>api.ts · components · hooks · model"]
    n_features_legal["features/legal<br/>components"]
    n_features_reportes["features/reportes<br/>api.ts · components · hooks · model"]
    n_features_soporte["features/soporte<br/>api.ts · components · hooks · model"]
  end
  subgraph g_compartidos["compartidos"]
    n_components["components"]
    n_lib_api["lib/api"]
    n_lib_auth["lib/auth"]
    n_lib_hooks["lib/hooks"]
    n_lib_sesion["lib/sesion"]
    n_lib_types["lib/types"]
    n_map["map"]
    n_pwa["pwa"]
  end
  n_components -->|"domain, estados"| n_lib_types
  n_features_auth -->|"ui/form"| n_components
  n_features_auth -->|"catalogos, client, errors, generated/schema"| n_lib_api
  n_features_auth -->|"token-storage"| n_lib_auth
  n_features_auth -->|"useCarga"| n_lib_hooks
  n_features_auth -->|"antesDeCerrarSesion"| n_lib_sesion
  n_features_auth -->|"domain"| n_lib_types
  n_features_auth -->|"cachesDeSesion, push"| n_pwa
  n_features_desempeno -->|"ui/form"| n_components
  n_features_desempeno -->|"catalogos, client, generated/schema"| n_lib_api
  n_features_desempeno -->|"useCarga"| n_lib_hooks
  n_features_desempeno -->|"domain"| n_lib_types
  n_features_gestion -->|"LineaDeTiempo, ui/form"| n_components
  n_features_gestion -->|"catalogos, client, errors, generated/schema"| n_lib_api
  n_features_gestion -->|"useCarga"| n_lib_hooks
  n_features_gestion -->|"domain, estados, fechas"| n_lib_types
  n_features_legal -->|"model"| n_features_auth
  n_features_reportes -->|"LineaDeTiempo, ui/form"| n_components
  n_features_reportes -->|"catalogos, client, errors, generated/schema"| n_lib_api
  n_features_reportes -->|"token-storage"| n_lib_auth
  n_features_reportes -->|"useCarga"| n_lib_hooks
  n_features_reportes -->|"antesDeCerrarSesion"| n_lib_sesion
  n_features_reportes -->|"domain, estados, fechas"| n_lib_types
  n_features_reportes -->|"MapaSelectorUbicacion"| n_map
  n_features_reportes -->|"colaReportes"| n_pwa
  n_features_soporte -->|"ui/form"| n_components
  n_features_soporte -->|"client, errors, generated/schema"| n_lib_api
  n_features_soporte -->|"useCarga"| n_lib_hooks
  n_features_soporte -->|"domain"| n_lib_types
  n_lib_api -->|"token-storage"| n_lib_auth
  n_lib_api -->|"domain"| n_lib_types
  n_lib_hooks -->|"errors"| n_lib_api
  n_lib_types -->|"generated/schema"| n_lib_api
  n_map -->|"model"| n_features_reportes
  n_map -->|"client"| n_lib_api
  n_map -->|"estados"| n_lib_types
  n_pwa -->|"model"| n_features_reportes
```

| Origen | Destino | Qué usa | ¿Permitido por §5? |
|---|---|---|---|
| `app` | `features/auth` | `hooks` | sí |
| `app` | `features/reportes` | `components`, `hooks` | sí |
| `app` | `pwa` | `ProveedorPwa` | sí |
| `app/(admin)` | `features/auth` | `components`, `model` | sí |
| `app/(admin)` | `features/soporte` | `components` | sí |
| `app/(auth)` | `features/auth` | `components` | sí |
| `app/(ciudadano)` | `features/auth` | `components`, `hooks` | sí |
| `app/(ciudadano)` | `features/reportes` | `components` | sí |
| `app/(cuenta)` | `features/auth` | `components`, `hooks`, `model` | sí |
| `app/(cuenta)` | `features/legal` | `components` | sí |
| `app/(cuenta)` | `features/soporte` | `components` | sí |
| `app/(municipal)` | `features/auth` | `components`, `model` | sí |
| `app/(municipal)` | `features/desempeno` | `components` | sí |
| `app/(municipal)` | `features/gestion` | `components` | sí |
| `app/(public)` | `features/auth` | `hooks`, `model` | sí |
| `app/(public)` | `features/desempeno` | `components` | sí |
| `app/(public)` | `features/legal` | `components` | sí |
| `app/(public)` | `features/reportes` | `components`, `hooks`, `model` | sí |
| `app/(public)` | `map` | `MapaReportes` | sí |
| `app/sesion` | `features/auth` | `components`, `hooks` | sí |
| `components` | `lib/types` | `domain`, `estados` | sí |
| `features/auth` | `components` | `ui/form` | sí |
| `features/auth` | `lib/api` | `catalogos`, `client`, `errors`, `generated/schema` | sí |
| `features/auth` | `lib/auth` | `token-storage` | sí |
| `features/auth` | `lib/hooks` | `useCarga` | sí |
| `features/auth` | `lib/sesion` | `antesDeCerrarSesion` | sí |
| `features/auth` | `lib/types` | `domain` | sí |
| `features/auth` | `pwa` | `cachesDeSesion`, `push` | sí |
| `features/desempeno` | `components` | `ui/form` | sí |
| `features/desempeno` | `lib/api` | `catalogos`, `client`, `generated/schema` | sí |
| `features/desempeno` | `lib/hooks` | `useCarga` | sí |
| `features/desempeno` | `lib/types` | `domain` | sí |
| `features/gestion` | `components` | `LineaDeTiempo`, `ui/form` | sí |
| `features/gestion` | `lib/api` | `catalogos`, `client`, `errors`, `generated/schema` | sí |
| `features/gestion` | `lib/hooks` | `useCarga` | sí |
| `features/gestion` | `lib/types` | `domain`, `estados`, `fechas` | sí |
| `features/legal` | `features/auth` | `model` | sí |
| `features/reportes` | `components` | `LineaDeTiempo`, `ui/form` | sí |
| `features/reportes` | `lib/api` | `catalogos`, `client`, `errors`, `generated/schema` | sí |
| `features/reportes` | `lib/auth` | `token-storage` | sí |
| `features/reportes` | `lib/hooks` | `useCarga` | sí |
| `features/reportes` | `lib/sesion` | `antesDeCerrarSesion` | sí |
| `features/reportes` | `lib/types` | `domain`, `estados`, `fechas` | sí |
| `features/reportes` | `map` | `MapaSelectorUbicacion` | sí |
| `features/reportes` | `pwa` | `colaReportes` | sí |
| `features/soporte` | `components` | `ui/form` | sí |
| `features/soporte` | `lib/api` | `client`, `errors`, `generated/schema` | sí |
| `features/soporte` | `lib/hooks` | `useCarga` | sí |
| `features/soporte` | `lib/types` | `domain` | sí |
| `lib/api` | `lib/auth` | `token-storage` | sí |
| `lib/api` | `lib/types` | `domain` | sí |
| `lib/hooks` | `lib/api` | `errors` | sí |
| `lib/types` | `lib/api` | `generated/schema` | sí |
| `map` | `features/reportes` | `model` | sí |
| `map` | `lib/api` | `client` | sí |
| `map` | `lib/types` | `estados` | sí |
| `pwa` | `features/reportes` | `model` | sí |

**Diferencias con §5** (se dibujan como son; la cifra oficial es la de `eslint.capas.mjs` en `/verificar`):

- `features/auth/fotoPerfil.ts` está fuera de components/, hooks/, model/ y api.ts (§5.1).
<!-- generado:fin features-frontend -->
