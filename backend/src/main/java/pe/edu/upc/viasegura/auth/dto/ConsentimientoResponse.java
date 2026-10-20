package pe.edu.upc.viasegura.auth.dto;

import java.time.Instant;
import pe.edu.upc.viasegura.auth.domain.Consentimiento;

/**
 * Una fila del historial de consentimientos del propio usuario (D-12).
 *
 * <p>{@code vigente} es {@code true} solo en la aceptacion que hoy autoriza
 * esa finalidad: la mas reciente sin revocar y, para
 * {@code TERMINOS_Y_PRIVACIDAD}, de la version vigente. Una aceptacion de
 * una version anterior de los terminos queda en el historial con
 * {@code vigente=false} aunque no se haya revocado.</p>
 */
public record ConsentimientoResponse(
        Long id,
        String finalidad,
        String versionDocumento,
        Instant aceptadoEn,
        Instant revocadoEn,
        boolean vigente
) {
    public static ConsentimientoResponse desde(Consentimiento c, boolean vigente) {
        return new ConsentimientoResponse(
                c.getId(),
                c.getFinalidad().name(),
                c.getVersionDocumento(),
                c.getAceptadoEn(),
                c.getRevocadoEn(),
                vigente);
    }
}
