package pe.edu.upc.viasegura.auth.port;

/**
 * Lo que dijo el DNS sobre si un dominio recibe correo (NC-09,
 * {@link VerificadorDeDominioDeCorreo}).
 */
public enum RecepcionDeCorreo {

    /** Tiene al menos un registro MX que apunta a un servidor. */
    RECIBE,

    /**
     * El DNS respondio que no: el dominio no existe, no tiene registros MX o
     * publica un «null MX» (RFC 7505, {@code 0 .}), que declara que no acepta
     * correo. El registro se rechaza con 409.
     */
    NO_RECIBE,

    /**
     * No se pudo saber: el DNS fallo o no respondio a tiempo, o la
     * verificacion esta apagada ({@code ninguno}). El registro sigue: el
     * enlace de confirmacion es la prueba definitiva de que el correo existe,
     * y un fallo del DNS no debe impedir registrarse (decision del usuario,
     * 28/10).
     */
    DESCONOCIDA
}
