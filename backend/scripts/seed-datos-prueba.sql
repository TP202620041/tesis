-- Datos de prueba de Ciudad Viva para la BD LOCAL de desarrollo (viasegura). Nunca en otro entorno.
-- Idempotente: borra y recrea los reportes marcados "[seed]".
--
-- Requisito: los usuarios ya existen, creados por el API para que la contraseña quede con hash.
-- Contraseña de todos: Prueba123!
--   for u in ciudadano1 ciudadano2 ciudadano3 ciudadano4 ciudadano5 ciudadano6 ciudadano7 ciudadano8 \
--            func.miraflores func.surco func.sjl func.ate func.lima func.comas admin; do
--     curl -s -o /dev/null -w "$u %{http_code}\n" -X POST localhost:8080/api/auth/registro \
--       -H 'Content-Type: application/json' \
--       -d "{\"email\":\"$u@viasegura.test\",\"password\":\"Prueba123!\",\"nombre\":\"x\",\"apellido\":\"x\",\"aceptaTerminos\":true,\"versionTerminos\":\"2026-10-v1\"}"
--   done
-- Uso: docker exec -i viasegura-db psql -U viasegura -d viasegura -v ON_ERROR_STOP=1 -q < backend/scripts/seed-datos-prueba.sql
-- Este script asigna roles y distritos (los func.* son FUNCIONARIO_MUNICIPAL; admin es ADMIN).
-- Desde NC-02 (V17) los reportes llevan titulo, severidad y periodo_gestion_id (nulo fuera de todo periodo).
BEGIN;

-- Nombres legibles y roles. Desde NC-09 (V20) el registro crea la cuenta sin
-- confirmar y sin confirmar no se puede iniciar sesion: las de prueba se dan
-- por confirmadas aqui (el dominio .test no recibe correo).
UPDATE usuario SET nombre = initcap(split_part(email, '@', 1)), apellido = 'Prueba',
       correo_confirmado = TRUE, correo_confirmado_en = coalesce(correo_confirmado_en, now())
 WHERE email LIKE '%@viasegura.test';
UPDATE usuario SET nombre = 'Admin', rol = 'ADMIN' WHERE email = 'admin@viasegura.test';
UPDATE usuario u SET rol = 'FUNCIONARIO_MUNICIPAL', nombre = 'Funcionario', apellido = d.nombre, distrito_id = d.id
  FROM (VALUES ('func.miraflores@viasegura.test', 21), ('func.surco@viasegura.test', 8),
               ('func.sjl@viasegura.test', 41), ('func.ate@viasegura.test', 9),
               ('func.lima@viasegura.test', 37), ('func.comas@viasegura.test', 12)) v(email, did)
  JOIN distrito d ON d.id = v.did
 WHERE u.email = v.email;

-- Limpia una corrida anterior del seed
DELETE FROM calificacion WHERE reporte_id IN (SELECT id FROM reporte WHERE descripcion LIKE '[seed]%');
DELETE FROM comentario_publico WHERE reporte_id IN (SELECT id FROM reporte WHERE descripcion LIKE '[seed]%');
DELETE FROM historial_estado_reporte WHERE reporte_id IN (SELECT id FROM reporte WHERE descripcion LIKE '[seed]%');
DELETE FROM asignacion_responsable WHERE reporte_id IN (SELECT id FROM reporte WHERE descripcion LIKE '[seed]%');
DELETE FROM adhesion_reporte WHERE reporte_id IN (SELECT id FROM reporte WHERE descripcion LIKE '[seed]%');
DELETE FROM notificacion WHERE reporte_id IN (SELECT id FROM reporte WHERE descripcion LIKE '[seed]%');
DELETE FROM reporte WHERE descripcion LIKE '[seed]%';

SELECT setseed(0.42);

