-- ---------------------------------------------------------------------
-- V6 (US-27): etiqueta de posible reincidencia en el reporte. Se activa
-- cuando un comentario publico ciudadano sobre un reporte resuelto contiene
-- palabras clave que sugieren que el dano reaparecio, para que el
-- funcionario lo vea resaltado en su bandeja (US-13).
--
-- Compat. hacia atras (como V4/V5): columna nueva con default FALSE; las
-- filas existentes quedan sin marcar. La entidad Reporte solo SUMA el campo.
-- ---------------------------------------------------------------------
ALTER TABLE reporte
    ADD COLUMN posible_reincidencia BOOLEAN NOT NULL DEFAULT FALSE;
