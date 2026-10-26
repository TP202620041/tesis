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

# Formato custom: comprimido y restaurable por partes con pg_restore. Sin dueños ni
# permisos, para restaurar en una base con otro usuario (prueba de §8).
pg_dump --format=custom --no-owner --no-privileges --dbname="$BACKUP_DATABASE_URL" --file="$archivo"

# Un volcado que pg_restore no puede leer no es un respaldo.
pg_restore --list "$archivo" > /dev/null

tamano="$(wc -c < "$archivo" | tr -d ' ')"
hash="$(sha256sum "$archivo" | cut -d ' ' -f 1)"

# Las credenciales van en la configuración de curl por stdin, no en los argumentos
# del proceso. R2 exige la cabecera x-amz-content-sha256 dentro de la firma.
printf 'user = "%s:%s"\n' "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" |
  curl --config - --fail --silent --show-error --retry 3 \
    --aws-sigv4 "aws:amz:${region}:s3" \
    --header "x-amz-content-sha256: ${hash}" \
    --upload-file "$archivo" \
    "${endpoint}/${AWS_S3_BUCKET}/${nombre}"

echo "Respaldo subido: ${AWS_S3_BUCKET}/${nombre} (${tamano} bytes, sha256 ${hash})"
