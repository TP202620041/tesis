package pe.edu.upc.viasegura.auth.domain;

import java.net.IDN;
import java.util.Collection;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Dominios de correo desechables o temporales (NC-09): el registro rechaza un
 * correo de uno de ellos, porque la cuenta tiene que poder recibir avisos
 * durante meses y no solo el enlace de confirmacion (decision del usuario,
 * 28/10).
 *
 * <p>Regla pura, sin I/O: la lista la lee de
 * {@code resources/data/dominios-desechables.txt} un adaptador de
 * {@code auth/infra} al arrancar. Cubre los subdominios: si
 * {@code mailinator.com} esta en la lista, tambien {@code x.mailinator.com}
 * (varios servicios reparten direcciones bajo subdominios propios). Nunca
 * compara un dominio de primer nivel solo ({@code com}), que no esta en la
 * lista y bloquearia todo.</p>
 */
public final class DominiosDesechables {

    private final Set<String> dominios;

    private DominiosDesechables(Set<String> dominios) {
        this.dominios = Set.copyOf(dominios);
    }

    /**
     * Arma la lista desde las lineas del archivo: ignora las vacias y las que
     * empiezan con {@code #}, y normaliza el resto como {@link #normalizar}.
     */
    public static DominiosDesechables desdeLineas(Collection<String> lineas) {
        Set<String> dominios = new HashSet<>();
        for (String linea : lineas) {
            String limpia = linea.strip();
            if (limpia.isEmpty() || limpia.startsWith("#")) {
                continue;
            }
            dominios.add(normalizar(limpia));
        }
        return new DominiosDesechables(dominios);
    }

    public int tamano() {
        return dominios.size();
    }

    /** Si el dominio, o alguno de sus dominios padre (sin llegar al de primer nivel), esta en la lista. */
    public boolean incluye(String dominio) {
        String actual = normalizar(dominio);
        while (actual.contains(".")) {
            if (dominios.contains(actual)) {
                return true;
            }
            actual = actual.substring(actual.indexOf('.') + 1);
        }
        return false;
    }

    /**
     * Minusculas, sin punto final y en ASCII ({@code münchen.de} pasa a
     * {@code xn--mnchen-3ya.de}), que es como esta escrita la lista y como se
     * consulta el DNS. Si el dominio no se puede convertir, queda en
     * minusculas: no coincidira con la lista, y el DNS dira si recibe correo.
     */
    public static String normalizar(String dominio) {
        String limpio = dominio.strip().toLowerCase(Locale.ROOT);
        while (limpio.endsWith(".")) {
            limpio = limpio.substring(0, limpio.length() - 1);
        }
        try {
            return IDN.toASCII(limpio, IDN.ALLOW_UNASSIGNED).toLowerCase(Locale.ROOT);
        } catch (IllegalArgumentException e) {
            return limpio;
        }
    }
}
