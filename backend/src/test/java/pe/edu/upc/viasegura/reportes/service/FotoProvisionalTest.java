package pe.edu.upc.viasegura.reportes.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionSystemException;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.port.FotoStorageService;

/**
 * BE-11: que pasa con la foto ya subida segun como termine la transaccion de
 * la creacion. Sin base de datos: un gestor de transacciones de prueba recorre
 * el mismo ciclo de Spring ({@link AbstractPlatformTransactionManager}: las
 * sincronizaciones y sus estados), y cada caso fuerza un desenlace distinto.
 * El recorrido real, con PostGIS y el adaptador de fotos, lo prueba
 * {@code FotoFueraDeTransaccionIT}.
 */
class FotoProvisionalTest {

    private static final String NOMBRE = "0b9f1f5e-6c1a-4c55-9a77-3f5b6f2d9e10.jpg";
    private static final String URL = "/media/fotos/reportes/" + NOMBRE;

    private final FotoStorageService almacenamiento = mock(FotoStorageService.class);
    private final GestorDePrueba gestor = new GestorDePrueba();
    private final TransactionTemplate transaccion = new TransactionTemplate(gestor);
    /** Si habia sincronizacion de transacciones activa en cada borrado. */
    private final List<Boolean> sincronizacionAlBorrar = new ArrayList<>();

    private FotoProvisional foto;

    @BeforeEach
    void crear() {
        foto = new FotoProvisional(almacenamiento, URL);
        doAnswer(invocacion -> sincronizacionAlBorrar.add(TransactionSynchronizationManager.isSynchronizationActive()))
                .when(almacenamiento).eliminarFotoReporte(anyString());
    }

    @AfterEach
    void sinRestos() {
        assertThat(TransactionSynchronizationManager.isSynchronizationActive()).isFalse();
    }

    @Test
    void usadaPorElReporteYConfirmada_seConserva() {
        String url = transaccion.execute(estado -> {
            foto.acompanarTransaccionActual();
            return foto.usarEnReporte();
        });
        foto.resolver();

        assertThat(url).isEqualTo(URL);
        verify(almacenamiento, never()).eliminarFotoReporte(anyString());
    }

    @Test
    void confirmadaSinQueNadieLaUse_seBorra() {
        // Una adhesion (US-09) o un reenvio idempotente (US-06): la
        // transaccion se confirma, pero ningun reporte guarda la foto.
        transaccion.executeWithoutResult(estado -> foto.acompanarTransaccionActual());
        foto.resolver();

        verify(almacenamiento).eliminarFotoReporte(NOMBRE);
    }

    @Test
    void usadaYRevertida_seBorraDespuesDeLaTransaccionYNoDentro() {
        assertThatThrownBy(() -> transaccion.executeWithoutResult(estado -> {
            foto.acompanarTransaccionActual();
            foto.usarEnReporte();
            throw new BusinessException("Ya reportaste este daño");
        })).isInstanceOf(BusinessException.class);

        // afterCompletion ya corrio y solo decidio: borrar es una llamada de red
        // que no debe hacerse con la conexion de la transaccion tomada.
        verifyNoInteractions(almacenamiento);

        foto.resolver();
        verify(almacenamiento).eliminarFotoReporte(NOMBRE);
        assertThat(sincronizacionAlBorrar).containsExactly(false);
    }

    @Test
    void usadaYConDesenlaceDesconocido_seConserva() {
        // Fallo el commit y no se sabe si el reporte llego a la base: un
        // reporte sin su foto es peor que un objeto huerfano.
        gestor.alConfirmar = new TransactionSystemException("se corto la conexion en el commit");

        assertThatThrownBy(() -> transaccion.executeWithoutResult(estado -> {
            foto.acompanarTransaccionActual();
            foto.usarEnReporte();
        })).isInstanceOf(TransactionSystemException.class);
        foto.resolver();

        verify(almacenamiento, never()).eliminarFotoReporte(anyString());
    }

    @Test
    void sinUsarYConDesenlaceDesconocido_seBorra() {
        gestor.alConfirmar = new TransactionSystemException("se corto la conexion en el commit");

        assertThatThrownBy(() -> transaccion.executeWithoutResult(estado -> foto.acompanarTransaccionActual()))
                .isInstanceOf(TransactionSystemException.class);
        foto.resolver();

        verify(almacenamiento).eliminarFotoReporte(NOMBRE);
    }

    @Test
    void siElCommitFallaYSeRevierte_seBorra() {
        // Un error que no es del gestor (p. ej. un listener BEFORE_COMMIT):
        // Spring revierte y afterCompletion recibe STATUS_ROLLED_BACK.
        gestor.alConfirmar = new IllegalStateException("fallo antes de confirmar");

        assertThatThrownBy(() -> transaccion.executeWithoutResult(estado -> {
            foto.acompanarTransaccionActual();
            foto.usarEnReporte();
        })).isInstanceOf(IllegalStateException.class);
        foto.resolver();

        verify(almacenamiento).eliminarFotoReporte(NOMBRE);
    }

    @Test
    void siLaTransaccionNiSiquieraEmpieza_seBorra() {
        // Sin conexion en el pool: la parte transaccional nunca corre y la foto
        // no llega a registrarse.
        gestor.alEmpezar = new CannotCreateTransactionException("Connection is not available");

        assertThatThrownBy(() -> transaccion.executeWithoutResult(estado -> foto.acompanarTransaccionActual()))
                .isInstanceOf(CannotCreateTransactionException.class);
        foto.resolver();

        verify(almacenamiento).eliminarFotoReporte(NOMBRE);
        assertThat(sincronizacionAlBorrar).containsExactly(false);
    }

    @Test
    void siSuTransaccionSigueAbiertaAlResolver_noSeBorra() {
        // La creacion corrio dentro de otra transaccion (ReporteService#crear lo
        // rechaza): la de afuera todavia puede confirmar el reporte.
        transaccion.executeWithoutResult(afuera -> {
            transaccion.executeWithoutResult(adentro -> {
                foto.acompanarTransaccionActual();
                foto.usarEnReporte();
            });
            foto.resolver();
        });

        verify(almacenamiento, never()).eliminarFotoReporte(anyString());
    }

    /**
     * Gestor sin recursos: el ciclo de {@link AbstractPlatformTransactionManager}
     * (sincronizaciones, {@code afterCompletion} y sus estados) sin base de datos.
     */
    private static final class GestorDePrueba extends AbstractPlatformTransactionManager {

        private RuntimeException alEmpezar;
        private RuntimeException alConfirmar;

        @Override
        protected Object doGetTransaction() {
            return new Object();
        }

        @Override
        protected boolean isExistingTransaction(Object transaccion) {
            return TransactionSynchronizationManager.isActualTransactionActive();
        }

        @Override
        protected void doBegin(Object transaccion, TransactionDefinition definicion) {
            if (alEmpezar != null) {
                throw alEmpezar;
            }
        }

        @Override
        protected void doCommit(DefaultTransactionStatus estado) {
            if (alConfirmar != null) {
                throw alConfirmar;
            }
        }

        @Override
        protected void doRollback(DefaultTransactionStatus estado) {
            // Nada que revertir.
        }
    }
}
