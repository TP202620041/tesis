package pe.edu.upc.viasegura.clasificacion.domain;

/**
 * Un dano que el servicio de inferencia encontro en la foto (NC-04,
 * ARCHITECTURE.md §6): la clase del vocabulario del contrato {@code /v1}
 * ({@code bache}, {@code grieta}) y su confianza.
 *
 * <p>No guarda la caja ({@code caja} del contrato): la politica de sugerencia
 * no la usa. Si una version futura agrega el area de la caja como criterio, se
 * suma aqui.</p>
 *
 * <p>No valida la confianza: una deteccion fuera de [0, 1] la descarta
 * {@link PoliticaDeSugerencia}, para que una respuesta con un valor raro no
 * invalide a las demas detecciones de la misma foto.</p>
 *
 * @param clase     clase del modelo tal como la devuelve el servicio
 * @param confianza confianza de la deteccion, en [0, 1]
 */
public record Deteccion(String clase, double confianza) {}
