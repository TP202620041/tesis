package pe.edu.upc.viasegura.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionOperations;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import pe.edu.upc.viasegura.auth.repository.ConsentimientoRepository;
import pe.edu.upc.viasegura.auth.repository.PasswordResetTokenRepository;
import pe.edu.upc.viasegura.auth.repository.TokenConfirmacionCorreoRepository;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;

/**
 * BE-15, sin base: el plazo minimo, la tarea programada, los desenlaces de
 * cada cuenta y que el registro nunca lleve mas que ids. Los candados y las
 * claves foraneas reales los prueba {@code PurgaCuentasSinConfirmarIT}.
 */
@ExtendWith(OutputCaptureExtension.class)
class PurgaCuentasSinConfirmarServiceTest {

    private final UsuarioRepository usuarios = mock(UsuarioRepository.class);
    private final TokenConfirmacionCorreoRepository enlaces = mock(TokenConfirmacionCorreoRepository.class);
    private final PasswordResetTokenRepository recuperaciones = mock(PasswordResetTokenRepository.class);
    private final ConsentimientoRepository consentimientos = mock(ConsentimientoRepository.class);
    private SimpleTransactionStatus ultimoEstado;

    /** Corre el callback como lo haria el TransactionTemplate, y guarda su estado. */
    private final TransactionOperations transaccion = new TransactionOperations() {
        @Override
        public <T> T execute(TransactionCallback<T> accion) {
            ultimoEstado = new SimpleTransactionStatus();
            return accion.doInTransaction(ultimoEstado);
        }
    };

    private PurgaCuentasSinConfirmarService purga;

    @BeforeEach
    void crear() {
        purga = new PurgaCuentasSinConfirmarService(usuarios, enlaces, recuperaciones, consentimientos, transaccion,
                Duration.ofDays(30));
    }

    /** Una candidata que pasa todas las comprobaciones. */
    private void candidata(long id) {
        when(usuarios.candidatasAPurga(any(), any())).thenReturn(List.of(id));
        when(usuarios.bloquearSinConfirmarParaPurga(eq(id), any())).thenReturn(Optional.of(id));
        when(usuarios.borrarSinConfirmar(eq(id), any())).thenReturn(1);
    }

    // ------------------------------------------------------------------ plazo

