package pe.edu.upc.viasegura.clasificacion.domain;

import java.math.BigDecimal;

/**
 * Categoria que el modelo sugiere para una foto (NC-04). Es una <b>senal
 * interna</b> (regla del proyecto): el ciudadano solo ve la categoria en la
 * vista previa, nunca la confianza ni la version, y ningun DTO del reporte la
 * expone.
 *
 * @param categoriaId     categoria sugerida
 * @param nombreCategoria su nombre, para la vista previa
 * @param confianza       puntaje de la categoria (la maxima confianza de sus
 *                        detecciones), con 3 decimales como
 *                        {@code reporte.confianza_sugerencia}
 * @param versionModelo   version del modelo que la produjo (evaluacion de OE3)
 */
public record Sugerencia(Long categoriaId, String nombreCategoria, BigDecimal confianza, String versionModelo) {}
