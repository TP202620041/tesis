package pe.edu.upc.viasegura.auth.dto;

import java.util.List;

/**
 * Estado de consentimientos del propio usuario (D-12):
 * {@code GET /api/auth/me/consentimientos}.
 *
 * @param versionTerminosVigente version de los terminos que la app exige hoy
 * @param debeAceptarTerminos    {@code true} si no tiene aceptada esa version
 *                               (mismo valor que en {@code UsuarioResponse})
 * @param vigentes               una entrada por finalidad autorizada hoy
 * @param historial              todas las aceptaciones, de la mas reciente a
 *                               la mas antigua, revocadas incluidas
 */
public record ConsentimientosResponse(
        String versionTerminosVigente,
        boolean debeAceptarTerminos,
        List<ConsentimientoResponse> vigentes,
        List<ConsentimientoResponse> historial
) {}
