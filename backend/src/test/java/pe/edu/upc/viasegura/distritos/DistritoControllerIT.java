package pe.edu.upc.viasegura.distritos;

import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * Catalogo publico de distritos: dato de referencia para los selectores y
 * filtros del frontend (US-05, US-10, US-12).
 */
class DistritoControllerIT extends AbstractPostgisIT {

    @Autowired
    MockMvc mockMvc;

    @Test
    void devuelveLos43DistritosDeLimaMetropolitana() throws Exception {
        mockMvc.perform(get("/api/distritos"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(43)))
                .andExpect(jsonPath("$[*].id", everyItem(notNullValue())))
                .andExpect(jsonPath("$[*].nombre", everyItem(notNullValue())));
    }

    @Test
    void vieneEnOrdenAlfabetico_paraPoblarUnSelector() throws Exception {
        // El primero y el ultimo del set de 43 en orden alfabetico. Es la
        // diferencia observable con GET /api/desempeno/distritos, que ordena
        // por tasa de resolucion (ranking, US-18) y no sirve como selector.
        mockMvc.perform(get("/api/distritos"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].nombre", is("Ancón")))
                .andExpect(jsonPath("$[42].nombre", is("Villa María del Triunfo")));
    }

    @Test
    void noExponeLosPoligonosDeLimites() throws Exception {
        // El MultiPolygon pesa miles de vertices: enviarlo en un catalogo de
        // selector seria un payload absurdo (ver DistritoResponse).
        mockMvc.perform(get("/api/distritos"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].limites").doesNotExist());
    }

    @Test
    void esPublicoSinToken() throws Exception {
        mockMvc.perform(get("/api/distritos"))
                .andExpect(status().isOk());
    }

    // --- Resolucion de coordenadas -> distrito (US-05) ----------------------
    // Mismas coordenadas de regresion que PointInPolygonAssignmentStrategyIT:
    // este endpoint debe coincidir con la asignacion automatica del backend,
    // porque ambos pasan por findDistritoQueContiene.

    @Test
    void resuelveElDistritoDeUnPuntoConocido() throws Exception {
        // Parque Kennedy, Miraflores.
        mockMvc.perform(get("/api/distritos/por-coordenadas")
                        .param("lat", "-12.1215")
                        .param("lon", "-77.0297"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nombre", is("Miraflores")))
                .andExpect(jsonPath("$.id", notNullValue()));
    }

    @Test
    void otroPuntoConocido_devuelveOtroDistrito() throws Exception {
        // Plaza Mayor, Cercado de Lima.
        mockMvc.perform(get("/api/distritos/por-coordenadas")
                        .param("lat", "-12.0464")
                        .param("lon", "-77.0300"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nombre", is("Lima")));
    }

    @Test
    void puntoFueraDeLimaMetropolitana_404() throws Exception {
        // Arequipa: fuera de cobertura. Permite avisarlo en el formulario
        // antes de que el POST /api/reportes responda 409.
        mockMvc.perform(get("/api/distritos/por-coordenadas")
                        .param("lat", "-16.4090")
                        .param("lon", "-71.5375"))
                .andExpect(status().isNotFound());
    }

    @Test
    void coordenadasFueraDeRango_400() throws Exception {
        mockMvc.perform(get("/api/distritos/por-coordenadas")
                        .param("lat", "-999")
                        .param("lon", "-77.0297"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void resolucionPorCoordenadas_esPublicaSinToken() throws Exception {
        mockMvc.perform(get("/api/distritos/por-coordenadas")
                        .param("lat", "-12.1215")
                        .param("lon", "-77.0297"))
                .andExpect(status().isOk());
    }
}
