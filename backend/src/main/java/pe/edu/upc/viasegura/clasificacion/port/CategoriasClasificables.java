package pe.edu.upc.viasegura.clasificacion.port;

import java.util.List;
import pe.edu.upc.viasegura.clasificacion.domain.CategoriaClasificable;

/**
 * Catalogo de las categorias que el modelo puede sugerir: las activas con
 * {@code clase_modelo} (NC-04).
 *
 * <p><b>Por que es un puerto y no una llamada a {@code reportes}.</b> Las
 * categorias viven en {@code reportes} ({@code CategoriaDano}), y
 * {@code reportes} ya depende de {@code clasificacion} (el listener de la
 * sugerencia oficial llama a {@code ClasificacionService}). Si
 * {@code clasificacion} llamara a {@code reportes} habria un ciclo entre
 * modulos ({@code modulosSinCiclos}). La dependencia se invierte: este modulo
 * declara lo que necesita y {@code reportes} lo implementa en su
 * {@code infra/} ({@code JpaCategoriasClasificablesAdapter}); Spring lo inyecta
 * por la interfaz. El grafo sigue siendo {@code clasificacion <- reportes}
 * (ARCHITECTURE.md 4.3).</p>
 */
public interface CategoriasClasificables {

    /** Categorias activas con clase del modelo; vacia si no hay ninguna. */
    List<CategoriaClasificable> activas();
}
