-- ---------------------------------------------------------------------
-- V9 (US-25): agrega la respuesta del equipo de soporte al ticket.
-- Nullable: un ticket ABIERTO aun no tiene respuesta. Se persiste (no
-- solo se envia por correo) porque el ciudadano debe poder verla via
-- GET /api/soporte/tickets/mis-tickets, no solo en su bandeja de email.
-- ---------------------------------------------------------------------
ALTER TABLE ticket_soporte ADD COLUMN respuesta VARCHAR(2000);
