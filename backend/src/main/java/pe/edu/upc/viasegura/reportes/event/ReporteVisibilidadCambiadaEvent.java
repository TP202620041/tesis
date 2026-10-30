package pe.edu.upc.viasegura.reportes.event;

/**
 * Evento de dominio: el ADMIN oculto o restablecio <b>un reporte entero</b>
 * (NC-11a, D-15). No se publica al ocultar o restablecer solo la foto, que no
 * mueve ninguna metrica.
 *
 * <p>Un reporte oculto no cuenta en el indice de desempeno (la vista
 * materializada lo excluye desde V21, decision del usuario del 28/10), asi
 * que ocultarlo baja {@code total_reportes} (y {@code total_resueltos} y las
 * calificaciones si las tenia) y restablecerlo los devuelve. Lo consume
 * {@code desempeno.listener.IndiceDesempenoRefreshListener} despues del
 * commit, como el resto de eventos que mueven un KPI.</p>
 *
 * @param reporteId  reporte ocultado o restablecido
 * @param distritoId su distrito (puede ser {@code null} en datos antiguos)
 * @param oculto     {@code true} si quedo oculto, {@code false} si se restablecio
 */
public record ReporteVisibilidadCambiadaEvent(
        Long reporteId,
        Long distritoId,
        boolean oculto
) {}
