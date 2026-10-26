"""Middleware ASGI que corta el cuerpo de la solicitud por encima de un máximo.

Starlette guarda en un archivo temporal todo el multipart antes de que el
endpoint lo lea, así que sin este corte un cliente podría llenar el disco o la
memoria con un archivo enorme. Se comprueba dos veces:

1. ``Content-Length`` declarado: se responde 413 sin leer nada.
2. Bytes recibidos (por si el cuerpo llega en trozos, sin ``Content-Length``):
   al pasar el máximo se lanza un ``HTTPException`` 413. FastAPI vuelve a
   lanzar los ``HTTPException`` que ocurren al leer el cuerpo, en vez de
   convertirlos en un 400 genérico.
"""

from __future__ import annotations

from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.api.errores import respuesta_de_error

_MENSAJE = "La solicitud supera el máximo de {max} bytes."


class LimiteDeCuerpo:
    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declarado = _content_length(scope)
        if declarado is not None and declarado > self.max_bytes:
            respuesta = respuesta_de_error(413, "imagen_demasiado_grande", _MENSAJE.format(max=self.max_bytes))
            await respuesta(scope, receive, send)
            return

        recibidos = 0

        async def recibir_con_limite() -> Message:
            nonlocal recibidos
            mensaje = await receive()
            if mensaje["type"] == "http.request":
                recibidos += len(mensaje.get("body", b""))
                if recibidos > self.max_bytes:
                    raise HTTPException(status_code=413, detail=_MENSAJE.format(max=self.max_bytes))
            return mensaje

        await self.app(scope, recibir_con_limite, send)


def _content_length(scope: Scope) -> int | None:
    for nombre, valor in scope.get("headers", []):
        if nombre == b"content-length":
            try:
                return int(valor)
            except ValueError:
                return None
    return None
