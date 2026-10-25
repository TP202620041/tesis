package pe.edu.upc.viasegura.clasificacion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import pe.edu.upc.viasegura.clasificacion.domain.CategoriaClasificable;
import pe.edu.upc.viasegura.clasificacion.domain.Deteccion;
import pe.edu.upc.viasegura.clasificacion.domain.ResultadoDeteccion;
import pe.edu.upc.viasegura.clasificacion.domain.Sugerencia;
import pe.edu.upc.viasegura.clasificacion.dto.ClasificacionResponse;
import pe.edu.upc.viasegura.clasificacion.port.CategoriasClasificables;
import pe.edu.upc.viasegura.clasificacion.port.ClasificacionNoDisponibleException;
import pe.edu.upc.viasegura.clasificacion.port.ClasificadorDano;
import pe.edu.upc.viasegura.clasificacion.service.ClasificacionService;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;
import pe.edu.upc.viasegura.common.port.SaneadorDeImagen;

/**
 * Orquestacion de {@link ClasificacionService} (NC-04) sin Spring: la vista
 * previa clasifica la foto <b>saneada</b> (la misma que se guardaria, D-08),
 * la sugerencia oficial no la vuelve a sanear y un servicio caido da «sin
 * sugerencia», nunca un error.
 */
class ClasificacionServiceTest {

    private static final ArchivoSubido ORIGINAL = new ArchivoSubido(new byte[] {1, 2, 3}, "image/png", "f.png");
    private static final ArchivoSubido SANEADA = new ArchivoSubido(new byte[] {9, 9}, "image/jpeg", "f.jpg");
    private static final CategoriaClasificable BACHE = new CategoriaClasificable(1L, "Bache", "bache");

    private final ClasificadorDano clasificador = mock(ClasificadorDano.class);
    private final CategoriasClasificables categorias = mock(CategoriasClasificables.class);
    private final SaneadorDeImagen saneador = mock(SaneadorDeImagen.class);
    private final ClasificacionService servicio = new ClasificacionService(clasificador, categorias, saneador, 0.50);

    private static ResultadoDeteccion detecto(Deteccion... detecciones) {
        return new ResultadoDeteccion("falso-0", List.of(detecciones));
    }

    @Test
    void vistaPrevia_clasificaLaFotoSaneada_noLaOriginal() {
        when(saneador.sanear(ORIGINAL)).thenReturn(SANEADA);
        when(clasificador.detectar(SANEADA)).thenReturn(detecto(new Deteccion("bache", 0.87)));
        when(categorias.activas()).thenReturn(List.of(BACHE));

        assertThat(servicio.vistaPrevia(ORIGINAL)).isEqualTo(new ClasificacionResponse(1L, "Bache"));
        verify(clasificador, never()).detectar(ORIGINAL);
    }

    @Test
    void vistaPrevia_sinSugerencia_respondeConLosCamposNulos() {
        when(saneador.sanear(ORIGINAL)).thenReturn(SANEADA);
        when(clasificador.detectar(SANEADA)).thenReturn(detecto(new Deteccion("bache", 0.20)));
        when(categorias.activas()).thenReturn(List.of(BACHE));

        assertThat(servicio.vistaPrevia(ORIGINAL)).isEqualTo(new ClasificacionResponse(null, null));
    }

    @Test
    void vistaPrevia_conElServicioCaido_esSinSugerencia() {
        when(saneador.sanear(ORIGINAL)).thenReturn(SANEADA);
        when(clasificador.detectar(any())).thenThrow(new ClasificacionNoDisponibleException("timeout"));

        assertThat(servicio.vistaPrevia(ORIGINAL)).isEqualTo(ClasificacionResponse.sinSugerencia());
    }

    @Test
    void vistaPrevia_unaFotoQueNoEsImagen_recibeElErrorDelSaneado_sinClasificar() {
        when(saneador.sanear(ORIGINAL)).thenThrow(new BusinessException("Formato no permitido"));

        assertThatThrownBy(() -> servicio.vistaPrevia(ORIGINAL)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(clasificador);
    }

    @Test
    void vistaPrevia_sinFoto_es400() {
        assertThatThrownBy(() -> servicio.vistaPrevia(new ArchivoSubido(new byte[0], "image/jpeg", "f.jpg")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> servicio.vistaPrevia(null)).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(saneador, clasificador);
    }

    @Test
    void sugerir_noVuelveASanearLaFotoGuardada() {
        when(clasificador.detectar(SANEADA)).thenReturn(detecto(new Deteccion("bache", 0.87)));
        when(categorias.activas()).thenReturn(List.of(BACHE));

        assertThat(servicio.sugerir(SANEADA))
                .contains(new Sugerencia(1L, "Bache", new BigDecimal("0.870"), "falso-0"));
        verifyNoInteractions(saneador);
    }

    @Test
    void sugerir_sinDetecciones_niSiquieraConsultaElCatalogo() {
        when(clasificador.detectar(SANEADA)).thenReturn(detecto());

        assertThat(servicio.sugerir(SANEADA)).isEmpty();
        verifyNoInteractions(categorias);
    }

    @Test
    void sugerir_conElServicioCaido_esVacio() {
        when(clasificador.detectar(SANEADA)).thenThrow(new ClasificacionNoDisponibleException("caido"));

        assertThat(servicio.sugerir(SANEADA)).isEmpty();
    }

    @Test
    void umbralMalConfigurado_noArranca() {
        assertThatThrownBy(() -> new ClasificacionService(clasificador, categorias, saneador, 0))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