-- Perfil por distrito: cuántos reportes y qué tan bien gestiona (para que el índice compare)
CREATE TEMP TABLE perfil(did int, n int, p_resuelto float, p_proceso float, horas_min int, horas_max int, sat_base int) ON COMMIT DROP;
INSERT INTO perfil VALUES
  (21, 18, 0.70, 0.15,  24, 120, 4),  -- Miraflores: buena gestión
  (43, 12, 0.65, 0.20,  24, 150, 4),  -- San Isidro
  ( 8, 20, 0.50, 0.25,  48, 240, 4),  -- Surco
  (33,  8, 0.55, 0.20,  36, 200, 4),  -- Barranco
  (37, 25, 0.35, 0.30,  72, 480, 3),  -- Lima
  (41, 28, 0.25, 0.30, 120, 720, 2),  -- SJL: gestión lenta
  ( 9, 16, 0.30, 0.25,  96, 600, 3),  -- Ate
  (12, 14, 0.20, 0.30, 150, 800, 2),  -- Comas
  (10, 10, 0.40, 0.25,  72, 360, 3),  -- Los Olivos
  ( 7,  9, 0.15, 0.35, 200, 900, 2),  -- Villa El Salvador
  (35,  6, 0.30, 0.30, 100, 500, 3);  -- SJM

CREATE TEMP TABLE nuevos ON COMMIT DROP AS
SELECT p.did, gs.i, (ST_Dump(ST_GeneratePoints(d.limites::geometry, 1, (p.did * 1000 + gs.i)))).geom AS punto,
       random() AS r_estado, random() AS r_cat, random() AS r_usr, random() AS r_dias, random() AS r_horas, random() AS r_sat,
       p.p_resuelto, p.p_proceso, p.horas_min, p.horas_max, p.sat_base
  FROM perfil p
  JOIN distrito d ON d.id = p.did
  CROSS JOIN LATERAL generate_series(1, p.n) gs(i);

CREATE TEMP TABLE ciud ON COMMIT DROP AS
SELECT id, row_number() OVER (ORDER BY id) - 1 AS k FROM usuario WHERE email LIKE 'ciudadano%@viasegura.test';

CREATE TEMP TABLE ins ON COMMIT DROP AS
WITH base AS (
  SELECT n.*,
         (SELECT id FROM ciud WHERE k = floor(n.r_usr * (SELECT count(*) FROM ciud))::int) AS creador,
         1 + floor(n.r_cat * 6)::int AS cat,
         now() - make_interval(days => 3 + floor(n.r_dias * 85)::int, hours => floor(random() * 24)::int) AS creado,
         CASE WHEN n.r_estado < n.p_resuelto THEN 'RESUELTO'
              WHEN n.r_estado < n.p_resuelto + n.p_proceso THEN 'EN_PROCESO'
              WHEN n.r_estado < n.p_resuelto + n.p_proceso + 0.12 THEN 'RECIBIDO'
              WHEN n.r_estado > 0.96 THEN 'RECHAZADO'
              ELSE 'PENDIENTE' END AS estado
    FROM nuevos n
)
SELECT b.*, b.creado + make_interval(hours => b.horas_min + floor(b.r_horas * (b.horas_max - b.horas_min))::int) AS resuelto
  FROM base b;

-- Si la resolución caería en el futuro, se recorta a "hace 1 hora"
UPDATE ins SET resuelto = LEAST(resuelto, now() - interval '1 hour');

CREATE TEMP TABLE rep ON COMMIT DROP AS
WITH x AS (
  INSERT INTO reporte (ubicacion, foto_url, titulo, severidad, periodo_gestion_id, descripcion, categoria_id, estado,
                       distrito_id, creador_id, total_adhesiones, resolved_at, created_at, updated_at)
  SELECT punto::geography, NULL,
         (ARRAY['Bache profundo en la vía', 'Vereda rota frente a paradero', 'Semáforo sin funcionar en cruce',
                'Hueco peligroso para motos', 'Falta señal de pare', 'Asfalto deteriorado en todo el tramo'])[cat],
         (ARRAY['BAJA', 'MEDIA', 'ALTA'])[1 + floor(random() * 3)::int],
         (SELECT p.id FROM periodo_gestion p
           WHERE (creado AT TIME ZONE 'America/Lima')::date BETWEEN p.fecha_inicio AND p.fecha_fin LIMIT 1),
         '[seed] ' || (ARRAY['Bache profundo en la vía', 'Vereda rota frente a paradero', 'Semáforo sin funcionar en cruce',
                             'Hueco peligroso para motos', 'Falta señal de pare', 'Asfalto deteriorado en todo el tramo'])[cat],
         cat, estado, did, creador, 1,
         CASE WHEN estado = 'RESUELTO' THEN resuelto END,
         creado,
         CASE WHEN estado = 'PENDIENTE' THEN creado ELSE resuelto END
    FROM ins
  RETURNING id, distrito_id, creador_id, estado, created_at, resolved_at, updated_at
)
SELECT x.*, (SELECT id FROM usuario f WHERE f.rol = 'FUNCIONARIO_MUNICIPAL' AND f.distrito_id = x.distrito_id LIMIT 1) AS func
  FROM x;

