-- ---------------------------------------------------------------------
-- V22 (US-02 Esc. 2): bloqueo temporal tras intentos fallidos de inicio
-- de sesion.
--
-- Una fila por correo (normalizado: sin espacios y en minusculas), exista
-- o no la cuenta: asi el bloqueo se comporta igual para un correo sin
-- cuenta y no revela cuales estan registrados. No tiene FK a usuario por
-- la misma razon.
--
--   fallidos         intentos fallidos seguidos dentro de la ventana.
--   ultimo_fallo     el ultimo; un fallo fuera de la ventana reinicia la
--                    cuenta en 1.
--   bloqueado_hasta  hasta cuando se rechaza todo intento, aun con la
--                    contrasena correcta. NULL = sin bloqueo.
--
-- Un inicio de sesion correcto borra la fila. La politica (5 intentos,
-- 15 minutos) vive en auth/domain/PoliticaDeBloqueoDeLogin.
-- ---------------------------------------------------------------------
CREATE TABLE intento_login (
    email            VARCHAR(150) PRIMARY KEY,
    fallidos         INTEGER      NOT NULL CHECK (fallidos >= 0),
    ultimo_fallo     TIMESTAMPTZ  NOT NULL,
    bloqueado_hasta  TIMESTAMPTZ
);
