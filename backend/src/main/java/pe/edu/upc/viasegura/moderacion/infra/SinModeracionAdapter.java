package pe.edu.upc.viasegura.moderacion.infra;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import pe.edu.upc.viasegura.common.port.FotoSaneada;
import pe.edu.upc.viasegura.moderacion.domain.OrigenDeModeracion;
import pe.edu.upc.viasegura.moderacion.domain.PuntajeDeModeracion;
import pe.edu.upc.viasegura.moderacion.port.ModeradorDeImagen;

/**
 * Sin moderacion de fotos (NC-10b): {@code app.moderacion.tipo=ninguna}, el
 * valor por defecto fuera del perfil {@code prod}. Toda foto se acepta sin
 * revisarla, y {@link #estaActivo()} es {@code false} para que nadie lo
 * llame.
 *
 * <p>En {@code prod} es el <b>interruptor de emergencia</b> ante una caida
 * larga del servicio de inferencia (decision del usuario del 28/10): mientras
 * esta puesto se publican fotos sin revisar, y por eso el arranque deja un
 * WARN. El filtro de texto no depende de esto: sigue activo siempre.</p>
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.moderacion.tipo", havingValue = "ninguna", matchIfMissing = true)
public class SinModeracionAdapter implements ModeradorDeImagen {

    /** La version que devolveria si alguien lo llamara igual. */
    static final String VERSION = "ninguna";

    public SinModeracionAdapter() {
        log.warn("Moderacion de fotos APAGADA (MODERACION_TIPO=ninguna): toda foto se acepta sin revisarla."
                + " El filtro de texto sigue activo.");
    }

    @Override
    public boolean estaActivo() {
        return false;
    }

    /** No mide nada: puntaje 0. {@code ModeracionService} no lo llama, porque no esta activo. */
    @Override
    public PuntajeDeModeracion medir(FotoSaneada foto, OrigenDeModeracion origen) {
        return new PuntajeDeModeracion(VERSION, 0.0);
    }
}
