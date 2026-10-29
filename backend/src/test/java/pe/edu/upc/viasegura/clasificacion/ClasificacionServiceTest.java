package pe.edu.upc.viasegura.clasificacion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static pe.edu.upc.viasegura.clasificacion.domain.OrigenDeConsulta.SUGERENCIA_OFICIAL;
import static pe.edu.upc.viasegura.clasificacion.domain.OrigenDeConsulta.VISTA_PREVIA;

import java.math.BigDecimal;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
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
import pe.edu.upc.viasegura.common.exception.ServicioNoDisponibleException;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;
import pe.edu.upc.viasegura.common.port.FotoSaneada;
import pe.edu.upc.viasegura.common.port.SaneadorDeImagen;

/**
 * Orquestacion de {@link ClasificacionService} (NC-04) sin Spring: la vista
 * previa clasifica la foto <b>saneada</b> (la misma que se guardaria, D-08),
 * la sugerencia oficial no la vuelve a sanear y un servicio caido da «sin
 * sugerencia», nunca un error.
 */
class ClasificacionServiceTest {

    private static final ArchivoSubido ORIGINAL = new ArchivoSubido(new byte[] {1, 2, 3}, "image/png", "f.png");
    private static final FotoSaneada FOTO_SANEADA = new FotoSaneada(new byte[] {9, 9}, "f.jpg");
    /** Lo que recibe el clasificador: los mismos bytes como archivo. */
    private static final ArchivoSubido SANEADA = FOTO_SANEADA.comoArchivo();
    private static final CategoriaClasificable BACHE = new CategoriaClasificable(1L, "Bache", "bache");

    private final ClasificadorDano clasificador = mock(ClasificadorDano.class);
    private final CategoriasClasificables categorias = mock(CategoriasClasificables.class);
    private final SaneadorDeImagen saneador = mock(SaneadorDeImagen.class);
    private final ClasificacionService servicio = new ClasificacionService(clasificador, categorias, saneador, 0.50);

    @BeforeEach
    void clasificacionEncendida() {
        when(clasificador.estaDisponible()).thenReturn(true);
    }

    private static ResultadoDeteccion detecto(Deteccion... detecciones) {
        return new ResultadoDeteccion("falso-0", List.of(detecciones));
    }

    @Test
    void vistaPrevia_clasificaLaFotoSaneada_noLaOriginal() {
        when(saneador.sanear(ORIGINAL)).thenReturn(FOTO_SANEADA);
        when(clasificador.detectar(SANEADA, VISTA_PREVIA)).thenReturn(detecto(new Deteccion("bache", 0.87)));
        when(categorias.activas()).thenReturn(List.of(BACHE));

        assertThat(servicio.vistaPrevia(ORIGINAL)).isEqualTo(new ClasificacionResponse(1L, "Bache"));
        verify(clasificador, never()).detectar(eq(ORIGINAL), any());
        // NC-04c: la vista previa le dice al adaptador que no espere turno.
        verify(clasificador).detectar(SANEADA, VISTA_PREVIA);
    }

    @Test
    void vistaPrevia_sinSugerencia_respondeConLosCamposNulos() {
        when(saneador.sanear(ORIGINAL)).thenReturn(FOTO_SANEADA);
        when(clasificador.detectar(SANEADA, VISTA_PREVIA)).thenReturn(detecto(new Deteccion("bache", 0.20)));
        when(categorias.activas()).thenReturn(List.of(BACHE));

        assertThat(servicio.vistaPrevia(ORIGINAL)).isEqualTo(new ClasificacionResponse(null, null));
    }

    @Test
    void vistaPrevia_conElServicioCaido_esSinSugerencia() {
        when(saneador.sanear(ORIGINAL)).thenReturn(FOTO_SANEADA);
        when(clasificador.detectar(any(), any())).thenThrow(new ClasificacionNoDisponibleException("timeout"));

        assertThat(servicio.vistaPrevia(ORIGINAL)).isEqualTo(ClasificacionResponse.sinSugerencia());
    }

    @Test
    void vistaPrevia_unaFotoQueNoEsImagen_recibeElErrorDelSaneado_sinClasificar() {
        when(saneador.sanear(ORIGINAL)).thenThrow(new BusinessException("Formato no permitido")).thenReturn(FOTO_SANEADA);
        when(clasificador.detectar(SANEADA, VISTA_PREVIA)).thenReturn(detecto(new Deteccion("bache", 0.87)));
        when(categorias.activas()).thenReturn(List.of(BACHE));

        assertThatThrownBy(() -> servicio.vistaPrevia(ORIGINAL)).isInstanceOf(BusinessException.class);
        verify(clasificador, never()).detectar(any(), any());
        // El turno de la vista previa volvió aunque el saneado lanzó: la siguiente clasifica.
        assertThat(servicio.vistaPrevia(ORIGINAL)).isEqualTo(new ClasificacionResponse(1L, "Bache"));
    }

