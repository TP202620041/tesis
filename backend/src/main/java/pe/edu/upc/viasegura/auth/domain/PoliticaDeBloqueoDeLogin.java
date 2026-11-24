package pe.edu.upc.viasegura.auth.domain;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;

/**
 * Regla del bloqueo temporal del inicio de sesion (US-02 Esc. 2).
 *
 * <p>Con {@value #INTENTOS_MAXIMOS} intentos fallidos seguidos, cada uno a
 * menos de {@link #DURACION} del anterior, el correo queda bloqueado
 * {@link #DURACION}: mientras dure se rechaza todo intento, tambien con la
 * contrasena correcta (si no, el bloqueo no frenaria una adivinanza). El
 * criterio del backlog no fija las cifras; se eligieron 5 intentos y 15
 * minutos (ver backend/README.md, «Bloqueo por intentos fallidos (US-02)»).</p>
 */
public final class PoliticaDeBloqueoDeLogin {

    /** Intentos fallidos seguidos que bloquean el correo. */
    public static final int INTENTOS_MAXIMOS = 5;

    /** Cuanto dura el bloqueo, y la ventana en que se suman los fallos. */
    public static final Duration DURACION = Duration.ofMinutes(15);

    /** Codigo estable del 409 para que el cliente no tenga que leer el mensaje. */
    public static final String CODIGO_BLOQUEADO = "LOGIN_BLOQUEADO";

    private PoliticaDeBloqueoDeLogin() {
    }

    /** La clave del contador: el correo sin espacios y en minusculas. */
    public static String clave(String email) {
        return email == null ? "" : email.strip().toLowerCase(Locale.ROOT);
    }

    /** {@code true} si el bloqueo sigue vigente en {@code ahora}. */
    public static boolean estaBloqueado(Instant bloqueadoHasta, Instant ahora) {
        return bloqueadoHasta != null && bloqueadoHasta.isAfter(ahora);
    }

    /** Minutos que faltan, redondeados hacia arriba (al menos 1). */
    public static long minutosRestantes(Instant bloqueadoHasta, Instant ahora) {
        long segundos = Duration.between(ahora, bloqueadoHasta).getSeconds();
        return Math.max(1, (segundos + 59) / 60);
    }

    /** Mensaje del 409; es el mismo exista o no la cuenta. */
    public static String mensaje(long minutos) {
        return "Demasiados intentos fallidos. Por seguridad, vuelve a intentarlo en "
                + minutos + (minutos == 1 ? " minuto." : " minutos.");
    }
}
