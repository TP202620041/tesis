package pe.edu.upc.viasegura.moderacion.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import pe.edu.upc.viasegura.moderacion.domain.FiltroDeGroserias;

/**
 * Guarda de la lista real de groserias (NC-10b, propuesta §5):
 * {@code resources/moderacion/groserias-es-pe.txt}.
 *
 * <ul>
 *   <li>El archivo tiene version, ninguna entrada duplicada y cada entrada esta
 *       escrita ya normalizada: lo que se lee es lo que se compara.</li>
 *   <li>Cada entrada la detecta el filtro: ninguna quedo inalcanzable.</li>
 *   <li><b>El problema de Scunthorpe:</b> ninguna linea ni ninguna palabra del
 *       corpus legitimo ({@code test/resources/moderacion/corpus-legitimo.txt}:
 *       vocabulario vial, los 43 distritos, apellidos y nombres frecuentes y
 *       las palabras legitimas de la propuesta) coincide con la lista.</li>
 * </ul>
 */
class ListaDeGroseriasTest {

    private static final String CORPUS = "moderacion/corpus-legitimo.txt";
    private static final Pattern NO_LETRA = Pattern.compile("[^\\p{L}]+");

    private static List<String> entradas(List<String> lineas) {
        return lineas.stream()
                .filter(l -> !l.isBlank() && !l.strip().startsWith("#"))
                .toList();
    }

    @Test
    void elArchivoTieneVersion_yLaConfiguracionLoCarga() {
        List<String> lineas = ListaDeGroseriasConfig.leer(ListaDeGroseriasConfig.RUTA);
        assertThat(lineas).anySatisfy(l -> assertThat(l).matches("# version: \\S+"));

        FiltroDeGroserias filtro = new ListaDeGroseriasConfig().filtroDeGroserias();
        assertThat(filtro.version()).isNotBlank();
        assertThat(filtro.tamano()).isEqualTo(entradas(lineas).size()).isGreaterThanOrEqualTo(100);
    }

    @Test
    void cadaEntradaEstaNormalizada_esValida_yNoSeRepite() {
        List<String> entradas = entradas(ListaDeGroseriasConfig.leer(ListaDeGroseriasConfig.RUTA));
        Set<String> vistas = new HashSet<>();
        List<String> duplicadas = new ArrayList<>();

        for (String entrada : entradas) {
            assertThat(entrada).as("entrada sin normalizar").isEqualTo(FiltroDeGroserias.normalizarEntrada(entrada));
            assertThat(FiltroDeGroserias.esEntradaValida(entrada)).as("entrada invalida: %s", entrada).isTrue();
            if (!vistas.add(entrada)) {
                duplicadas.add(entrada);
            }
        }
        assertThat(duplicadas).as("entradas duplicadas").isEmpty();
    }

    @Test
    void elFiltroDetectaCadaEntrada() {
        FiltroDeGroserias filtro = new ListaDeGroseriasConfig().filtroDeGroserias();

        for (String entrada : entradas(ListaDeGroseriasConfig.leer(ListaDeGroseriasConfig.RUTA))) {
            assertThat(filtro.tieneGroseria(entrada)).as(entrada).isTrue();
            assertThat(filtro.tieneGroseria("En el reporte: " + entrada.toUpperCase() + ".")).as(entrada).isTrue();
        }
    }

    @Test
    void ningunaLineaNiPalabraDelCorpusLegitimoCoincide() {
        FiltroDeGroserias filtro = new ListaDeGroseriasConfig().filtroDeGroserias();
        List<String> lineas = entradas(ListaDeGroseriasConfig.leer(CORPUS));
        assertThat(lineas).hasSizeGreaterThan(300);
        List<String> falsosPositivos = new ArrayList<>();

        for (String linea : lineas) {
            filtro.coincidencia(linea).ifPresent(e -> falsosPositivos.add(linea + " -> " + e));
            for (String palabra : NO_LETRA.split(linea)) {
                if (!palabra.isEmpty()) {
                    filtro.coincidencia(palabra).ifPresent(e -> falsosPositivos.add(palabra + " -> " + e));
                }
            }
        }
        // Todo el corpus como un solo texto: tampoco hay una expresion entre lineas.
        filtro.coincidencia(String.join(" ", lineas)).ifPresent(e -> falsosPositivos.add("(corpus entero) -> " + e));

        assertThat(falsosPositivos).as("falsos positivos").isEmpty();
    }

    @Test
    void sinElArchivo_noArranca() {
        assertThatThrownBy(() -> ListaDeGroseriasConfig.leer("moderacion/no-existe.txt"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("lista de groserias");
    }
}