    @Test
    void vistaPrevia_sinFoto_es400() {
        assertThatThrownBy(() -> servicio.vistaPrevia(new ArchivoSubido(new byte[0], "image/jpeg", "f.jpg")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> servicio.vistaPrevia(null)).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(saneador, clasificador);
    }

    @Test
    void sugerenciaOficial_noVuelveASanearLaFotoGuardada() {
        when(clasificador.detectar(SANEADA, SUGERENCIA_OFICIAL)).thenReturn(detecto(new Deteccion("bache", 0.87)));
        when(categorias.activas()).thenReturn(List.of(BACHE));

        assertThat(servicio.sugerenciaOficial(SANEADA))
                .contains(new Sugerencia(1L, "Bache", new BigDecimal("0.870"), "falso-0"));
        verifyNoInteractions(saneador);
        // NC-04c: la oficial le dice al adaptador que puede esperar turno.
        verify(clasificador).detectar(SANEADA, SUGERENCIA_OFICIAL);
    }

    @Test
    void sugerenciaOficial_sinDetecciones_niSiquieraConsultaElCatalogo() {
        when(clasificador.detectar(SANEADA, SUGERENCIA_OFICIAL)).thenReturn(detecto());

        assertThat(servicio.sugerenciaOficial(SANEADA)).isEmpty();
        verifyNoInteractions(categorias);
    }

    @Test
    void sugerenciaOficial_conElServicioCaido_esVacio() {
        when(clasificador.detectar(SANEADA, SUGERENCIA_OFICIAL)).thenThrow(new ClasificacionNoDisponibleException("caido"));

        assertThat(servicio.sugerenciaOficial(SANEADA)).isEmpty();
    }

    @Test
    void unErrorInesperadoDelAdaptador_esSinSugerencia_nuncaUnErrorParaElCiudadano() {
        when(saneador.sanear(ORIGINAL)).thenReturn(FOTO_SANEADA);
        when(clasificador.detectar(any(), any())).thenThrow(new IllegalStateException("respuesta fuera del contrato"));

        assertThat(servicio.vistaPrevia(ORIGINAL)).isEqualTo(ClasificacionResponse.sinSugerencia());
        assertThat(servicio.sugerenciaOficial(SANEADA)).isEmpty();
    }

    @Test
    void conLaClasificacionApagada_niSaneaNiClasifica_aunqueLaFotoNoSeaUnaImagen() {
        // Produccion hasta NC-04b: el falso sin respuesta no detectaria nada.
        when(clasificador.estaDisponible()).thenReturn(false);
        ArchivoSubido basura = new ArchivoSubido(new byte[] {0, 1, 2}, "image/png", "no-es-imagen.png");

        assertThat(servicio.vistaPrevia(basura)).isEqualTo(ClasificacionResponse.sinSugerencia());
        assertThat(servicio.sugerenciaOficial(SANEADA)).isEmpty();
        assertThat(servicio.estaDisponible()).isFalse();
        verifyNoInteractions(saneador, categorias);
        verify(clasificador, never()).detectar(any(), any());
    }

    @Test
    void sinTurnoDeSaneado_esSinSugerencia_noUn503() {
        when(saneador.sanear(ORIGINAL))
                .thenThrow(new ServicioNoDisponibleException("Hay muchas fotos en proceso"))
                .thenReturn(FOTO_SANEADA);

        assertThat(servicio.vistaPrevia(ORIGINAL)).isEqualTo(ClasificacionResponse.sinSugerencia());
        verify(clasificador, never()).detectar(any(), any());
        verifyNoInteractions(categorias);

        // El turno de la vista previa volvió: con saneado disponible, la siguiente clasifica.
        when(clasificador.detectar(SANEADA, VISTA_PREVIA)).thenReturn(detecto(new Deteccion("bache", 0.87)));
        when(categorias.activas()).thenReturn(List.of(BACHE));
        assertThat(servicio.vistaPrevia(ORIGINAL)).isEqualTo(new ClasificacionResponse(1L, "Bache"));
    }

    @Test
    void unaVistaPreviaALaVez_laSegundaNoEsperaYEsSinSugerencia() throws Exception {
        CountDownLatch saneando = new CountDownLatch(1);
        CountDownLatch soltar = new CountDownLatch(1);
        when(saneador.sanear(ORIGINAL)).thenAnswer(invocacion -> {
            saneando.countDown();
            assertThat(soltar.await(5, TimeUnit.SECONDS)).isTrue();
            return FOTO_SANEADA;
        });
        when(clasificador.detectar(SANEADA, VISTA_PREVIA)).thenReturn(detecto(new Deteccion("bache", 0.87)));
        when(categorias.activas()).thenReturn(List.of(BACHE));

        CompletableFuture<ClasificacionResponse> primera = CompletableFuture.supplyAsync(() -> servicio.vistaPrevia(ORIGINAL));
        assertThat(saneando.await(5, TimeUnit.SECONDS)).isTrue();

        // Mientras la primera sanea, la segunda no espera ni toma otro turno del saneado.
        assertThat(servicio.vistaPrevia(ORIGINAL)).isEqualTo(ClasificacionResponse.sinSugerencia());
        soltar.countDown();
        assertThat(primera.get(5, TimeUnit.SECONDS)).isEqualTo(new ClasificacionResponse(1L, "Bache"));
        verify(saneador, times(1)).sanear(ORIGINAL);

        // Y el turno se devuelve: la siguiente vuelve a clasificar.
        assertThat(servicio.vistaPrevia(ORIGINAL)).isEqualTo(new ClasificacionResponse(1L, "Bache"));
    }

    @Test
    void umbralMalConfigurado_noArranca() {
        assertThatThrownBy(() -> new ClasificacionService(clasificador, categorias, saneador, 0))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
