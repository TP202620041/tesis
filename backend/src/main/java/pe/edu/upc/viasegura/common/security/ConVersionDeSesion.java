package pe.edu.upc.viasegura.common.security;

/**
 * Lo que la cadena de seguridad necesita saber del usuario cargado para
 * aceptar un token (US-04 Esc. 2): la version de sesion vigente de la cuenta.
 *
 * <p>Vive en {@code common} y la implementa el {@code UserDetails} que arma
 * {@code auth} ({@code UsuarioDetailsService}), como
 * {@link VerificadorTerminosPendientes}: {@code common} no depende de ningun
 * modulo. Un token cuya version no coincide con esta fue revocado.</p>
 */
public interface ConVersionDeSesion {

    /** La version vigente; un token con otra version ya no autentica. */
    int versionDeSesion();
}
