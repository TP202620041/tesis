package pe.edu.upc.viasegura.clasificacion.dto;

import pe.edu.upc.viasegura.clasificacion.domain.Sugerencia;

/**
 * Vista previa de la clasificacion de una foto (NC-04, {@code POST
 * /api/clasificaciones}): la categoria que la PWA propone al ciudadano
 * mientras arma el reporte. Solo es una ayuda de interfaz: el reporte se crea
 * con la categoria que el ciudadano confirma, y la sugerencia oficial la
 * vuelve a calcular el backend sobre la foto guardada (D-08).
 *
 * <p><b>Solo la categoria, sin confianza ni version del modelo.</b> La
 * sugerencia es una senal interna (regla del proyecto): la vista previa
 * muestra lo minimo para la interfaz. Exponer el puntaje daria a cualquiera un
 * instrumento para sondear el detector foto a foto, y no ayuda a elegir:
 * debajo del umbral ya no se sugiere nada. Agregar un campo despues es
 * compatible; quitarlo no.</p>
 *
 * <p>Los dos campos son nulos cuando no hay sugerencia: el modelo no
 * encontro un dano claro, o el servicio no respondio. La PWA no distingue esos
 * casos: el ciudadano elige la categoria a mano, como siempre.</p>
 *
 * @param categoriaId     categoria sugerida, o {@code null}
 * @param categoriaNombre su nombre, o {@code null}
 */
public record ClasificacionResponse(Long categoriaId, String categoriaNombre) {

    public static ClasificacionResponse sinSugerencia() {
        return new ClasificacionResponse(null, null);
    }

    public static ClasificacionResponse de(Sugerencia sugerencia) {
        return new ClasificacionResponse(sugerencia.categoriaId(), sugerencia.nombreCategoria());
    }
}
