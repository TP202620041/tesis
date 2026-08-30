-- ---------------------------------------------------------------------
-- V10 (US-30): foto de perfil del usuario. Mismo patron que
-- reporte.foto_url (nullable, URL relativa devuelta por FotoStorageService).
-- ---------------------------------------------------------------------
ALTER TABLE usuario ADD COLUMN foto_url VARCHAR(500);
