package pe.edu.upc.viasegura.auth.event;

import pe.edu.upc.viasegura.auth.domain.FinalidadConsentimiento;

/**
 * Un usuario revoco su consentimiento para una finalidad (D-12). Lo publica
 * {@code ConsentimientoService} dentro de la transaccion de la revocacion
 * para que los modulos que dependen de ese permiso reaccionen sin que
 * {@code auth} los conozca: {@code notificaciones} borra las suscripciones
 * push al revocar {@code NOTIFICACIONES_PUSH}.
 */
public record ConsentimientoRevocadoEvent(Long usuarioId, FinalidadConsentimiento finalidad) {}
