package pe.edu.upc.viasegura.common.port;

import java.util.regex.Pattern;

/**
 * Un correo de texto para {@link CorreoSaliente} (DEP-08).
 *
 * @param para     direccion del destinatario (una sola).
 * @param asunto   asunto.
 * @param texto    cuerpo en texto plano.
 * @param etiqueta categoria del correo para filtrar en el panel del proveedor
 *                 ({@code recuperacion}, {@code soporte}, {@code aviso-reporte}).
 *                 Nunca un dato personal: solo minusculas, digitos, {@code -} y
 *                 {@code _}, que es lo que admite una etiqueta de Resend.
 */
public record MensajeCorreo(String para, String asunto, String texto, String etiqueta) {

    private static final Pattern ETIQUETA_VALIDA = Pattern.compile("[a-z0-9_-]{1,64}");

    public MensajeCorreo {
        if (para == null || para.isBlank()) {
            throw new IllegalArgumentException("El correo necesita un destinatario");
        }
        if (asunto == null || asunto.isBlank()) {
            throw new IllegalArgumentException("El correo necesita un asunto");
        }
        if (texto == null) {
            throw new IllegalArgumentException("El correo necesita un texto");
        }
        if (etiqueta == null || !ETIQUETA_VALIDA.matcher(etiqueta).matches()) {
            throw new IllegalArgumentException("Etiqueta de correo invalida: solo [a-z0-9_-], hasta 64 caracteres");
        }
    }

    /**
     * Solo la etiqueta: el destinatario es un dato personal y el texto puede
     * llevar un token de recuperacion, y un {@code toString} termina tarde o
     * temprano en un log.
     */
    @Override
    public String toString() {
        return "MensajeCorreo[etiqueta=" + etiqueta + "]";
    }
}
