-- Alta y baja de funcionarios municipales (DEP-05). Script de psql.
--
-- La persona se registra primero en la PWA, como cualquier ciudadano: asi su
-- contrasena queda con el hash de la aplicacion y su aceptacion de los
-- terminos, registrada (D-12). Despues, un operador con acceso a la base corre
-- este script, que pasa esa cuenta a FUNCIONARIO_MUNICIPAL y fija su distrito
-- de gestion en usuario.distrito_id (la jurisdiccion de hoy; si D-10 la pasa a
-- municipalidad_id, este script cambia con esa tarea). Con accion=revocar la
-- devuelve a CIUDADANO.
--
-- ANTES DE ASIGNAR
--   Cualquiera pudo registrarse antes con el correo de la persona. Desde NC-09
--   una cuenta no inicia sesion sin confirmar su correo con el enlace que
--   recibe, asi que entrar con la contrasena prueba que el correo es suyo
--   (las cuentas anteriores a NC-09 se dieron por confirmadas). Desde NC-09b
--   el script no asigna una cuenta sin confirmar: falla y no cambia nada.
--   Igual, asigne solo si la persona confirma que el registro le funciono a
--   ella (entra con su contrasena). Si al registrarse vio "El correo ya esta
--   registrado", NO asigne: alguien pudo registrarse antes con su correo.
--   Para recuperarla, ella pide el enlace ("Reenviar" en el inicio de
--   sesion), confirma la cuenta y cambia la contrasena con "Olvidaste tu
--   contrasena", que solo funciona con la cuenta confirmada (NC-09b). El
--   script muestra la fecha de registro de la cuenta (created_at) y si
--   confirmo su correo, para compararlo con lo que la persona recuerda.
--
-- USO (desde la raiz del repo)
--   Asignar:
--     psql "$DATABASE_URL" -v email=persona@ejemplo.com -v distrito='San Isidro' \
--       -f backend/scripts/asignar-funcionario.sql
--   Devolver a CIUDADANO:
--     psql "$DATABASE_URL" -v email=persona@ejemplo.com -v accion=revocar \
--       -f backend/scripts/asignar-funcionario.sql
--   Desde una sesion abierta (railway connect postgis):
--     \set email 'persona@ejemplo.com'
--     \set distrito 'Miraflores'
--     \i backend/scripts/asignar-funcionario.sql
--   En local (Docker), por la entrada estandar:
--     docker exec -i viasegura-db psql -U viasegura -d viasegura \
--       -v email=persona@ejemplo.com -v distrito=Miraflores < backend/scripts/asignar-funcionario.sql
--
-- REGLAS
--   - El correo se busca exacto (el registro lo guarda tal como se escribio).
--     Si no hay ninguno, el error sugiere los que solo difieren en mayusculas.
--   - El distrito se busca por nombre sin distinguir mayusculas ni tildes
--     ('rimac' encuentra el distrito Rimac, que lleva tilde) y debe coincidir
--     con exactamente uno.
--   - asignar: solo una cuenta CIUDADANO con el correo confirmado (NC-09b). Si
--     ya es FUNCIONARIO_MUNICIPAL de ese distrito no cambia nada (se puede
--     repetir sin error). A un funcionario de otro distrito primero se le
--     revoca; un ADMIN nunca se toca.
--   - revocar: solo un FUNCIONARIO_MUNICIPAL, que queda CIUDADANO y sin
--     distrito (lo vuelve a elegir en su perfil). Si ya es CIUDADANO no cambia
--     nada.
--   - Todo ocurre en una transaccion (BEGIN ... COMMIT): si algo falla, el
--     script hace ROLLBACK, no cambia nada, no muestra la fila y se corta
--     (activa ON_ERROR_STOP). Con -f o por la entrada estandar, psql termina
--     con codigo 3; con \i en una sesion abierta, la sesion sigue y queda
--     limpia: sin transaccion abierta ni valores del script.
--   - Los datos viajan del psql a la base con SET LOCAL, que desaparece al
--     terminar la transaccion (COMMIT o ROLLBACK), y las variables de psql
--     (email, distrito, accion) se borran al leerlas: en una sesion abierta
--     no quedan para la siguiente persona, tampoco despues de un error. Solo
--     si el script se corta antes de leerlas (por ejemplo, porque falta
--     email) quedan las que se definieron: vuelva a definirlas todas.
--
-- CUANDO RIGE EL CAMBIO
--   El JWT lleva el rol (claim "rol"), pero nada lo lee para autorizar:
--   JwtAuthenticationFilter solo toma del token el correo (subject) y
--   UsuarioDetailsService carga el rol de la base en cada peticion. La PWA, a
--   su vez, lee el rol de GET /api/auth/me. Por eso el cambio rige desde la
--   siguiente peticion, sin volver a iniciar sesion: basta recargar la PWA.
--   Revocar tambien corta el acceso de funcionario en la siguiente peticion,
--   aunque el token siga vigente.

