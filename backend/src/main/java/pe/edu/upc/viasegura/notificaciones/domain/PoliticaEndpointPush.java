package pe.edu.upc.viasegura.notificaciones.domain;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Locale;

/**
 * Que endpoints de Web Push se aceptan (NC-07). Regla pura, sin I/O.
 *
 * <p>Cuando exista el envio real (US-21), el servidor hara una peticion HTTP
 * al {@code endpoint} que mando el cliente. Sin esta regla, cualquier usuario
 * autenticado podria registrar una URL interna ({@code https://10.0.0.5/…},
 * {@code https://localhost/…}) y convertir al backend en un proxy hacia la red
 * privada (SSRF). Por eso solo se admiten los servicios de push de los
 * navegadores, por lista blanca de hosts.</p>
 *
 * <p>El host se obtiene parseando la URL con {@link URI}, nunca con
 * expresiones sobre la cadena, y ademas se exige: esquema {@code https}, sin
 * credenciales ({@code usuario@host}), puerto por defecto (o 443) y un host
 * que no sea una IP literal. Una entrada de la lista puede ser un host exacto
 * ({@code fcm.googleapis.com}) o un comodin de subdominio
 * ({@code *.notify.windows.com}), que exige al menos una etiqueta delante y
 * no admite el dominio pelado. La comparacion no distingue mayusculas.</p>
 */
public final class PoliticaEndpointPush {

    private PoliticaEndpointPush() {
    }

    /** {@code true} si el endpoint apunta a un servicio de push permitido. */
    public static boolean esPermitido(String endpoint, List<String> hostsPermitidos) {
        String host = hostValido(endpoint);
        if (host == null) {
            return false;
        }
        return hostsPermitidos.stream()
                .map(h -> h.trim().toLowerCase(Locale.ROOT))
                .filter(h -> !h.isEmpty())
                .anyMatch(patron -> coincide(host, patron));
    }

    /** El host en minusculas si la URL cumple las condiciones de forma; si no, {@code null}. */
    private static String hostValido(String endpoint) {
        if (endpoint == null) {
            return null;
        }
        URI uri;
        try {
            uri = new URI(endpoint);
        } catch (URISyntaxException e) {
            return null;
        }
        if (!"https".equalsIgnoreCase(uri.getScheme())
                || uri.getRawUserInfo() != null
                || (uri.getPort() != -1 && uri.getPort() != 443)) {
            return null;
        }
        String host = uri.getHost();
        if (host == null || host.isEmpty() || host.endsWith(".")) {
            return null;
        }
        host = host.toLowerCase(Locale.ROOT);
        if (esIpLiteral(host)) {
            return null;
        }
        return host;
    }

    private static boolean esIpLiteral(String host) {
        // IPv6 entre corchetes, o IPv4 (solo digitos y puntos).
        return host.startsWith("[") || host.matches("[0-9.]+");
    }

    private static boolean coincide(String host, String patron) {
        if (patron.startsWith("*.")) {
            String sufijo = patron.substring(1); // ".notify.windows.com"
            return host.endsWith(sufijo) && host.length() > sufijo.length();
        }
        return host.equals(patron);
    }
}
