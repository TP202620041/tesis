package pe.edu.upc.viasegura.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import pe.edu.upc.viasegura.auth.domain.PoliticaDeBloqueoDeLogin;

/** US-02 Esc. 2: la regla pura del bloqueo del inicio de sesion. */
class PoliticaDeBloqueoDeLoginTest {

    private static final Instant AHORA = Instant.parse("2026-11-23T12:00:00Z");

    @Test
    void cifrasElegidas() {
        assertThat(PoliticaDeBloqueoDeLogin.INTENTOS_MAXIMOS).isEqualTo(5);
        assertThat(PoliticaDeBloqueoDeLogin.DURACION.toMinutes()).isEqualTo(15);
    }

    @Test
    void clave_ignoraEspaciosYMayusculas() {
        assertThat(PoliticaDeBloqueoDeLogin.clave("  Ana@Lima.PE ")).isEqualTo("ana@lima.pe");
        assertThat(PoliticaDeBloqueoDeLogin.clave(null)).isEmpty();
    }

    @Test
    void estaBloqueado_soloConUnLimiteFuturo() {
        assertThat(PoliticaDeBloqueoDeLogin.estaBloqueado(null, AHORA)).isFalse();
        assertThat(PoliticaDeBloqueoDeLogin.estaBloqueado(AHORA, AHORA)).isFalse();
        assertThat(PoliticaDeBloqueoDeLogin.estaBloqueado(AHORA.minusSeconds(1), AHORA)).isFalse();
        assertThat(PoliticaDeBloqueoDeLogin.estaBloqueado(AHORA.plusSeconds(1), AHORA)).isTrue();
    }

    @Test
    void minutosRestantes_redondeaHaciaArriba() {
        assertThat(PoliticaDeBloqueoDeLogin.minutosRestantes(AHORA.plusSeconds(1), AHORA)).isEqualTo(1);
        assertThat(PoliticaDeBloqueoDeLogin.minutosRestantes(AHORA.plusSeconds(61), AHORA)).isEqualTo(2);
        assertThat(PoliticaDeBloqueoDeLogin.minutosRestantes(AHORA.plusSeconds(900), AHORA)).isEqualTo(15);
    }

    @Test
    void mensaje_singularYPlural() {
        assertThat(PoliticaDeBloqueoDeLogin.mensaje(1)).endsWith("1 minuto.");
        assertThat(PoliticaDeBloqueoDeLogin.mensaje(15)).endsWith("15 minutos.");
    }
}
