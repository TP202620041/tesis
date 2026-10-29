package pe.edu.upc.viasegura.moderacion.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;

/**
 * La regla pura del filtro de groserias (NC-10b, propuesta §5) con una lista
 * de prueba, para que cada caso diga que paso de la normalizacion prueba. La
 * lista real y el corpus legitimo los prueba {@code ListaDeGroseriasTest}.
 *
 * <p>Las groserias de este archivo son las minimas para probar la regla; no
 * hay otra forma de probar un filtro de groserias.</p>
 */
class FiltroDeGroseriasTest {

    private static final FiltroDeGroserias FILTRO = FiltroDeGroserias.desdeLineas(List.of(
            "# version: prueba-1",
            "puta",
            "mierda",
            "huevon",
            "culo",
            "coño",
            "perra",
            "ctm",
            "concha de tu madre",
            "hijo de perra"));

    // --- Positivos: cada paso de la normalizacion -------------------------------

    @ParameterizedTest
    @ValueSource(strings = {
            "puta",
            "PUTA",                       // minusculas
            "Púta",                       // tildes
            "pütá",                       // dieresis
            "ｐｕｔａ",                    // NFKC: letras de ancho completo
            "pu​ta",                 // un espacio de ancho cero no corta la palabra
            "put4", "pu7a", "mi3rd4", "put@", "hu3v0n",   // leetspeak
            "m1erda",                     // el 1 como i
            "cu1o",                       // el 1 como l
            "putaaaa", "PUTAAA", "mieeerdaaa",       // letras repetidas, reducidas a 1
            "huevóóón",                   // tildes y letras repetidas
            "p u t a", "p.u.t.a", "p-u-t-a", "p_u_t_a",   // letras separadas
            "p*ta", "p#ta", "mi*rda",     // comodin dentro de la palabra
            "**puta**",                   // los comodines al borde se descartan
            "c t m", "C.T.M.", "CTM",     // abreviatura, tambien separada
            "La pista esta hecha una mierda.",       // dentro de una oracion
            "¡¡¡PUTA!!!"})
    void detectaLaGroseria(String texto) {
        assertThat(FILTRO.tieneGroseria(texto)).as(texto).isTrue();
    }

    @Test
    void lasRachasSeReducenA2YA1_peroLasEntradasNo() {
        // «perrrra» reducida a 2 es «perra»: coincide.
        assertThat(FILTRO.coincidencia("perrrra")).contains("perra");
        // «pera» (la fruta) no es «perra»: las entradas no se reducen.
        assertThat(FILTRO.coincidencia("pera")).isEmpty();
        assertThat(FiltroDeGroserias.formas("perrrra")).containsExactlyInAnyOrder("perra", "pera");
        assertThat(FiltroDeGroserias.formas("perra")).containsExactly("perra");
    }

    @Test
    void elUnoSePruebaComoIYComoL() {
        assertThat(FiltroDeGroserias.formas(FiltroDeGroserias.tokens("m1erda").get(0)))
                .containsExactlyInAnyOrder("mierda", "mlerda");
    }

    @Test
    void laExpresionSoloCoincideConSusPalabrasSeguidas() {
        assertThat(FILTRO.coincidencia("Eres un concha de tu madre")).contains("concha de tu madre");
        assertThat(FILTRO.coincidencia("CONCHA   DE  TU MADRE")).contains("concha de tu madre");
        assertThat(FILTRO.coincidencia("concha d3 tu madre")).contains("concha de tu madre");
        assertThat(FILTRO.coincidencia("hijo de perraaa")).contains("perra");
        // Las palabras sueltas de la expresion son legitimas.
        assertThat(FILTRO.coincidencia("Rosa Concha, de Surco")).isEmpty();
        assertThat(FILTRO.coincidencia("la concha de abanico")).isEmpty();
        assertThat(FILTRO.coincidencia("concha de su madre")).isEmpty();
        assertThat(FILTRO.coincidencia("de tu madre")).isEmpty();
        assertThat(FILTRO.coincidencia("concha, de tu casa madre")).isEmpty();
    }

