package pe.edu.upc.viasegura.reportes.service;

import pe.edu.upc.viasegura.common.port.ArchivoSubido;
import pe.edu.upc.viasegura.reportes.domain.Severidad;

/**
 * Datos de entrada para crear un reporte (US-05). Se arma en el controller
 * a partir del multipart/form-data y se pasa al servicio. La foto llega ya
 * leida como {@link ArchivoSubido} (BE-10): el servicio no conoce Spring Web.
 *
 * @param titulo          obligatorio, 5-120 caracteres tras el trim (NC-02).
 *                        Lo valida el servicio, despues de la idempotencia.
 * @param severidad       obligatoria (NC-02); {@code null} si no llego.
 * @param ubicacionManual true si el ciudadano ingreso la ubicacion a mano
 *                        por no tener GPS disponible (US-05, Escenario 2).
 */
public record CrearReporteCommand(
        Double latitud,
        Double longitud,
        Long categoriaId,
        String titulo,
        String descripcion,
        Severidad severidad,
        boolean ubicacionManual,
        ArchivoSubido foto
) {}
