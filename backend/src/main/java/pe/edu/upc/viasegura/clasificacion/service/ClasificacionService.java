package pe.edu.upc.viasegura.clasificacion.service;

import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import pe.edu.upc.viasegura.clasificacion.domain.PoliticaDeSugerencia;
import pe.edu.upc.viasegura.clasificacion.domain.ResultadoDeteccion;
import pe.edu.upc.viasegura.clasificacion.domain.Sugerencia;
import pe.edu.upc.viasegura.clasificacion.dto.ClasificacionResponse;
import pe.edu.upc.viasegura.clasificacion.port.CategoriasClasificables;
import pe.edu.upc.viasegura.clasificacion.port.ClasificacionNoDisponibleException;
import pe.edu.upc.viasegura.clasificacion.port.ClasificadorDano;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;
import pe.edu.upc.viasegura.common.port.SaneadorDeImagen;

/**
 * Sugiere la categoria de una foto (NC-04, ARCHITECTURE.md 4.3 pasos 1 y 3):
 * pide las detecciones a {@link ClasificadorDano} y aplica
 * {@link PoliticaDeSugerencia} sobre las categorias clasificables.
 *
 * <p>Dos usos:</p>
 * <ul>
 *   <li>{@link #vistaPrevia}: el ciudadano sube la foto mientras arma el
 *       reporte. No guarda nada.</li>
 *   <li>{@link #sugerir}: la sugerencia oficial, que
 *       {@code reportes.service.SugerenciaCategoriaService} pide sobre la foto
 *       ya guardada, despues del commit (D-08).</li>
 * </ul>
 *
 * <p><b>Sin {@code @Transactional} a proposito.</b> La llamada al servicio de
 * inferencia (hasta 3 s con el adaptador HTTP de NC-04b) no debe retener una
 * conexion del pool (D-13). La unica lectura de la base, el catalogo de
 * categorias, es una consulta corta propia del adaptador.</p>
 *
 * <p><b>La IA nunca bloquea un reporte.</b> Si el servicio falla, el resultado
 * es «sin sugerencia», nunca un error para el ciudadano.</p>
 */
@Slf4j
@Service
public class ClasificacionService {

    private final ClasificadorDano clasificador;
    private final CategoriasClasificables categorias;
    private final SaneadorDeImagen saneador;
    private final PoliticaDeSugerencia politica;

    public ClasificacionService(ClasificadorDano clasificador,
                                CategoriasClasificables categorias,
                                SaneadorDeImagen saneador,
                                @Value("${app.clasificacion.umbral:0.50}") double umbral) {
        this.clasificador = clasificador;
        this.categorias = categorias;
        this.saneador = saneador;
        this.politica = new PoliticaDeSugerencia(umbral);
    }

    /**
     * Vista previa (W-07/W-08): sugiere una categoria para la foto que el
     * ciudadano esta por reportar, sin guardar nada.
     *
     * <p>La foto pasa antes por el mismo {@link SaneadorDeImagen} que el
     * almacenamiento: el modelo ve la imagen que vera la sugerencia oficial
     * (orientada, a 2048 px, recomprimida), y como el saneado y el modelo son
     * deterministas, la misma foto da la misma sugerencia en los dos momentos
     * (D-08). Por eso una foto que no es una imagen valida recibe el mismo 409
     * que al crear el reporte, y sin turno de saneado, el mismo 503.</p>
     *
     * @throws IllegalArgumentException si la foto llega vacia (400)
     */
    public ClasificacionResponse vistaPrevia(ArchivoSubido foto) {
        if (foto == null || foto.vacio()) {
            throw new IllegalArgumentException("Adjunta la foto del daño para sugerir una categoría");
        }
        ArchivoSubido saneada = saneador.sanear(foto);
        return sugerir(saneada).map(ClasificacionResponse::de).orElseGet(ClasificacionResponse::sinSugerencia);
    }

    /**
     * Sugerencia para una foto <b>ya saneada</b>; no la vuelve a sanear
     * (recomprimirla daria otros pixeles que los de la vista previa).
     *
     * @return la sugerencia, o vacio si no hay una clara o el servicio fallo
     */
    public Optional<Sugerencia> sugerir(ArchivoSubido fotoSaneada) {
        ResultadoDeteccion resultado;
        try {
            resultado = clasificador.detectar(fotoSaneada);
        } catch (ClasificacionNoDisponibleException e) {
            log.warn("Clasificacion no disponible, sin sugerencia: {}", e.getMessage());
            return Optional.empty();
        }
        if (resultado.detecciones().isEmpty()) {
            return Optional.empty();
        }
        return politica.aplicar(resultado, categorias.activas());
    }
}
