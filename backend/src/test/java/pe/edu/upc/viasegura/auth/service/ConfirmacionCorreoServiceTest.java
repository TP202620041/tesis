package pe.edu.upc.viasegura.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import pe.edu.upc.viasegura.auth.domain.TokenConfirmacionCorreo;

/**
 * Reglas puras de la confirmacion del correo (NC-09), sin base: de donde sale
 * la URL de la PWA para el enlace, y el hash y el ciclo del token.
 */
class ConfirmacionCorreoServiceTest {

    @Test
    void conFrontendUrl_esaManda() {
        assertThat(ConfirmacionCorreoService.urlDeLaPwa("https://ciudadviva.app/",
                List.of("https://otra.vercel.app"))).isEqualTo("https://ciudadviva.app");
    }

    @Test
    void sinFrontendUrl_elPrimerOrigenDeCors() {
        assertThat(ConfirmacionCorreoService.urlDeLaPwa("",
                List.of("https://ciudadviva.app", "https://www.ciudadviva.app"))).isEqualTo("https://ciudadviva.app");
        assertThat(ConfirmacionCorreoService.urlDeLaPwa(null, List.of(" http://localhost:3000 ")))
                .isEqualTo("http://localhost:3000");
    }

    @ParameterizedTest
    @ValueSource(strings = {"ciudadviva.app", "ftp://ciudadviva.app", "https://ciudadviva.app/app",
            "https://ciudadviva.app?x=1", "https://user@ciudadviva.app", "https://", "no es una url"})
    void unaUrlQueNoEsUnOrigen_noArranca(String url) {
        assertThatThrownBy(() -> ConfirmacionCorreoService.urlDeLaPwa(url, List.of()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("FRONTEND_URL");
    }

    @Test
    void sinNingunaUrl_noArranca() {
        assertThatThrownBy(() -> ConfirmacionCorreoService.urlDeLaPwa("", List.of()))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void elHash_esSha256EnHexadecimal_yDeterminista() {
        String hash = TokenConfirmacionCorreo.hashDe("abc");
        // Vector de prueba de FIPS 180-2 para "abc".
        assertThat(hash).isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assertThat(TokenConfirmacionCorreo.hashDe("abc")).isEqualTo(hash);
    }

    @Test
    void elToken_seEmiteUnaSolaVez_ySoloSiSigueVigente() {
        Instant ahora = Instant.now();
        TokenConfirmacionCorreo token = TokenConfirmacionCorreo.builder()
                .expiresAt(ahora.plus(24, ChronoUnit.HOURS)).build();

        assertThat(token.puedeEmitirse(ahora)).isTrue();
        token.emitir("hash");
        assertThat(token.puedeEmitirse(ahora)).isFalse();
        assertThatThrownBy(() -> token.emitir("otro")).isInstanceOf(IllegalStateException.class);

        TokenConfirmacionCorreo vencido = TokenConfirmacionCorreo.builder().expiresAt(ahora).build();
        assertThat(vencido.puedeEmitirse(ahora)).isFalse();
        assertThat(vencido.vencio(ahora)).isTrue();
    }
}
