package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.RecordComponent;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;
import pe.edu.upc.viasegura.reportes.dto.ComentarioPublicoResponse;
import pe.edu.upc.viasegura.reportes.dto.ReporteGestionResponse;
import pe.edu.upc.viasegura.reportes.dto.ReporteResponse;
import pe.edu.upc.viasegura.reportes.dto.ReporteResumenResponse;

/**
 * NC-11a (D-15): ocultar y denunciar no agrega ningun campo a los DTO que leen
 * el publico, el ciudadano o el funcionario. Lo oculto se nota porque
 * {@code fotoUrl} llega en {@code null} o porque el reporte no aparece; las
 * denuncias solo van en los DTO del ADMIN.
 *
 * <p>Fija la lista exacta de componentes de cada record, en orden: un campo
 * nuevo (un {@code oculto}, un conteo de denuncias) hace fallar este test, y
 * quien lo agregue tiene que decidir a proposito que es publico.</p>
 */
class DtoPublicosSinModeracionTest {

    private static List<String> componentes(Class<? extends Record> tipo) {
        return Arrays.stream(tipo.getRecordComponents()).map(RecordComponent::getName).toList();
    }

    @Test
    void reporteResumenResponse_mismaListaQueAntes() {
        assertThat(componentes(ReporteResumenResponse.class)).containsExactly(
                "id", "latitud", "longitud", "fotoUrl", "titulo", "descripcion", "severidad",
                "categoriaId", "categoriaNombre", "estado", "distritoId", "distritoNombre",
                "totalAdhesiones", "createdAt", "resolvedAt");
    }

    @Test
    void reporteResponse_mismaListaQueAntes() {
        assertThat(componentes(ReporteResponse.class)).containsExactly(
                "id", "latitud", "longitud", "fotoUrl", "titulo", "descripcion", "severidad",
                "categoriaId", "categoriaNombre", "estado", "distritoId", "distritoNombre",
                "totalAdhesiones", "esAdhesion", "createdAt");
    }

    @Test
    void reporteGestionResponse_mismaListaQueAntes() {
        assertThat(componentes(ReporteGestionResponse.class)).containsExactly(
                "id", "latitud", "longitud", "fotoUrl", "titulo", "descripcion", "severidad",
                "categoriaId", "categoriaNombre", "estado", "distritoId", "distritoNombre",
                "totalAdhesiones", "createdAt", "resolvedAt", "posibleReincidencia");
    }

    @Test
    void comentarioPublicoResponse_mismaListaQueAntes() {
        assertThat(componentes(ComentarioPublicoResponse.class)).containsExactly(
                "id", "reporteId", "autor", "contenido", "createdAt");
    }
}