\set ON_ERROR_STOP on

\if :{?email}
\else
  DO $$ BEGIN RAISE EXCEPTION 'Falta la variable email (psql -v email=persona@ejemplo.com ...)'; END $$;
\endif
\if :{?accion}
\else
  \set accion asignar
\endif
\if :{?distrito}
\else
  \set distrito ''
\endif

BEGIN;
SET LOCAL asignar_funcionario.email = :'email';
SET LOCAL asignar_funcionario.distrito = :'distrito';
SET LOCAL asignar_funcionario.accion = :'accion';
\unset email
\unset distrito
\unset accion

-- Un error dentro del DO no debe cortar el script con la transaccion abierta
-- (en una sesion interactiva quedaria "abortada"): se atrapa abajo con :ERROR.
\set ON_ERROR_STOP off
DO $$
DECLARE
    v_email       text := btrim(current_setting('asignar_funcionario.email'));
    v_distrito    text := btrim(current_setting('asignar_funcionario.distrito'));
    v_accion      text := lower(btrim(current_setting('asignar_funcionario.accion')));
    v_usuario     usuario%ROWTYPE;
    v_n           int;
    v_distrito_id bigint;
    v_nombre      text;
    v_actual      text;
    v_similares   text;
    -- Vocales con tilde, dieresis y enie (minusculas y mayusculas), en escapes
    -- Unicode para que el archivo sea ASCII y no dependa de client_encoding.
    c_con_tilde   constant text := U&'\00E1\00E9\00ED\00F3\00FA\00FC\00F1\00C1\00C9\00CD\00D3\00DA\00DC\00D1';
    c_sin_tilde   constant text := 'aeiouunaeiouun';
