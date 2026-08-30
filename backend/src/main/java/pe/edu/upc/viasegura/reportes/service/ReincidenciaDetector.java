package pe.edu.upc.viasegura.reportes.service;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * Deteccion de "posible reincidencia" en un comentario ciudadano (US-27,
 * Escenario 2).
 *
 * <p>Es deliberadamente un <strong>emparejamiento de palabras/frases clave
 * acotado y explicito</strong>, NO analisis de sentimiento ni NLP: el texto
 * se normaliza (minusculas y sin tildes) y se busca la aparicion de
 * cualquiera de los terminos de {@link #INDICIOS}. Se prioriza la
 * simplicidad y la explicabilidad frente a la exhaustividad: un funcionario
 * revisa el reporte marcado, asi que un falso negativo ocasional es
 * aceptable y preferible a un heuristico fragil que etiquete de mas.</p>
 */
@Component
public class ReincidenciaDetector {

    /**
     * Terminos (ya normalizados: minusculas, sin tildes) cuya aparicion
     * sugiere que el dano reaparecio. Se usan raices donde es seguro
     * ("reaparec" cubre reaparecio/reaparece; "reincid" cubre
     * reincidencia/reincidio).
     */
    private static final List<String> INDICIOS = List.of(
            "reincid",
            "reaparec",
            "resurg",
            "volvio a",
            "otra vez",
            "de nuevo",
            "nuevamente",
            "sigue igual",
            "mal reparado",
            "mal arreglado",
            "no lo arreglaron",
            "no arreglaron");

    public boolean pareceReincidencia(String texto) {
        if (!StringUtils.hasText(texto)) {
            return false;
        }
        String normalizado = normalizar(texto);
        return INDICIOS.stream().anyMatch(normalizado::contains);
    }

    /** Minusculas y sin diacriticos, para que "reaparecio" y "reapareció" coincidan. */
    private String normalizar(String texto) {
        String sinTildes = Normalizer.normalize(texto, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        return sinTildes.toLowerCase(Locale.ROOT);
    }
}
