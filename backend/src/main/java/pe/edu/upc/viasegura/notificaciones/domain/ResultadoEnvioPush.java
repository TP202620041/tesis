package pe.edu.upc.viasegura.notificaciones.domain;

/** Como respondio el servicio de push a un envio (US-21). */
public enum ResultadoEnvioPush {

    /** 2xx: el servicio de push acepto el mensaje. */
    ENTREGADO,
    /**
     * 404/410: la suscripcion ya no existe (el usuario revoco el permiso del
     * navegador o desinstalo la PWA). No hay que volver a intentarlo.
     */
    SUSCRIPCION_CADUCADA,
    /** Cualquier otro error (red, 4xx/5xx, timeout). Puede ser transitorio. */
    ERROR
}