BEGIN
    IF v_accion NOT IN ('asignar', 'revocar') THEN
        RAISE EXCEPTION 'accion debe ser asignar (por defecto) o revocar, no "%"', v_accion;
    END IF;
    IF v_email = '' THEN
        RAISE EXCEPTION 'La variable email esta vacia';
    END IF;

    -- email es UNIQUE: a lo sumo una fila. FOR UPDATE la bloquea hasta el final.
    SELECT * INTO v_usuario FROM usuario WHERE email = v_email FOR UPDATE;
    IF NOT FOUND THEN
        SELECT string_agg(email, ', ') INTO v_similares FROM usuario WHERE lower(email) = lower(v_email);
        RAISE EXCEPTION 'No existe ninguna cuenta con el correo %', v_email
            USING HINT = coalesce('Solo difieren en mayusculas: ' || v_similares || '. Use el correo exacto.',
                                  'La persona debe registrarse primero en la PWA.');
    END IF;

    -- Para comparar con lo que recuerda la persona (ver "ANTES DE ASIGNAR").
    RAISE NOTICE 'Cuenta % (rol %, correo %), registrada el % (hora de Lima).', v_email, v_usuario.rol,
        CASE WHEN v_usuario.correo_confirmado THEN 'confirmado' ELSE 'SIN CONFIRMAR' END,
        to_char(v_usuario.created_at AT TIME ZONE 'America/Lima', 'YYYY-MM-DD HH24:MI');

    SELECT nombre INTO v_actual FROM distrito WHERE id = v_usuario.distrito_id;

    -- ------------------------------------------------------------- revocar
    IF v_accion = 'revocar' THEN
        IF v_usuario.rol = 'CIUDADANO' THEN
            RAISE NOTICE 'La cuenta % ya es CIUDADANO: no se cambia nada.', v_email;
            RETURN;
        ELSIF v_usuario.rol <> 'FUNCIONARIO_MUNICIPAL' THEN
            RAISE EXCEPTION 'La cuenta % es %: este script solo devuelve a CIUDADANO a un FUNCIONARIO_MUNICIPAL.',
                v_email, v_usuario.rol;
        END IF;
        UPDATE usuario SET rol = 'CIUDADANO', distrito_id = NULL, updated_at = now() WHERE id = v_usuario.id;
        RAISE NOTICE 'La cuenta % deja de ser FUNCIONARIO_MUNICIPAL de % y vuelve a CIUDADANO, sin distrito.',
            v_email, coalesce(v_actual, '(ninguno)');
        RETURN;
    END IF;

    -- ------------------------------------------------------------- asignar
    IF v_distrito = '' THEN
        RAISE EXCEPTION 'Falta la variable distrito (psql -v distrito=Miraflores ...)';
    END IF;

    SELECT count(*), min(id), min(nombre) INTO v_n, v_distrito_id, v_nombre
      FROM distrito
     WHERE translate(lower(nombre), c_con_tilde, c_sin_tilde)
         = translate(lower(v_distrito), c_con_tilde, c_sin_tilde);
    IF v_n = 0 THEN
        SELECT string_agg(nombre, ', ' ORDER BY nombre) INTO v_similares
          FROM distrito
         WHERE translate(lower(nombre), c_con_tilde, c_sin_tilde)
               LIKE '%' || translate(lower(v_distrito), c_con_tilde, c_sin_tilde) || '%';
        RAISE EXCEPTION 'No existe el distrito "%"', v_distrito
            USING HINT = coalesce('Parecidos: ' || v_similares || '.',
                                  'Los nombres validos: SELECT nombre FROM distrito ORDER BY nombre;');
    ELSIF v_n > 1 THEN
        RAISE EXCEPTION 'El nombre "%" coincide con % distritos: escribalo completo.', v_distrito, v_n;
    END IF;

    IF v_usuario.rol = 'FUNCIONARIO_MUNICIPAL' AND v_usuario.distrito_id = v_distrito_id THEN
        RAISE NOTICE 'La cuenta % ya es FUNCIONARIO_MUNICIPAL de %: no se cambia nada.', v_email, v_nombre;
        RETURN;
    ELSIF v_usuario.rol <> 'CIUDADANO' THEN
        RAISE EXCEPTION 'La cuenta % es % (distrito: %): solo se asigna una cuenta CIUDADANO.',
                v_email, v_usuario.rol, coalesce(v_actual, 'ninguno')
            USING HINT = CASE WHEN v_usuario.rol = 'FUNCIONARIO_MUNICIPAL'
                              THEN 'Para cambiarla de distrito, devuelvala antes a CIUDADANO (-v accion=revocar).'
                              ELSE 'Un ADMIN no se convierte en funcionario.' END;
    END IF;

    -- NC-09b: sin confirmar, nada prueba que el correo sea de la persona.
    IF NOT v_usuario.correo_confirmado THEN
        RAISE EXCEPTION 'La cuenta % no confirmo su correo: no se le asigna el rol.', v_email
            USING HINT = 'La persona debe abrir el enlace de confirmacion que recibio al registrarse (o pedir'
                      || ' otro con "Reenviar" en el inicio de sesion) y entrar con su contrasena. Despues,'
                      || ' vuelva a correr el script.';
    END IF;

    IF v_actual IS NOT NULL THEN
        -- Usuario.distrito es la residencia del ciudadano y la jurisdiccion del funcionario.
        RAISE NOTICE 'Su distrito de residencia (%) se reemplaza por el de gestion.', v_actual;
    END IF;
    UPDATE usuario SET rol = 'FUNCIONARIO_MUNICIPAL', distrito_id = v_distrito_id, updated_at = now()
     WHERE id = v_usuario.id;
    RAISE NOTICE 'La cuenta % es FUNCIONARIO_MUNICIPAL de %.', v_email, v_nombre;
END
$$;

-- Si el DO fallo: deshacer y salir de la transaccion antes de cortar el script.
\if :ERROR
  ROLLBACK;
\endif
\set ON_ERROR_STOP on

-- Despues del ROLLBACK, los SET LOCAL ya no existen: este bloque convierte el
-- fallo en un error (codigo 3) fuera de toda transaccion. Sin fallo, no hace nada.
DO $$
BEGIN
    IF coalesce(current_setting('asignar_funcionario.email', true), '') = '' THEN
        RAISE EXCEPTION 'No se cambio nada (ver el error anterior).';
    END IF;
END
$$;

-- La fila resultante.
SELECT u.id, u.email, u.rol, d.nombre AS distrito, u.created_at, u.updated_at
  FROM usuario u
  LEFT JOIN distrito d ON d.id = u.distrito_id
 WHERE u.email = btrim(current_setting('asignar_funcionario.email'));

COMMIT;
