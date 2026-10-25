package pe.edu.upc.viasegura.clasificacion.infra;

import java.util.ArrayList;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import pe.edu.upc.viasegura.clasificacion.domain.Deteccion;
import pe.edu.upc.viasegura.clasificacion.domain.ResultadoDeteccion;
import pe.edu.upc.viasegura.clasificacion.port.ClasificacionNoDisponibleException;
import pe.edu.upc.viasegura.clasificacion.port.ClasificadorDano;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;

/**
 * Clasificador falso (NC-04, fase 0): responde siempre lo mismo, sin mirar la
 * foto. Permite construir y probar la vista previa y la sugerencia oficial
 * antes de que exista {@code inferencia/} (NC-03) y su adaptador HTTP
 * (NC-04b). Se activa con {@code app.clasificacion.tipo=falso}
 * ({@code CLASIFICACION_TIPO}), el valor por defecto.
 *
 * <p>La respuesta se fija con {@code app.clasificacion.falso.respuesta}
 * ({@code CLASIFICACION_FALSO_RESPUESTA}):</p>
 * <ul>
 *   <li><b>vacia</b> (por defecto, y siempre en produccion): no detecta nada,
 *       asi que nunca hay sugerencia. Es la clasificacion apagada;</li>
 *   <li><b>{@code clase:confianza} separadas por coma</b>, p. ej.
 *       {@code bache:0.87,grieta:0.30}: esas detecciones para cualquier foto
 *       (el perfil {@code local} y los IT);</li>
 *   <li><b>{@code falla}</b>: lanza {@link ClasificacionNoDisponibleException},
 *       como un servicio caido, para probar el camino de error.</li>
 * </ul>
 *
 * <p>La version que informa es {@code app.clasificacion.falso.version-modelo}
 * ({@code falso-0}): en la base, las sugerencias del falso se distinguen de
 * las de un modelo real. Un valor mal escrito hace fallar el arranque con el
 * nombre de la propiedad, en vez de clasificar con una respuesta a medias.</p>
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.clasificacion.tipo", havingValue = "falso", matchIfMissing = true)
public class FalsoClasificadorAdapter implements ClasificadorDano {

    static final String PROPIEDAD_RESPUESTA = "app.clasificacion.falso.respuesta";
    static final String MODO_FALLA = "falla";

    private final boolean falla;
    private final ResultadoDeteccion resultado;

    public FalsoClasificadorAdapter(
            @Value("${" + PROPIEDAD_RESPUESTA + ":}") String respuesta,
            @Value("${app.clasificacion.falso.version-modelo:falso-0}") String versionModelo) {
        String texto = respuesta == null ? "" : respuesta.strip();
        this.falla = MODO_FALLA.equalsIgnoreCase(texto);
        this.resultado = new ResultadoDeteccion(versionModelo, falla ? List.of() : detecciones(texto));
        log.info("Clasificador falso: {}", falla ? "modo falla"
                : resultado.detecciones().isEmpty() ? "sin detecciones (nunca sugiere)"
                : resultado.detecciones().size() + " deteccion(es) fija(s)");
    }

    @Override
    public ResultadoDeteccion detectar(ArchivoSubido foto) {
        if (foto == null || foto.vacio()) {
            throw new ClasificacionNoDisponibleException("Foto vacia: no hay nada que clasificar");
        }
        if (falla) {
            throw new ClasificacionNoDisponibleException("Clasificador falso en modo falla");
        }
        return resultado;
    }

    /** {@code bache:0.87,grieta:0.30} -> dos detecciones; vacio -> ninguna. */
    private static List<Deteccion> detecciones(String texto) {
        List<Deteccion> detecciones = new ArrayList<>();
        if (texto.isEmpty()) {
            return detecciones;
        }
        for (String par : texto.split(",")) {
            String[] partes = par.strip().split(":");
            if (partes.length != 2 || partes[0].isBlank()) {
                throw invalida(texto);
            }
            double confianza;
            try {
                confianza = Double.parseDouble(partes[1].strip());
            } catch (NumberFormatException e) {
                throw invalida(texto);
            }
            if (!(confianza >= 0 && confianza <= 1)) {
                throw invalida(texto);
            }
            detecciones.add(new Deteccion(partes[0].strip(), confianza));
        }
        return detecciones;
    }

    private static IllegalStateException invalida(String texto) {
        return new IllegalStateException(("CLASIFICACION_FALSO_RESPUESTA (" + PROPIEDAD_RESPUESTA
                + ") no es valida: '%s'. Use vacio (sin detecciones), 'falla' o pares clase:confianza"
                + " separados por coma, con la confianza entre 0 y 1 (p. ej. 'bache:0.87,grieta:0.30').")
                .formatted(texto));
    }
}
