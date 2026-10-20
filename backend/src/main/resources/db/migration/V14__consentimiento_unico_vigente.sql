-- ---------------------------------------------------------------------
-- V14 (NC-07b, D-12): a lo sumo UNA aceptacion sin revocar por usuario,
-- finalidad y version.
--
-- Sin esto, dos POST simultaneos de la misma aceptacion (doble clic, o el
-- Service Worker reintentando) dejaban dos filas iguales en el historial.
-- ConsentimientoService inserta con ON CONFLICT ... DO NOTHING sobre este
-- indice: el segundo pedido espera al primero, no inserta y responde 200.
--
-- Parcial (WHERE revocado_en IS NULL): una version revocada y luego
-- aceptada otra vez si deja fila nueva, que es lo que debe mostrar el
-- historial. Va en una migracion aparte porque V13 ya estaba aplicada.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX uk_consentimiento_vigente_version
    ON consentimiento (usuario_id, finalidad, version_documento)
    WHERE revocado_en IS NULL;
