package pe.edu.upc.viasegura.reportes.domain;

/**
 * Severidad del dano segun el ciudadano que lo reporta (NC-02). La fija al
 * crear y puede cambiarla mientras el reporte sigue PENDIENTE (US-08); el
 * funcionario la ve pero no la cambia.
 *
 * <p>Es un dato publico del reporte (mapa y detalle), no una senal operativa:
 * la declara el ciudadano, no la calcula el sistema ni la municipalidad.</p>
 */
public enum Severidad {
    BAJA,
    MEDIA,
    ALTA
}