-- Adhesión del creador (invariante del dominio, US-09)
INSERT INTO adhesion_reporte (reporte_id, usuario_id, created_at)
SELECT id, creador_id, created_at FROM rep;

-- Algunas adhesiones extra (otros ciudadanos)
INSERT INTO adhesion_reporte (reporte_id, usuario_id, created_at)
SELECT r.id, c.id, r.created_at + interval '6 hours'
  FROM rep r JOIN ciud c ON c.id <> r.creador_id
 WHERE random() < 0.12
ON CONFLICT DO NOTHING;
UPDATE reporte r SET total_adhesiones = a.n
  FROM (SELECT reporte_id, count(*) n FROM adhesion_reporte GROUP BY reporte_id) a
 WHERE a.reporte_id = r.id AND r.id IN (SELECT id FROM rep);

-- Historial de estados (línea de tiempo)
INSERT INTO historial_estado_reporte (reporte_id, estado_anterior, estado_nuevo, comentario, autor_id, created_at, tipo_evento)
SELECT id, 'PENDIENTE', 'RECIBIDO', 'Reporte recibido por la municipalidad', func, created_at + (updated_at - created_at) * 0.15, 'CAMBIO_ESTADO'
  FROM rep WHERE estado IN ('RECIBIDO', 'EN_PROCESO', 'RESUELTO');
INSERT INTO historial_estado_reporte (reporte_id, estado_anterior, estado_nuevo, comentario, autor_id, created_at, tipo_evento)
SELECT id, 'RECIBIDO', 'EN_PROCESO', 'Cuadrilla asignada', func, created_at + (updated_at - created_at) * 0.4, 'CAMBIO_ESTADO'
  FROM rep WHERE estado IN ('EN_PROCESO', 'RESUELTO');
INSERT INTO historial_estado_reporte (reporte_id, estado_anterior, estado_nuevo, comentario, autor_id, created_at, tipo_evento)
SELECT id, 'EN_PROCESO', 'RESUELTO', 'Trabajo culminado', func, resolved_at, 'CAMBIO_ESTADO'
  FROM rep WHERE estado = 'RESUELTO';
INSERT INTO historial_estado_reporte (reporte_id, estado_anterior, estado_nuevo, comentario, autor_id, created_at, tipo_evento)
SELECT id, 'PENDIENTE', 'RECHAZADO', 'No corresponde a vía de competencia distrital', func, updated_at, 'CAMBIO_ESTADO'
  FROM rep WHERE estado = 'RECHAZADO';

-- Calificaciones de los reportes resueltos (US-26), ~75% de ellos
INSERT INTO calificacion (reporte_id, usuario_id, estrellas, comentario, created_at)
SELECT r.id, r.creador_id,
       GREATEST(1, LEAST(5, p.sat_base + (floor(random() * 3)::int - 1))),
       NULL, r.resolved_at + interval '1 day'
  FROM rep r JOIN perfil p ON p.did = r.distrito_id
 WHERE r.estado = 'RESUELTO' AND random() < 0.75
ON CONFLICT DO NOTHING;

-- Mantiene coherencia updated_at de RESUELTO futuros recortados
UPDATE reporte SET updated_at = LEAST(updated_at, now()) WHERE id IN (SELECT id FROM rep);

COMMIT;

REFRESH MATERIALIZED VIEW mv_indice_desempeno_distrital;
