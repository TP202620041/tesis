"""Servicio de inferencia de Ciudad Viva (NC-03): detecta daños viales en una foto.

Capas (ARCHITECTURE.md §6), de arriba hacia abajo:

- ``app.main``: raíz de composición (arma las piezas y crea la app FastAPI).
- ``app.api``: presentación (routers y esquemas Pydantic del contrato ``/v1``).
- ``app.application``: casos de uso (validar, preprocesar e invocar el modelo).
- ``app.infrastructure``: adaptadores (onnxruntime, Pillow, configuración).
- ``app.domain``: entidades, reglas puras y puertos, sin librerías de terceros.

La guarda es import-linter (``pyproject.toml``, ``lint-imports``).
"""
