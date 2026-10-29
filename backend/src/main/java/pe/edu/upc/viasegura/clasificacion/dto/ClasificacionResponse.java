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
 * <p>Los dos campos de la categoria son nulos cuando no hay sugerencia: el
 * modelo no encontro un dano claro, el servicio no respondio o la foto se
 * rechazo. La PWA no distingue los dos primeros casos: el ciudadano elige la
 * categoria a mano, como siempre.</p>
 *
 * <p><b>{@code fotoRechazada} (NC-10b, D-15)</b> avisa que la foto no se
 * podria publicar: al crear el reporte con ella, la respuesta seria 400
 * {@code FOTO_NO_PERMITIDA}. No es una senal interna: habla de la foto que el
 * propio ciudadano acaba de subir, y la creacion le daria el mismo veredicto.
 * Por el mismo criterio que la confianza, <b>no lleva el puntaje</b> del
 * modelo de moderacion. Si la foto no se pudo revisar (servicio caido, sin
 * turno o la moderacion apagada), vale {@code false}: el veredicto oficial es
 * el de la creacion.</p>
 *
 * @param categoriaId     categoria sugerida, o {@code null}
 * @param categoriaNombre su nombre, o {@code null}
 * @param fotoRechazada   {@code true} solo si la moderacion rechazo la foto;
 *                        entonces no se clasifica y la categoria es nula
 */
public record ClasificacionResponse(Long categoriaId, String categoriaNombre, boolean fotoRechazada) {

    public static ClasificacionResponse sinSugerencia() {
        return new ClasificacionResponse(null, null, false);
    }

    public static ClasificacionResponse de(Sugerencia sugerencia) {
        return new ClasificacionResponse(sugerencia.categoriaId(), sugerencia.nombreCategoria(), false);
    }

    /** NC-10b: la foto no se podria publicar; no se clasifica. */
    public static ClasificacionResponse fotoNoPermitida() {
        return new ClasificacionResponse(null, null, true);
    }
}
