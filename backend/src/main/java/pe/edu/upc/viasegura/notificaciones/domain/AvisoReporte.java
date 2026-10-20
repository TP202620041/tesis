package pe.edu.upc.viasegura.notificaciones.domain;

/**
 * Lo que se le avisa al ciudadano sobre SU reporte (US-16/US-21), igual
 * para todos los canales; cada adaptador toma lo que necesita.
 *
 * @param asunto      asunto del correo y titulo del push
 * @param mensaje     texto completo (correo), con el comentario del municipio
 * @param resumen     texto corto para el push: solo el estado nuevo, sin
 *                    comentario (el push lo ve cualquiera que mire la pantalla)
 * @param reporteId   id del reporte del propio ciudadano
 * @param estadoNuevo estado al que paso el reporte
 */
public record AvisoReporte(
        String asunto,
        String mensaje,
        String resumen,
        Long reporteId,
        String estadoNuevo
) {
    /** Ruta de la PWA donde el ciudadano ve su reporte. */
    public String url() {
        return "/mis-reportes/" + reporteId;
    }
}