    @ParameterizedTest
    @ValueSource(strings = {"PT0S", "PT23H59M", "-P30D"})
    void unPlazoDeMenosDeUnDia_noArranca(String plazo) {
        assertThatThrownBy(() -> PurgaCuentasSinConfirmarService.validarPlazo(Duration.parse(plazo)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("CUENTAS_SIN_CONFIRMAR_PLAZO");
    }

    @Test
    void sinPlazo_noArranca() {
        assertThatThrownBy(() -> PurgaCuentasSinConfirmarService.validarPlazo(null))
                .isInstanceOf(IllegalStateException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"P1D", "P30D", "P365D"})
    void unPlazoDeUnDiaOMas_seAcepta(String plazo) {
        assertThat(PurgaCuentasSinConfirmarService.validarPlazo(Duration.parse(plazo)))
                .isEqualTo(Duration.parse(plazo));
    }

    @Test
    void elLimiteEsAhoraMenosElPlazo() {
        when(usuarios.candidatasAPurga(any(), any())).thenReturn(List.of());
        Instant antes = Instant.now();

        purga.purgar();

        verify(usuarios).candidatasAPurga(
                org.mockito.ArgumentMatchers.argThat(limite -> !limite.isBefore(antes.minus(Duration.ofDays(30)))
                        && !limite.isAfter(Instant.now().minus(Duration.ofDays(30)))),
                any());
    }

    // ------------------------------------------------------------ disparador

    @Test
    void laTareaEsDiariaEnHoraDeLima_conElCronEnUnaPropiedad() throws Exception {
        Scheduled programada = PurgaCuentasSinConfirmarService.class.getMethod("purgarProgramada")
                .getAnnotation(Scheduled.class);

        assertThat(programada).isNotNull();
        assertThat(programada.cron()).startsWith("${app.cuentas-sin-confirmar.purga.cron:");
        assertThat(programada.zone()).isEqualTo("America/Lima");
    }

    @Test
    void laTareaProgramadaNoPropagaUnFallo(CapturedOutput salida) {
        when(usuarios.candidatasAPurga(any(), any())).thenThrow(new QueryTimeoutException("x@y.pe"));

        assertThatCode(purga::purgarProgramada).doesNotThrowAnyException();
        assertThat(salida.getOut()).contains("la corrida fallo (QueryTimeoutException)").doesNotContain("x@y.pe");
    }

    @Test
    void seNiegaACorrerDentroDeOtraTransaccion() {
        TransactionSynchronizationManager.initSynchronization();
        try {
            assertThatThrownBy(purga::purgar).isInstanceOf(IllegalStateException.class);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    // ------------------------------------------------------------ desenlaces

    @Test
    void borraEnlacesTokensYConsentimientos_yLuegoLaCuenta(CapturedOutput salida) {
        candidata(7L);

        assertThat(purga.purgar()).isEqualTo(1);

        verify(enlaces).bloquearSolicitudesDeConfirmacion(7L);
        verify(enlaces).borrarDeUsuario(7L);
        verify(recuperaciones).borrarDeUsuario(7L);
        verify(consentimientos).borrarDeUsuario(7L);
        verify(usuarios).borrarSinConfirmar(eq(7L), any());
        assertThat(salida.getOut()).contains("Purga de cuentas sin confirmar: 1 cuentas borradas (plazo 30 dias)");
    }

    @Test
    void siSeConfirmoMientrasTanto_noTocaNada() {
        candidata(7L);
        when(usuarios.bloquearSinConfirmarParaPurga(eq(7L), any())).thenReturn(Optional.empty());

        assertThat(purga.purgar()).isZero();

        verify(enlaces, never()).borrarDeUsuario(anyLong());
        verify(usuarios, never()).borrarSinConfirmar(anyLong(), any());
    }

    @Test
    void siPidioUnEnlaceMientrasTanto_noTocaNada() {
        candidata(7L);
        when(enlaces.existeVigente(eq(7L), any())).thenReturn(true);

        assertThat(purga.purgar()).isZero();

        verify(consentimientos, never()).borrarDeUsuario(anyLong());
        verify(usuarios, never()).borrarSinConfirmar(anyLong(), any());
    }

    @Test
    void conFotoDePerfil_laConserva_conUnWarnConSuId(CapturedOutput salida) {
        candidata(7L);
        when(usuarios.existsByIdAndFotoUrlIsNotNull(7L)).thenReturn(true);

        assertThat(purga.purgar()).isZero();

        verify(usuarios, never()).borrarSinConfirmar(anyLong(), any());
        assertThat(salida.getOut())
                .contains("la cuenta 7 tiene foto de perfil; no se borra")
                .contains("0 cuentas borradas y 1 conservadas con datos asociados");
    }

    @Test
    void siUnaClaveForaneaLaImpide_laConserva_conElNombreDeLaRestriccion(CapturedOutput salida) {
        candidata(7L);
        when(usuarios.borrarSinConfirmar(eq(7L), any())).thenThrow(new DataIntegrityViolationException("x@y.pe",
                new ConstraintViolationException("x@y.pe", new SQLException("x@y.pe"), "reporte_creador_id_fkey")));

        assertThat(purga.purgar()).isZero();

        assertThat(salida.getOut())
                .contains("la cuenta 7 tiene datos asociados (reporte_creador_id_fkey); no se borra")
                .doesNotContain("x@y.pe");
    }

    @Test
    void unaCuentaQueFalla_noDetieneALasDemas(CapturedOutput salida) {
        when(usuarios.candidatasAPurga(any(), any())).thenReturn(List.of(7L, 8L));
        when(usuarios.bloquearSinConfirmarParaPurga(eq(7L), any())).thenThrow(new QueryTimeoutException("x@y.pe"));
        when(usuarios.bloquearSinConfirmarParaPurga(eq(8L), any())).thenReturn(Optional.of(8L));
        when(usuarios.borrarSinConfirmar(eq(8L), any())).thenReturn(1);

        assertThat(purga.purgar()).isEqualTo(1);

        assertThat(salida.getOut())
                .contains("no se pudo borrar la cuenta 7 (QueryTimeoutException)")
                .doesNotContain("x@y.pe");
    }

    @Test
    void siElDeleteNoBorraNada_revierteLaTransaccionDeEsaCuenta() {
        candidata(7L);
        when(usuarios.borrarSinConfirmar(eq(7L), any())).thenReturn(0);

        assertThat(purga.purgar()).isZero();

        TransactionStatus estado = ultimoEstado;
        assertThat(estado.isRollbackOnly()).isTrue();
    }
}
