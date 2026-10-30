package pe.edu.upc.viasegura.reportes.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Reglas puras de la moderacion del ADMIN (NC-11a). */
class ModeracionDominioTest {

    @Test
    void soloElReporteMueveElIndice_yLlevaElAviso() {
        assertThat(AlcanceModeracion.REPORTE.mueveElIndice()).isTrue();
        assertThat(AlcanceModeracion.FOTO.mueveElIndice()).isFalse();

        assertThat(TipoEventoHistorial.REPORTE_OCULTO.avisoIndice())
                .isEqualTo("Mientras esté oculto, este reporte no cuenta en el índice de desempeño.");
        assertThat(TipoEventoHistorial.REPORTE_RESTABLECIDO.avisoIndice())
                .isEqualTo("Vuelve a contar en el índice de desempeño.");
        assertThat(TipoEventoHistorial.FOTO_OCULTA.avisoIndice()).isNull();
        assertThat(TipoEventoHistorial.FOTO_RESTABLECIDA.avisoIndice()).isNull();
        assertThat(TipoEventoHistorial.CAMBIO_ESTADO.avisoIndice()).isNull();
        assertThat(TipoEventoHistorial.ASIGNACION.avisoIndice()).isNull();
    }

    @Test
    void cadaAlcanceTieneSuParDeEventos() {
        assertThat(AlcanceModeracion.REPORTE.eventoAlOcultar()).isEqualTo(TipoEventoHistorial.REPORTE_OCULTO);
        assertThat(AlcanceModeracion.REPORTE.eventoAlRestablecer())
                .isEqualTo(TipoEventoHistorial.REPORTE_RESTABLECIDO);
        assertThat(AlcanceModeracion.FOTO.eventoAlOcultar()).isEqualTo(TipoEventoHistorial.FOTO_OCULTA);
        assertThat(AlcanceModeracion.FOTO.eventoAlRestablecer()).isEqualTo(TipoEventoHistorial.FOTO_RESTABLECIDA);
    }

    @Test
    void eventosDeModeracion() {
        assertThat(TipoEventoHistorial.values()).filteredOn(TipoEventoHistorial::esModeracion)
                .containsExactly(TipoEventoHistorial.FOTO_OCULTA, TipoEventoHistorial.REPORTE_OCULTO,
                        TipoEventoHistorial.FOTO_RESTABLECIDA, TipoEventoHistorial.REPORTE_RESTABLECIDO);
        assertThat(TipoEventoHistorial.values()).filteredOn(TipoEventoHistorial::oculta)
                .containsExactly(TipoEventoHistorial.FOTO_OCULTA, TipoEventoHistorial.REPORTE_OCULTO);
    }

    @Test
    void laFotoPublica_esNulaSiSeOcultoLaFotoOElReporte() {
        assertThat(conFlags(false, false).fotoUrlPublica()).isEqualTo("/media/fotos/reportes/x.jpg");
        assertThat(conFlags(false, true).fotoUrlPublica()).isNull();
        assertThat(conFlags(true, false).fotoUrlPublica()).isNull();
        assertThat(Reporte.builder().build().fotoUrlPublica()).isNull();
    }

    /** Los flags son de solo lectura para JPA; en memoria los fija el builder, como los leeria Hibernate. */
    private static Reporte conFlags(boolean oculto, boolean fotoOculta) {
        return Reporte.builder().fotoUrl("/media/fotos/reportes/x.jpg").oculto(oculto).fotoOculta(fotoOculta).build();
    }
}
