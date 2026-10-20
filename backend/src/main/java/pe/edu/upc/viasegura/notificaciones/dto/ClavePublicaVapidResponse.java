package pe.edu.upc.viasegura.notificaciones.dto;

/**
 * Clave publica VAPID del servidor (US-21), en base64url (punto sin
 * comprimir de P-256). El frontend la pasa como {@code applicationServerKey}
 * a {@code pushManager.subscribe}. Publica: no identifica a nadie.
 */
public record ClavePublicaVapidResponse(String clavePublica) {}
