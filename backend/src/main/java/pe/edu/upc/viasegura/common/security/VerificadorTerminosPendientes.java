package pe.edu.upc.viasegura.common.security;

/**
 * Pregunta que la cadena de seguridad le hace al modulo de cuentas (D-12):
 * si el usuario autenticado todavia debe aceptar los terminos vigentes.
 *
 * <p>Vive en {@code common} y la implementa {@code auth}
 * ({@code ConsentimientoService}) para que {@code common} no dependa de
 * ningun modulo: el grafo sigue siendo {@code common <- auth}.</p>
 */
public interface VerificadorTerminosPendientes {

    /** {@code true} si el usuario con ese correo no tiene aceptados los terminos vigentes. */
    boolean tieneTerminosPendientes(String email);
}
