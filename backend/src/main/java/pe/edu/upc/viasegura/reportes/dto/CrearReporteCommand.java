package pe.edu.upc.viasegura.reportes.dto;

import org.springframework.web.multipart.MultipartFile;

/**
 * Datos de entrada para crear un reporte (US-05). Se arma en el controller
 * a partir del multipart/form-data y se pasa al servicio.
 *
 * @param ubicacionManual true si el ciudadano ingreso la ubicacion a mano
 *                        por no tener GPS disponible (US-05, Escenario 2).
 */
public record CrearReporteCommand(
        Double latitud,
        Double longitud,
        Long categoriaId,
        String descripcion,
        boolean ubicacionManual,
        MultipartFile foto
) {}
