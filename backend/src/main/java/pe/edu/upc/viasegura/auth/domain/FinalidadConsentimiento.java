package pe.edu.upc.viasegura.auth.domain;

/**
 * Finalidad de un consentimiento (D-12). La Ley N.° 29733 exige un
 * consentimiento por finalidad: aceptar los terminos no autoriza a enviar
 * push, ni el push autoriza el correo.
 */
public enum FinalidadConsentimiento {

    /** Terminos de uso y politica de privacidad. Obligatorio para usar la app. */
    TERMINOS_Y_PRIVACIDAD(true),
    /** Avisos push al navegador (US-21). Requisito para suscribirse. */
    NOTIFICACIONES_PUSH(false),
    /** Avisos por correo sobre los reportes propios (US-16). */
    NOTIFICACIONES_CORREO(false);

    private final boolean obligatoria;

    FinalidadConsentimiento(boolean obligatoria) {
        this.obligatoria = obligatoria;
    }

    /**
     * Si la cuenta no puede funcionar sin ella. Una finalidad obligatoria no
     * se revoca desde la app (409): retirarla equivale a dejar de usar el
     * servicio, y eso es la baja de la cuenta, no un ajuste de permisos.
     */
    public boolean esObligatoria() {
        return obligatoria;
    }
}
