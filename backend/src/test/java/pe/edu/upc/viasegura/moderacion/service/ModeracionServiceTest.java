package pe.edu.upc.viasegura.moderacion.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import pe.edu.upc.viasegura.common.exception.ContenidoNoPermitidoException;
import pe.edu.upc.viasegura.common.exception.ServicioNoDisponibleException;
import pe.edu.upc.viasegura.common.port.FotoSaneada;
import pe.edu.upc.viasegura.moderacion.domain.CampoDeTexto;
import pe.edu.upc.viasegura.moderacion.domain.FiltroDeGroserias;
import pe.edu.upc.viasegura.moderacion.domain.OrigenDeModeracion;
import pe.edu.upc.viasegura.moderacion.domain.PuntajeDeModeracion;
import pe.edu.upc.viasegura.moderacion.port.ModeracionNoDisponibleException;
import pe.edu.upc.viasegura.moderacion.port.ModeradorDeImagen;

/**
 * {@link ModeracionService} sin Spring (NC-10b, D-15): los codigos y mensajes
 * de cada rechazo, la falla cerrada de la creacion, la vista previa que nunca
 * falla y lo que queda (y lo que no) en el log.
 */
@ExtendWith(OutputCaptureExtension.class)
class ModeracionServiceTest {

    private static final FotoSaneada FOTO = new FotoSaneada(new byte[] {1, 2, 3}, "f.jpg");
    private static final String VERSION = "nsfw-vit-tiny-384-0c26ec2-1ba7cf26";

    private final ModeradorDeImagen moderador = mock(ModeradorDeImagen.class);
    private final ModeracionService servicio = new ModeracionService(moderador,
            FiltroDeGroserias.desdeLineas(List.of("# version: prueba-7", "mierda", "concha de tu madre")), 0.70);

    @BeforeEach
    void moderacionEncendida() {
        when(moderador.estaActivo()).thenReturn(true);
    }

    // --- Texto -----------------------------------------------------------------

    @Test
    void textoConGroseria_400TextoNoPermitido_conElCampo_ySinLaPalabra(CapturedOutput salida) {
        String texto = "Esta pista es una mierdaaa, arreglenla";

        ContenidoNoPermitidoException error = catchThrowableOfType(ContenidoNoPermitidoException.class,
                () -> servicio.exigirTextoPermitido(CampoDeTexto.DESCRIPCION, texto));

        assertThat(error.getCodigo()).isEqualTo("TEXTO_NO_PERMITIDO");
        assertThat(error.getCampo()).isEqualTo("descripcion");
        assertThat(error.getMessage())
                .isEqualTo("La descripción tiene palabras que no están permitidas. Cámbiala para continuar.")
                .doesNotContainIgnoringCase("mierda");
        // El log: el campo, la entrada y la version de la lista; nunca el texto.
        assertThat(salida.getOut()).contains("WARN", "texto no permitido en descripcion",
                "«mierda»", "prueba-7").doesNotContain(texto).doesNotContain("arreglenla");
    }

    @Test
    void cadaCampo_llevaSuNombreDelPedido_ySuMensaje() {
        assertThat(campoRechazado(CampoDeTexto.TITULO)).isEqualTo("titulo");
        assertThat(campoRechazado(CampoDeTexto.COMENTARIO)).isEqualTo("contenido");
        assertThat(campoRechazado(CampoDeTexto.NOMBRE)).isEqualTo("nombre");
        assertThat(campoRechazado(CampoDeTexto.APELLIDO)).isEqualTo("apellido");
    }

    private String campoRechazado(CampoDeTexto campo) {
        ContenidoNoPermitidoException error = catchThrowableOfType(ContenidoNoPermitidoException.class,
                () -> servicio.exigirTextoPermitido(campo, "concha de tu madre"));
        assertThat(error.getMessage()).isEqualTo(campo.mensaje()).doesNotContain("concha", "madre");
        return error.getCampo();
    }

    @Test
    void textoLimpio_nulo_oEnBlanco_pasan() {
        assertThatCode(() -> servicio.exigirTextoPermitido(CampoDeTexto.TITULO, "Hueco frente al colegio"))
                .doesNotThrowAnyException();
        assertThatCode(() -> servicio.exigirTextoPermitido(CampoDeTexto.DESCRIPCION, null))
                .doesNotThrowAnyException();
        assertThatCode(() -> servicio.exigirTextoPermitido(CampoDeTexto.DESCRIPCION, "  "))
                .doesNotThrowAnyException();
    }

    @Test
    void elTextoNoDependeDelServicio_niConLaModeracionDeFotosApagada() {
        when(moderador.estaActivo()).thenReturn(false);

        assertThat(catchThrowableOfType(ContenidoNoPermitidoException.class,
                () -> servicio.exigirTextoPermitido(CampoDeTexto.TITULO, "m1erda"))).isNotNull();
    }

