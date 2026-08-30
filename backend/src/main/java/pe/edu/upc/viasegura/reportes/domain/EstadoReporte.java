package pe.edu.upc.viasegura.reportes.domain;

import java.util.EnumSet;
import java.util.Set;

/**
 * Ciclo de vida de un reporte y su maquina de transiciones (US-08, US-14).
 *
 * <p>PENDIENTE es el estado editable/cancelable por el ciudadano antes de
 * ser tomado por la municipalidad; el resto son estados de gestion
 * municipal. El flujo es unidireccional: RESUELTO, RECHAZADO y CANCELADO
 * son terminales (no se reabren), para no corromper las metricas de
 * desempeno distrital (US-18/US-20) que dependen de un estado final
 * estable.</p>
 *
 * <p><b>Hay DOS actores con potestades distintas, y esta clase lo dice
 * explicitamente.</b> Antes existia un unico conjunto
 * {@code transicionesPermitidas()} que mezclaba ambos, y esa mezcla fue una
 * vulnerabilidad real: el endpoint de gestion municipal consultaba ese
 * conjunto unico y por tanto aceptaba CANCELADO como destino, permitiendo
 * que un funcionario retirara reportes de su propio distrito (ver la nota de
 * seguridad en el README). Modelar el actor evita que el mismo descuido se
 * repita: quien agregue un estado nuevo tiene que decidir a que conjunto
 * pertenece, en vez de heredar por omision uno que no le corresponde.</p>
 *
 * <ul>
 *   <li><b>Gestion municipal</b> (US-14, {@code PATCH /api/reportes/{id}/estado}):
 *       {@link #transicionesDeGestionMunicipal()}.</li>
 *   <li><b>Ciudadano creador</b> (US-08, {@code DELETE /api/reportes/{id}}):
 *       el unico camino a CANCELADO, y solo desde PENDIENTE. No pasa por
 *       esta maquina: lo resuelve {@code ReporteService#cancelar}, que
 *       verifica autoria y estado.</li>
 * </ul>
 */
public enum EstadoReporte {
    PENDIENTE,
    RECIBIDO,
    EN_PROCESO,
    RESUELTO,
    RECHAZADO,
    CANCELADO;

    /**
     * Estados a los que la GESTION MUNICIPAL puede llevar un reporte.
     *
     * <p><b>CANCELADO no aparece a proposito, en ningun caso.</b> Cancelar
     * es el retiro voluntario del ciudadano sobre su propio reporte (US-08);
     * no es una decision municipal. Si la municipalidad quiere descartar un
     * reporte, la via es RECHAZADO, que exige comentario justificatorio y
     * queda auditada como decision suya. Permitir que cancelara seria
     * ademas una via para maquillar metricas: un CANCELADO queda excluido de
     * {@code total_reportes} en la vista de desempeno (migracion V7) y no
     * aparece en la busqueda publica, asi que un reporte incomodo podria
     * desaparecer del escrutinio disfrazado de retiro del vecino.</p>
     */
    public Set<EstadoReporte> transicionesDeGestionMunicipal() {
        return switch (this) {
            case PENDIENTE -> EnumSet.of(RECIBIDO, RECHAZADO);
            case RECIBIDO -> EnumSet.of(EN_PROCESO, RECHAZADO);
            case EN_PROCESO -> EnumSet.of(RESUELTO, RECHAZADO);
            case RESUELTO, RECHAZADO, CANCELADO -> EnumSet.noneOf(EstadoReporte.class);
        };
    }

    /** {@code true} si la gestion municipal puede llevar este reporte a {@code destino}. */
    public boolean gestionMunicipalPuedeTransicionarA(EstadoReporte destino) {
        return transicionesDeGestionMunicipal().contains(destino);
    }

    /**
     * {@code true} si el ciudadano creador puede retirar el reporte (US-08).
     *
     * <p>Solo mientras siga PENDIENTE: una vez que la municipalidad lo toma
     * (RECIBIDO en adelante), el ciudadano ya no puede retirarlo
     * unilateralmente porque hay trabajo municipal comprometido.</p>
     */
    public boolean elCreadorPuedeCancelar() {
        return this == PENDIENTE;
    }

    public boolean esTerminal() {
        return this == RESUELTO || this == RECHAZADO || this == CANCELADO;
    }
}