    @Test
    void laCoincidenciaEsLaEntradaDeLaLista_paraElLog() {
        assertThat(FILTRO.coincidencia("hu3v0n")).contains("huevon");
        assertThat(FILTRO.coincidencia("Calle sin nada raro")).isEmpty();
        assertThat(FILTRO.coincidencia(null)).isEmpty();
        assertThat(FILTRO.coincidencia("   ")).isEmpty();
    }

    // --- Negativos: el problema de Scunthorpe y la ñ ----------------------------

    @ParameterizedTest
    @ValueSource(strings = {
            "vehículo", "Vehiculo", "obstáculo", "película", "cálculo", "computadora", "disputa", "reputación",
            "imputado", "culebra", "Culqui", "putrefacto", "huevo", "huevos",
            "año", "Año Nuevo", "cono", "conos de seguridad", "pera", "peras",
            "Concha", "Quispe Concha", "concheros",
            "km 15", "Av. 28 de Julio 1234", "2026", "N°5", "Mz. B Lt. 5", "S.J.L.", "A.A.H.H. Santa Rosa",
            "p**a",                       // mas comodines que letras: no es nada
            "**ojo**", "#NoMasHuecos", "50*30 cm",
            "a y o", "Jr. A y B"})
    void noDetectaPalabrasLegitimas(String texto) {
        assertThat(FILTRO.coincidencia(texto)).as(texto).isEmpty();
    }

    @Test
    void laEñeNoSePliega_coñoNoEsCono_niAñoEsAno() {
        assertThat(FILTRO.coincidencia("coño")).contains("coño");
        assertThat(FILTRO.coincidencia("COÑO")).contains("coño");
        assertThat(FILTRO.coincidencia("c0ño")).contains("coño");
        assertThat(FILTRO.coincidencia("cono")).isEmpty();
        assertThat(FiltroDeGroserias.normalizarEntrada("Año Nuevo")).isEqualTo("año nuevo");
        assertThat(FiltroDeGroserias.normalizarEntrada("  Maricón  ")).isEqualTo("maricon");
        // La ñ en forma descompuesta (n + tilde combinada) tambien se conserva.
        assertThat(FiltroDeGroserias.normalizarEntrada("coño")).isEqualTo("coño");
    }

    @Test
    void unNumeroSueltoNoCambia_niUnTokenSinLetras() {
        assertThat(FiltroDeGroserias.tokens("km 15 en 2026")).containsExactly("km", "en");
        assertThat(FiltroDeGroserias.tokens("3 4 5")).isEmpty();
    }

    @Test
    void tresOMasLetrasSueltasSeUnen_dosNo() {
        assertThat(FiltroDeGroserias.tokens("p u t a")).containsExactly("puta");
        assertThat(FiltroDeGroserias.tokens("y a la vez")).containsExactly("y", "a", "la", "vez");
    }

    // --- El archivo de la lista -------------------------------------------------

    @Test
    void sinLineaDeVersion_noSeArma() {
        assertThatThrownBy(() -> FiltroDeGroserias.desdeLineas(List.of("# lista", "puta")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("version");
    }

    @ParameterizedTest
    @ValueSource(strings = {"put4", "p*ta", "una dos tres cuatro cinco", "putaaa", "ho-la"})
    void unaEntradaInvalida_noSeArma_yDiceLaLinea(String entrada) {
        assertThatThrownBy(() -> FiltroDeGroserias.desdeLineas(List.of("# version: x", entrada)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Linea 2");
    }

    @Test
    void lasEntradasSeNormalizanAlLeerlas_yLaVersionSeConserva() {
        FiltroDeGroserias filtro = FiltroDeGroserias.desdeLineas(List.of(
                "#  Version:  2026-10-29.1 ", "", "  Maricón ", "CONCHA  DE TU MADRE", "maricon"));

        assertThat(filtro.version()).isEqualTo("2026-10-29.1");
        assertThat(filtro.tamano()).isEqualTo(2);
        assertThat(filtro.coincidencia("maricón")).contains("maricon");
    }

    @Test
    void conMuchosUnos_soloPruebaTodosIOTodosL() {
        assertThat(FiltroDeGroserias.formas(FiltroDeGroserias.tokens("a1111b").get(0)))
                .containsExactlyInAnyOrder("aiib", "aib", "allb", "alb");
    }
}