    // --- Foto en la creacion ----------------------------------------------------

    @Test
    void fotoSobreElUmbral_400FotoNoPermitida_yElLogLlevaUsuarioPuntajeYVersion(CapturedOutput salida) {
        when(moderador.medir(FOTO, OrigenDeModeracion.CREACION)).thenReturn(new PuntajeDeModeracion(VERSION, 0.91234));

        ContenidoNoPermitidoException error = catchThrowableOfType(ContenidoNoPermitidoException.class,
                () -> servicio.exigirFotoPermitida(FOTO, 42L));

        assertThat(error.getCodigo()).isEqualTo("FOTO_NO_PERMITIDA");
        assertThat(error.getCampo()).isEqualTo("foto");
        assertThat(error.getMessage()).isEqualTo("La foto no está permitida. Toma otra.");
        assertThat(salida.getOut()).contains("WARN", "foto rechazada al crear un reporte (usuario 42)",
                "puntaje 0.91", VERSION).doesNotContain("0.91234");
    }

    @Test
    void fotoEnElBordeDelUmbral_seRechaza_yDebajoPasa() {
        when(moderador.medir(FOTO, OrigenDeModeracion.CREACION))
                .thenReturn(new PuntajeDeModeracion(VERSION, 0.70))
                .thenReturn(new PuntajeDeModeracion(VERSION, 0.6999));

        assertThat(catchThrowableOfType(ContenidoNoPermitidoException.class,
                () -> servicio.exigirFotoPermitida(FOTO, 1L))).isNotNull();
        assertThatCode(() -> servicio.exigirFotoPermitida(FOTO, 1L)).doesNotThrowAnyException();
    }

    @Test
    void sinServicio_503ModeracionNoDisponible_fallaCerrada(CapturedOutput salida) {
        when(moderador.medir(any(), any())).thenThrow(new ModeracionNoDisponibleException("timeout"));

        ServicioNoDisponibleException error = catchThrowableOfType(ServicioNoDisponibleException.class,
                () -> servicio.exigirFotoPermitida(FOTO, 7L));

        assertThat(error.getCodigo()).isEqualTo("MODERACION_NO_DISPONIBLE");
        assertThat(error.getMessage()).contains("envíalo sin foto");
        assertThat(salida.getOut()).contains("WARN", "Moderacion no disponible al crear un reporte (usuario 7)");
    }

    @Test
    void unErrorQueElAdaptadorNoTradujo_tambienEs503_nuncaSePublicaSinRevisar() {
        when(moderador.medir(any(), any())).thenThrow(new IllegalStateException("bug"));

        ServicioNoDisponibleException error = catchThrowableOfType(ServicioNoDisponibleException.class,
                () -> servicio.exigirFotoPermitida(FOTO, 7L));

        assertThat(error.getCodigo()).isEqualTo("MODERACION_NO_DISPONIBLE");
    }

    @Test
    void conLaModeracionApagada_laFotoPasaSinLlamarAlPuerto() {
        when(moderador.estaActivo()).thenReturn(false);

        assertThatCode(() -> servicio.exigirFotoPermitida(FOTO, 1L)).doesNotThrowAnyException();
        assertThat(servicio.fotoRechazadaEnVistaPrevia(FOTO)).isFalse();
        assertThat(servicio.revisaFotos()).isFalse();
        verify(moderador, never()).medir(any(), any());
    }

    // --- Foto en la vista previa -------------------------------------------------

    @Test
    void vistaPrevia_avisaElRechazo_sinEsperarTurno() {
        when(moderador.medir(FOTO, OrigenDeModeracion.VISTA_PREVIA)).thenReturn(new PuntajeDeModeracion(VERSION, 0.8));

        assertThat(servicio.fotoRechazadaEnVistaPrevia(FOTO)).isTrue();
        verify(moderador).medir(FOTO, OrigenDeModeracion.VISTA_PREVIA);
    }

    @Test
    void vistaPrevia_sinServicio_oConUnError_noAvisa_nuncaFalla() {
        when(moderador.medir(any(), any()))
                .thenThrow(new ModeracionNoDisponibleException("sin turno"))
                .thenThrow(new IllegalStateException("bug"))
                .thenReturn(new PuntajeDeModeracion(VERSION, 0.2));

        assertThat(servicio.fotoRechazadaEnVistaPrevia(FOTO)).isFalse();
        assertThat(servicio.fotoRechazadaEnVistaPrevia(FOTO)).isFalse();
        assertThat(servicio.fotoRechazadaEnVistaPrevia(FOTO)).isFalse();
    }
}
