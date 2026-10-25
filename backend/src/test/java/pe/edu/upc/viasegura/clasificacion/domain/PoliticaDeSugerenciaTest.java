package pe.edu.upc.viasegura.clasificacion.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Politica de sugerencia (NC-04; propuesta aceptada
 * {@code 2026-10-21-ml-clases-modelo.md}): descartar clases sin categoria
 * activa, puntaje = maxima confianza, sugerir si alcanza el umbral, y empate o
 * nada sobre el umbral = sin sugerencia.
 */
class PoliticaDeSugerenciaTest {

    private static final CategoriaClasificable BACHE = new CategoriaClasificable(1L, "Bache", "bache");
    private static final CategoriaClasificable PISTA = new CategoriaClasificable(6L, "Pista deteriorada", "grieta");
    private static final List<CategoriaClasificable> ACTIVAS = List.of(BACHE, PISTA);

    private final PoliticaDeSugerencia politica = new PoliticaDeSugerencia(0.50);

    private static ResultadoDeteccion detecto(Deteccion... detecciones) {
        return new ResultadoDeteccion("rfdetr-n-1", List.of(detecciones));
    }

    private static Deteccion d(String clase, double confianza) {
        return new Deteccion(clase, confianza);
    }

    private Optional<Sugerencia> aplicar(ResultadoDeteccion resultado) {
        return politica.aplicar(resultado, ACTIVAS);
    }

    @Test
    void sugiereLaCategoriaDeMayorPuntaje_conSuConfianzaYLaVersion() {
        Optional<Sugerencia> sugerencia = aplicar(detecto(d("grieta", 0.30), d("bache", 0.87)));

        assertThat(sugerencia).contains(new Sugerencia(1L, "Bache", new BigDecimal("0.870"), "rfdetr-n-1"));
    }

    @Test
    void elPuntajeEsLaMaximaConfianza_noLaSuma() {
        // Tres grietas de 0,45 no suman una sugerencia: el puntaje es 0,45.
        assertThat(aplicar(detecto(d("grieta", 0.45), d("grieta", 0.45), d("grieta", 0.45)))).isEmpty();

        // Y entre varias de la misma clase manda la mayor.
        assertThat(aplicar(detecto(d("grieta", 0.55), d("grieta", 0.71), d("bache", 0.60))))
                .map(Sugerencia::categoriaId).contains(6L);
        assertThat(aplicar(detecto(d("grieta", 0.55), d("grieta", 0.71), d("bache", 0.60))))
                .map(Sugerencia::confianza).contains(new BigDecimal("0.710"));
    }

    @Test
    void descartaLasClasesSinCategoriaActiva_yGanaLaSiguiente() {
        // «vereda» no tiene categoria con clase del modelo; la grieta si.
        assertThat(aplicar(detecto(d("vereda", 0.99), d("grieta", 0.62))))
                .map(Sugerencia::nombreCategoria).contains("Pista deteriorada");

        // Con la categoria del bache inactiva (fuera del catalogo), ni el mejor puntaje cuenta.
        assertThat(politica.aplicar(detecto(d("bache", 0.95), d("grieta", 0.51)), List.of(PISTA)))
                .map(Sugerencia::categoriaId).contains(6L);
        assertThat(politica.aplicar(detecto(d("bache", 0.95)), List.of())).isEmpty();
    }

    @Test
    void lasClasesSeComparanTalCual() {
        // El vocabulario del contrato /v1 es en minusculas; otra escritura no es esa clase.
        assertThat(aplicar(detecto(d("Bache", 0.90), d("BACHE ", 0.90)))).isEmpty();
    }

    @Test
    void elUmbralSeAlcanzaConIgualdad_yNoConElPuntajeRedondeado() {
        assertThat(aplicar(detecto(d("bache", 0.50)))).map(Sugerencia::confianza).contains(new BigDecimal("0.500"));
        // 0,4996 se guardaria como 0,500, pero no alcanza el umbral.
        assertThat(aplicar(detecto(d("bache", 0.4996)))).isEmpty();
        assertThat(aplicar(detecto(d("bache", 0.49), d("grieta", 0.30)))).isEmpty();
    }

    @Test
    void empateExactoEnElPrimerLugar_sinSugerencia() {
        assertThat(aplicar(detecto(d("bache", 0.80), d("grieta", 0.80)))).isEmpty();
    }

    @Test
    void unEmpateDetrasDelPrimero_noImporta() {
        CategoriaClasificable vereda = new CategoriaClasificable(2L, "Vereda dañada", "vereda");
        Optional<Sugerencia> sugerencia = politica.aplicar(
                detecto(d("bache", 0.90), d("grieta", 0.60), d("vereda", 0.60)), List.of(BACHE, PISTA, vereda));

        assertThat(sugerencia).map(Sugerencia::categoriaId).contains(1L);
    }

    @Test
    void sinDetecciones_sinSugerencia() {
        assertThat(aplicar(detecto())).isEmpty();
    }

    @Test
    void lasConfianzasFueraDeRango_seDescartan() {
        assertThat(aplicar(detecto(d("bache", 1.5), d("grieta", -0.2), d("bache", Double.NaN)))).isEmpty();
        // Sin invalidar al resto de la foto.
        assertThat(aplicar(detecto(d("bache", 1.5), d("grieta", 0.66))))
                .map(Sugerencia::categoriaId).contains(6L);
        assertThat(aplicar(detecto(d("bache", 1.0)))).map(Sugerencia::confianza).contains(new BigDecimal("1.000"));
    }

    @Test
    void laConfianzaSeRedondeaATresDecimales() {
        assertThat(aplicar(detecto(d("bache", 0.87654)))).map(Sugerencia::confianza)
                .contains(new BigDecimal("0.877"));
        assertThat(aplicar(detecto(d("bache", 0.9996)))).map(Sugerencia::confianza)
                .contains(new BigDecimal("1.000"));
    }

    @Test
    void otroUmbral_cambiaLoQueSeSugiere() {
        PoliticaDeSugerencia exigente = new PoliticaDeSugerencia(0.90);
        assertThat(exigente.aplicar(detecto(d("bache", 0.87)), ACTIVAS)).isEmpty();
        assertThat(new PoliticaDeSugerencia(0.25).aplicar(detecto(d("grieta", 0.30)), ACTIVAS))
                .map(Sugerencia::categoriaId).contains(6L);
        assertThat(exigente.umbral()).isEqualTo(0.90);
    }

    @ParameterizedTest
    @ValueSource(doubles = {0.0, -0.1, 1.01, Double.NaN})
    void umbralFueraDeRango_noSeAcepta(double umbral) {
        assertThatThrownBy(() -> new PoliticaDeSugerencia(umbral))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("app.clasificacion.umbral");
    }

    @Test
    void laVersionDelModeloEsObligatoriaYCabeEnLaColumna() {
        assertThatThrownBy(() -> new ResultadoDeteccion(" ", List.of())).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ResultadoDeteccion(null, List.of())).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ResultadoDeteccion("v".repeat(41), List.of()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(new ResultadoDeteccion("v".repeat(40), null).detecciones()).isEmpty();
    }
}
