# project-context

Repositorio de contexto y prompts para arrancar el proyecto de tesis
**"Sistema de crowdsourcing geoespacial para el reporte ciudadano y la
gestión municipal de infraestructura vial en Lima Metropolitana"**.

Este repo no contiene código de la aplicación — contiene el **contexto
estructurado** (en TOML) que se usa para inicializar conversaciones con
IAs (Claude, GPT, etc.) antes de pedirles que generen código, diagramas o
documentos, evitando repetir el contexto completo cada vez.

## Estructura

```
project-context/
├── README.md
├── context/
│   ├── 00_research.toml       # Prompt 1: trabajo de investigación
│   ├── 01_stack.toml          # Prompt 2: stack tecnológico
│   ├── 02_eda.toml            # Prompt 3: modelo de datos
│   └── 03_scaffolding.toml    # Prompt 4: estructura y patrones
├── backlog/
│   └── product_backlog.md     # Product Backlog completo (épicas + historias)
└── decisions/
    └── benchmarking.md        # Benchmarking que sustenta el stack elegido
```

## Cómo usar los archivos `context/*.toml`

Cada archivo tiene tres bloques:

- `[meta]` — metadatos: orden de uso (`order`), de qué otros prompts depende
  (`depends_on`), qué modelo se recomienda (`recommended_model`), y el
  estado del prompt (`status`: `borrador` | `validado` | `en_uso`).
- `[prompt]` — el texto exacto (`content`) que se pega en el chat con la IA.
- `[notes]` — instrucciones de uso puntuales (ej. qué archivo adjuntar).

### Orden de uso

Los prompts se usan en secuencia, respetando `depends_on`:

1. `00_research.toml` → contexto del problema y objetivo del proyecto.
2. `01_stack.toml` → stack tecnológico definitivo y sus justificaciones.
3. `02_eda.toml` → modelo de datos / entidades (adjuntar `backlog/product_backlog.md`).
4. `03_scaffolding.toml` → estructura de carpetas y patrones de diseño.

Si la IA que usas no mantiene memoria entre mensajes, pega los prompts
anteriores (o un resumen) antes de continuar con el siguiente.

### Modelo recomendado

Los prompts marcan `recommended_model` como guía:

- `sonnet` → prompts de contexto/confirmación (00, 01), donde no se
  necesita razonamiento profundo, solo fijar información.
- `opus` → prompts de diseño con múltiples decisiones interdependientes
  (02, 03), donde conviene un modelo más capaz para sostener coherencia
  entre entidades, relaciones y patrones.

## Actualizar un prompt

Si cambias una decisión (ej. el stack o una entidad del EDA), actualiza el
`.toml` correspondiente y cambia su `status` a `en_uso` hasta volver a
validarlo con el equipo/asesor. Esto mantiene el repo como única fuente de
verdad del contexto del proyecto.
