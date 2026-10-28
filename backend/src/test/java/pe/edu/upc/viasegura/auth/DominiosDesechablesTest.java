package pe.edu.upc.viasegura.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import pe.edu.upc.viasegura.auth.domain.DominiosDesechables;

/**
 * La regla de los dominios desechables (NC-09) y la instantanea versionada de
 * la lista ({@code resources/data/dominios-desechables.txt}), sin Spring.
 */
class DominiosDesechablesTest {

    private static final DominiosDesechables PEQUENA = DominiosDesechables.desdeLineas(List.of(
            "# comentario",
            "",
            "  mailinator.com  ",
            "TEMP-MAIL.ORG",
            "xn--mnchen-3ya.de"));

    private static List<String> lineasDelArchivo() throws Exception {
        try (InputStream entrada = DominiosDesechablesTest.class.getClassLoader()
                .getResourceAsStream("data/dominios-desechables.txt")) {
            assertThat(entrada).as("data/dominios-desechables.txt en el classpath").isNotNull();
            return new BufferedReader(new InputStreamReader(entrada, StandardCharsets.UTF_8)).lines().toList();
        }
    }

    @Test
    void ignoraComentariosYLineasVacias_yNormaliza() {
        assertThat(PEQUENA.tamano()).isEqualTo(3);
        assertThat(PEQUENA.incluye("temp-mail.org")).isTrue();
        assertThat(PEQUENA.incluye("# comentario")).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"mailinator.com", "MAILINATOR.COM", "mailinator.com.", " mailinator.com ",
            "bandeja.mailinator.com", "a.b.mailinator.com", "temp-mail.org"})
    void elDominioOUnSubdominio_estaEnLaLista(String dominio) {
        assertThat(PEQUENA.incluye(dominio)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"notmailinator.com", "mailinator.co", "mailinator.com.pe", "gmail.com", "com",
            "mailinator", ""})
    void unDominioParecidoOElDePrimerNivel_noLoEsta(String dominio) {
        assertThat(PEQUENA.incluye(dominio)).isFalse();
    }

    @Test
    void unDominioInternacional_seComparaEnAscii() {
        assertThat(PEQUENA.incluye("münchen.de")).isTrue();
        assertThat(DominiosDesechables.normalizar("München.DE.")).isEqualTo("xn--mnchen-3ya.de");
    }

    @Test
    void laInstantaneaVersionada_tieneLosConocidos_yNingunoDeLosProveedoresComunes() throws Exception {
        List<String> lineas = lineasDelArchivo();
        DominiosDesechables lista = DominiosDesechables.desdeLineas(lineas);

        // La cabecera nombra la fuente, el commit y la licencia (README, NC-09).
        assertThat(String.join("\n", lineas))
                .contains("disposable-email-domains", "fa960072882ed3e629ffdc064d2ccb9d5b461c2f", "CC0 1.0");
        assertThat(lista.tamano()).isEqualTo(9963);
        assertThat(List.of("mailinator.com", "10minutemail.com", "temp-mail.org", "yopmail.com",
                "guerrillamail.com", "x.mailinator.com"))
                .allSatisfy(dominio -> assertThat(lista.incluye(dominio)).as(dominio).isTrue());
        assertThat(List.of("gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com", "lima.pe",
                "upc.edu.pe", "ciudadviva.app", "munlima.gob.pe"))
                .allSatisfy(dominio -> assertThat(lista.incluye(dominio)).as(dominio).isFalse());
    }
}
