package pe.edu.upc.viasegura.common.security;

import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.stereotype.Component;

/**
 * Autorizacion por defecto de las rutas privadas (D-12): autenticado
 * <b>y</b> con los terminos vigentes aceptados.
 *
 * <p>Si el usuario esta autenticado pero tiene los terminos pendientes, deja
 * {@link #ATRIBUTO_TERMINOS_PENDIENTES} en la peticion para que
 * {@link RestAccessDeniedHandler} responda 403 con el codigo
 * {@code TERMINOS_PENDIENTES}. Un anonimo se deniega sin marca y la cadena
 * responde 401, como antes.</p>
 *
 * <p>Costo: una consulta indexada por peticion privada (el filtro JWT ya hace
 * otra para cargar el usuario). Las rutas publicas no lo pagan porque se
 * resuelven antes en {@code SecurityConfig}.</p>
 */
@Component
@RequiredArgsConstructor
public class TerminosAceptadosAuthorizationManager implements AuthorizationManager<RequestAuthorizationContext> {

    public static final String ATRIBUTO_TERMINOS_PENDIENTES =
            TerminosAceptadosAuthorizationManager.class.getName() + ".pendientes";

    private final VerificadorTerminosPendientes verificador;

    @Override
    public AuthorizationDecision check(Supplier<Authentication> autenticacion, RequestAuthorizationContext contexto) {
        Authentication auth = autenticacion.get();
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken) {
            return new AuthorizationDecision(false);
        }
        if (verificador.tieneTerminosPendientes(auth.getName())) {
            contexto.getRequest().setAttribute(ATRIBUTO_TERMINOS_PENDIENTES, Boolean.TRUE);
            return new AuthorizationDecision(false);
        }
        return new AuthorizationDecision(true);
    }
}
