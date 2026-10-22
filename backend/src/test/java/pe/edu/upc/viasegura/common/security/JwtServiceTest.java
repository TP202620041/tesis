package pe.edu.upc.viasegura.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.jsonwebtoken.security.SignatureException;
import java.security.SecureRandom;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Falla temprana con el secreto JWT (DEP-01, SEC-03).
 *
 * <p>Con el secreto de firma, cualquiera emite un token con el email de un
 * ADMIN. Hasta DEP-01, {@code application.yml} traia un valor por defecto
 * versionado: si un entorno olvidaba {@code JWT_SECRET}, arrancaba firmando
 * con un secreto publico. Estos casos prueban que ya no arranca.</p>
 */
class JwtServiceTest {

    private static final long MINUTOS = 120;

    private static String secretoAleatorio(int bytes) {
        byte[] clave = new byte[bytes];
        new SecureRandom().nextBytes(clave);
        return Base64.getEncoder().encodeToString(clave);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "\t\n"})
    void secretoAusenteOVacio_noArranca(String secreto) {
        assertThatThrownBy(() -> new JwtService(secreto, MINUTOS, false))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Falta el secreto JWT")
                .hasMessageContaining("JWT_SECRET")
                .hasMessageContaining("openssl rand -base64 48");
    }

    @Test
    void secretoVacio_noArrancaNiSiquieraConLaBanderaDeDesarrollo() {
        // La bandera solo admite el secreto de desarrollo; no exime de tener uno.
        assertThatThrownBy(() -> new JwtService("", MINUTOS, true))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Falta el secreto JWT");
    }

    @Test
    void secretoQueNoEsBase64_noArranca() {
        assertThatThrownBy(() -> new JwtService("esto no es base64 !!!", MINUTOS, false))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("no es Base64 valido");
    }

    @Test
    void secretoDeMenosDe32Bytes_noArrancaYDiceCuantoMide() {
        String corto = secretoAleatorio(31);

        assertThatThrownBy(() -> new JwtService(corto, MINUTOS, false))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("demasiado corto")
                .hasMessageContaining("tiene 31 bytes")
                .hasMessageContaining("al menos 32");
    }

    @Test
    void secretoDeExactamente32Bytes_arranca() {
        JwtService servicio = new JwtService(secretoAleatorio(32), MINUTOS, false);

        assertThat(servicio.extraerEmail(servicio.generarToken("a@lima.pe", "CIUDADANO"))).isEqualTo("a@lima.pe");
    }

    @Test
    void secretoDeDesarrolloPublicado_noArrancaSinLaBandera() {
        assertThatThrownBy(() -> new JwtService(JwtService.SECRETO_DE_DESARROLLO, MINUTOS, false))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("secreto JWT es el de desarrollo")
                .hasMessageContaining("security.jwt.permitir-secreto-de-desarrollo");
    }

    @Test
    void secretoDeDesarrolloPublicado_conOtraCodificacion_tambienSeRechaza() {
        // Mismos bytes sin el relleno '=' final: la comparacion es por clave, no por texto.
        String sinRelleno = JwtService.SECRETO_DE_DESARROLLO.replace("=", "");

        assertThatThrownBy(() -> new JwtService(sinRelleno, MINUTOS, false))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("secreto JWT es el de desarrollo");
    }

    @Test
    void secretoDeDesarrolloPublicado_conLaBandera_arranca() {
        // Perfiles local y test: firman y verifican con el secreto de desarrollo.
        JwtService servicio = new JwtService(JwtService.SECRETO_DE_DESARROLLO, MINUTOS, true);

        String token = servicio.generarToken("dev@lima.pe", "ADMIN");

        assertThat(servicio.extraerEmail(token)).isEqualTo("dev@lima.pe");
        assertThat(servicio.extraerRol(token)).isEqualTo("ADMIN");
    }

    @Test
    void secretoPropio_firmaYVerifica() {
        JwtService servicio = new JwtService(secretoAleatorio(48), MINUTOS, false);

        String token = servicio.generarToken("vecina@lima.pe", "CIUDADANO");

        assertThat(servicio.extraerEmail(token)).isEqualTo("vecina@lima.pe");
        assertThat(servicio.extraerRol(token)).isEqualTo("CIUDADANO");
        assertThat(servicio.getExpirationMinutes()).isEqualTo(MINUTOS);
    }

    @Test
    void tokenFirmadoConElSecretoPublicado_noValeEnUnEntornoConSecretoPropio() {
        // Por que rotar (SEC-03): un token de ADMIN forjado con el secreto
        // viejo deja de verificar en cuanto el entorno usa uno propio.
        String forjado = new JwtService(JwtService.SECRETO_DE_DESARROLLO, MINUTOS, true)
                .generarToken("admin@viasegura.pe", "ADMIN");
        JwtService produccion = new JwtService(secretoAleatorio(48), MINUTOS, false);

        assertThatThrownBy(() -> produccion.extraerEmail(forjado)).isInstanceOf(SignatureException.class);
    }

    @Test
    void losMensajesNoRepitenElSecreto() {
        String corto = secretoAleatorio(16);

        assertThatThrownBy(() -> new JwtService(corto, MINUTOS, false))
                .isInstanceOf(IllegalStateException.class)
                .satisfies(e -> assertThat(e.getMessage()).doesNotContain(corto));
        assertThatThrownBy(() -> new JwtService(JwtService.SECRETO_DE_DESARROLLO, MINUTOS, false))
                .satisfies(e -> assertThat(e.getMessage()).doesNotContain(JwtService.SECRETO_DE_DESARROLLO));
    }
}
