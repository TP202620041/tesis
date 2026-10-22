# Imagen del backend (DEP-03). Contexto de build: backend/
#   docker build -t viasegura-backend backend/
# En Railway la ruta raiz (backend/), el health check (/actuator/health) y
# las variables se fijan en el panel del servicio (runbook docs/despliegue.md).
# Variables y decisiones: README, "Configuracion de produccion".

# ---- Etapa 1: compilacion ---------------------------------------------------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Primero solo el pom: la capa con las dependencias se reutiliza mientras el
# pom no cambie, y un cambio en src/ no vuelve a descargarlas.
COPY pom.xml ./
RUN mvn -B -ntp dependency:go-offline

COPY src ./src
# Los tests no corren aqui: necesitan la BD de test y GreenMail, y ya
# corrieron con `mvn clean verify` antes de fusionar.
RUN mvn -B -ntp package -DskipTests \
    && cp target/viasegura-*.jar application.jar \
    && java -Djarmode=tools -jar application.jar extract --layers --destination extracted

# ---- Etapa 2: ejecucion -----------------------------------------------------
# JRE sobre Ubuntu (noble), no Alpine: la exportacion XLSX (US-28) usa
# autoSizeColumn de Apache POI, que mide el texto con fuentes reales; la
# imagen de Temurin ya trae fontconfig y DejaVu.
FROM eclipse-temurin:21-jre-noble

# Usuario sin privilegios; /data/fotos es suyo (FOTOS_DIR). Solo se usa con
# FOTOS_ALMACEN=local: en produccion las fotos van a R2 (FOTOS_ALMACEN=s3,
# DEP-12) y el contenedor no escribe en disco.
RUN groupadd --system viasegura \
    && useradd --system --gid viasegura --home-dir /app --shell /usr/sbin/nologin viasegura \
    && mkdir -p /data/fotos \
    && chown -R viasegura:viasegura /data

WORKDIR /app
# Una capa por grupo, de la que menos cambia a la que mas: un cambio de
# codigo solo reemplaza la ultima.
COPY --from=build /build/extracted/dependencies/ ./
COPY --from=build /build/extracted/spring-boot-loader/ ./
COPY --from=build /build/extracted/snapshot-dependencies/ ./
COPY --from=build /build/extracted/application/ ./

ENV SPRING_PROFILES_ACTIVE=prod \
    FOTOS_DIR=/data/fotos \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -Djava.awt.headless=true"

USER viasegura
EXPOSE 8080
# headless tambien aqui: si la plataforma define su propio JAVA_TOOL_OPTIONS
# (el runbook fija el heap asi), reemplaza el de arriba entero.
ENTRYPOINT ["java", "-Djava.awt.headless=true", "-jar", "application.jar"]
