-- =====================================================================
-- Seed: categorias de dano vial estandar (globales, distrito_id NULL).
-- Los distritos pueden agregar categorias personalizadas encima (US-29).
-- =====================================================================
INSERT INTO categoria_dano (nombre, descripcion, es_estandar, distrito_id, activo) VALUES
    ('Bache',                 'Bache o hueco en la calzada',              TRUE, NULL, TRUE),
    ('Vereda danada',         'Vereda rota, hundida o levantada',         TRUE, NULL, TRUE),
    ('Semaforo averiado',     'Semaforo apagado o con mal funcionamiento', TRUE, NULL, TRUE),
    ('Hueco en calzada',      'Deterioro profundo de la superficie vial', TRUE, NULL, TRUE),
    ('Senalizacion faltante', 'Senal de transito ausente o ilegible',     TRUE, NULL, TRUE),
    ('Pista deteriorada',     'Desgaste o agrietamiento del pavimento',   TRUE, NULL, TRUE);
