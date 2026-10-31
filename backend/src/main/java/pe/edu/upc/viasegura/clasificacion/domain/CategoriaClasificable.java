package pe.edu.upc.viasegura.clasificacion.domain;

/**
 * Una categoria de dano que el modelo puede sugerir: activa y con
 * {@code clase_modelo} (V19). Hoy son dos estandar: «Bache» ({@code bache}) y
 * «Pista deteriorada» ({@code grieta}). Las categorias de un distrito (US-29)
 * nunca tienen clase del modelo, asi que nunca se sugieren.
 *
 * <p>Es la vista que {@code clasificacion} necesita de una categoria, sin
 * depender de la entidad de {@code reportes} (el grafo de modulos es
 * {@code clasificacion <- reportes}, ARCHITECTURE.md 4.3).</p>
 *
 * @param id          id de la categoria
 * @param nombre      nombre que ve el ciudadano
 * @param claseModelo clase del vocabulario del contrato {@code /v1}
 */
public record CategoriaClasificable(Long id, String nombre, String claseModelo) {}
