package pe.edu.upc.viasegura.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import pe.edu.upc.viasegura.auth.domain.Consentimiento;
import pe.edu.upc.viasegura.auth.domain.FinalidadConsentimiento;

/** Reglas puras del consentimiento (D-12), sin Spring ni base de datos. */
class ConsentimientoTest {

    private static Consentimiento aceptado(Instant cuando) {
        return Consentimiento.builder()
                .finalidad(FinalidadConsentimiento.NOTIFICACIONES_PUSH)
                .versionDocumento("push-v1")
                .aceptadoEn(cuando)
                .build();
    }

    @Test
    void revocar_llenaRevocadoEnYConservaLaAceptacion() {
        Instant aceptadoEn = Instant.parse("2026-10-01T10:00:00Z");
        Instant revocadoEn = Instant.parse("2026-10-02T10:00:00Z");
        Consentimiento c = aceptado(aceptadoEn);

        c.revocar(revocadoEn);

        assertThat(c.estaRevocado()).isTrue();
        assertThat(c.getRevocadoEn()).isEqualTo(revocadoEn);
        assertThat(c.getAceptadoEn()).isEqualTo(aceptadoEn);
        assertThat(c.getVersionDocumento()).isEqualTo("push-v1");
    }

    @Test
    void revocarDosVeces_conservaLaFechaDeLaPrimera() {
        Consentimiento c = aceptado(Instant.parse("2026-10-01T10:00:00Z"));
        Instant primera = Instant.parse("2026-10-02T10:00:00Z");

        c.revocar(primera);
        c.revocar(Instant.parse("2026-10-05T10:00:00Z"));

        assertThat(c.getRevocadoEn()).isEqualTo(primera);
    }

    @Test
    void sinRevocar_noEstaRevocado() {
        assertThat(aceptado(Instant.now()).estaRevocado()).isFalse();
    }

    @Test
    void soloLosTerminosSonObligatorios() {
        assertThat(FinalidadConsentimiento.TERMINOS_Y_PRIVACIDAD.esObligatoria()).isTrue();
        assertThat(FinalidadConsentimiento.NOTIFICACIONES_PUSH.esObligatoria()).isFalse();
        assertThat(FinalidadConsentimiento.NOTIFICACIONES_CORREO.esObligatoria()).isFalse();
    }
}
