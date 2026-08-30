package pe.edu.upc.viasegura.auth.domain;

/** Roles del sistema. Base de la autorizacion con Spring Security. */
public enum Rol {
    /** Vecino que reporta y hace seguimiento de danos viales. */
    CIUDADANO,
    /** Personal de una municipalidad distrital que gestiona reportes. */
    FUNCIONARIO_MUNICIPAL,
    /** Administrador de la plataforma. */
    ADMIN
}
