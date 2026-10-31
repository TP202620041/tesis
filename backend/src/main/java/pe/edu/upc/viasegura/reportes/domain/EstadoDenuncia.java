package pe.edu.upc.viasegura.reportes.domain;

/**
 * Estado de una denuncia (NC-11a). Nace {@link #PENDIENTE}; el ADMIN la
 * {@link #ATENDIDA atiende} al ocultar contenido del reporte o la
 * {@link #DESESTIMADA desestima}. Ninguna transicion es automatica.
 */
public enum EstadoDenuncia {
    PENDIENTE,
    ATENDIDA,
    DESESTIMADA
}
