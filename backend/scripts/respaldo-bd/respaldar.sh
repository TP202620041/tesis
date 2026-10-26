#!/bin/sh
# Respaldo de la base de Ciudad Viva hacia un bucket S3 compatible (R2).
# Runbook: docs/despliegue.md §5.3 (servicio respaldo-bd) y §8 (restauración).
#
# Obligatorias: BACKUP_DATABASE_URL, AWS_S3_ENDPOINT, AWS_S3_BUCKET,
#               AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.
# Opcionales:   AWS_S3_REGION (auto) y BACKUP_FILE_PREFIX (ciudadviva).
#
# Sale con código distinto de 0 si algo falla, para que Railway marque la corrida
# del cron como fallida. Nunca imprime la URL de la base ni las claves.
set -eu

for variable in BACKUP_DATABASE_URL AWS_S3_ENDPOINT AWS_S3_BUCKET AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  eval "valor=\${$variable:-}"
  if [ -z "$valor" ]; then
    echo "Falta la variable $variable" >&2
    exit 1
  fi
done

region="${AWS_S3_REGION:-auto}"
prefijo="${BACKUP_FILE_PREFIX:-ciudadviva}"
endpoint="${AWS_S3_ENDPOINT%/}"
case "$endpoint" in
  http://* | https://*) ;;
  *) endpoint="https://$endpoint" ;;
esac

nombre="${prefijo}-$(date -u +%Y-%m-%dT%H-%M-%SZ).dump"
directorio="$(mktemp -d)"
trap 'rm -rf "$directorio"' EXIT
archivo="$directorio/$nombre"

# Sin timeouts, un cuelgue (red, lock o R2) dejaría el proceso vivo y Railway saltaría
# las corridas siguientes sin avisar. El lock_wait corta si un ALTER TABLE (Flyway en un
# despliegue a esa hora) retiene una tabla, en vez de esperarlo sin límite.
export PGCONNECT_TIMEOUT=15

# Formato custom: comprimido y restaurable por partes con pg_restore. Sin dueños ni
# permisos, para restaurar en una base con otro usuario (prueba de §8).
pg_dump --format=custom --no-owner --no-privileges --lock-wait-timeout=60s \
  --dbname="$BACKUP_DATABASE_URL" --file="$archivo"

# Un volcado que pg_restore no puede leer entero no es un respaldo: --file=/dev/null
# descomprime cada bloque de datos (--list solo leería el índice).
pg_restore --file=/dev/null "$archivo"

# Y tiene que ser la base de Ciudad Viva con su esquema, no una vacía o equivocada.
if ! pg_restore --list "$archivo" | grep -q 'TABLE DATA public flyway_schema_history'; then
  echo "El volcado no tiene los datos de flyway_schema_history: ¿BACKUP_DATABASE_URL apunta a la base correcta?" >&2
  exit 1
fi

tamano="$(wc -c < "$archivo" | tr -d ' ')"
hash="$(sha256sum "$archivo" | cut -d ' ' -f 1)"
# set -e no ve un fallo de sha256sum dentro de la tubería; sin hash, curl firmaría sin él.
if [ "${#hash}" -ne 64 ]; then
  echo "No se pudo calcular el sha256 del volcado" >&2
  exit 1
fi

# Las credenciales de R2 van en la configuración de curl por stdin, no en los
# argumentos del proceso. La cabecera x-amz-content-sha256 entra en la firma, así que
# R2 rechaza un cuerpo que no coincida con el volcado. --fail-with-body muestra el XML
# de error de R2 (un 403 por permisos, por ejemplo), que no contiene la clave.
printf 'user = "%s:%s"\n' "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" |
  curl --config - --fail-with-body --silent --show-error \
    --connect-timeout 20 --max-time 900 --retry 3 --retry-connrefused \
    --aws-sigv4 "aws:amz:${region}:s3" \
    --header "x-amz-content-sha256: ${hash}" \
    --upload-file "$archivo" \
    "${endpoint}/${AWS_S3_BUCKET}/${nombre}"

echo "Respaldo subido: ${AWS_S3_BUCKET}/${nombre} (${tamano} bytes, sha256 ${hash})"
