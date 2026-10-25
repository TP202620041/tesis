package pe.edu.upc.viasegura.clasificacion.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import pe.edu.upc.viasegura.clasificacion.domain.Deteccion;
import pe.edu.upc.viasegura.clasificacion.domain.ResultadoDeteccion;
import pe.edu.upc.viasegura.clasificacion.port.ClasificacionNoDisponibleException;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;

/** Clasificador falso (NC-04): respuestas fijas por configuracion, incluido el modo que falla. */
class FalsoClasificadorAdapterTest {

    private static final ArchivoSubido FOTO = new ArchivoSubido(new byte[] {1, 2, 3}, "image/jpeg", "f.jpg");

    @Test
    void conParesClaseConfianza_detectaEsoEnCualquierFoto() {
        ResultadoDeteccion resultado = new FalsoClasificadorAdapter(" bache:0.87 , grieta:0.3 ", "falso-0")
                .detectar(FOTO);

        assertThat(resultado.versionModelo()).isEqualTo("falso-0");
        assertThat(resultado.detecciones())
                .containsExactly(new Deteccion("bache", 0.87), new Deteccion("grieta", 0.3));
    }

    @Test
    void vacio_noDetectaNada() {
        assertThat(new FalsoClasificadorAdapter("", "falso-0").detectar(FOTO).detecciones()).isEmpty();
        assertThat(new FalsoClasificadorAdapter(null, "falso-0").detectar(FOTO).detecciones()).isEmpty();
    }

    @Test
    void modoFalla_lanzaComoUnServicioCaido() {
        FalsoClasificadorAdapter falla = new FalsoClasificadorAdapter("FALLA", "falso-0");

        assertThatThrownBy(() -> falla.detectar(FOTO)).isInstanceOf(ClasificacionNoDisponibleException.class);
    }

    @Test
    void fotoVacia_noSeClasifica() {
        FalsoClasificadorAdapter falso = new FalsoClasificadorAdapter("bache:0.9", "falso-0");

        assertThatThrownBy(() -> falso.detectar(new ArchivoSubido(null, "image/jpeg", "f.jpg")))
                .isInstanceOf(ClasificacionNoDisponibleException.class);
        assertThatThrownBy(() -> falso.detectar(null)).isInstanceOf(ClasificacionNoDisponibleException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"bache", "bache:", ":0.5", "bache:alta", "bache:1.2", "bache:-0.1", "bache:0.5:0.6",
            "bache:0.5,,grieta:0.3", "bache:NaN"})
    void unaRespuestaMalEscrita_noArrancaYNombraLaVariable(String respuesta) {
        assertThatThrownBy(() -> new FalsoClasificadorAdapter(respuesta, "falso-0"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("CLASIFICACION_FALSO_RESPUESTA")
                .hasMessageContaining("bache:0.87,grieta:0.30");
    }

    @Test
    void unaVersionInvalida_noArranca() {
        assertThatThrownBy(() -> new FalsoClasificadorAdapter("", "x".repeat(41)))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
