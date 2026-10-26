# Respaldo diario de la base de producción (runbook docs/despliegue.md §5.3).
# Railway lo corre como servicio cron: hace un pg_dump en formato custom, lo valida
# con pg_restore --list y lo sube a R2 con curl firmando con SigV4. El cliente es de
# la misma versión mayor que el servidor (postgis/postgis:16-3.4), para que el
# volcado se restaure con el pg_restore 16 del PostGIS local (§8).
FROM postgres:16-alpine

RUN apk add --no-cache curl

COPY respaldar.sh /usr/local/bin/respaldar.sh
RUN chmod 0755 /usr/local/bin/respaldar.sh

# Reemplaza el entrypoint de la imagen, que arrancaría un servidor PostgreSQL.
USER postgres
ENTRYPOINT ["/usr/local/bin/respaldar.sh"]
