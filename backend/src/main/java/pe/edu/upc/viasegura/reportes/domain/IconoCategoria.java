package pe.edu.upc.viasegura.reportes.domain;

/**
 * Conjunto cerrado de iconos de una categoria de dano (US-29 Esc. 1, V19).
 *
 * <p>El servidor solo acepta estos identificadores: la PWA asocia cada uno a
 * un dibujo propio, asi que un texto libre no tendria con que mostrarse (y
 * un nombre de archivo o una URL abriria la puerta a contenido externo). Se
 * guardan por nombre en {@code categoria_dano.icono}; agregar uno es agregar
 * una constante aqui y su dibujo en la PWA, sin migracion.</p>
 */
public enum IconoCategoria {
    BACHE,
    GRIETA,
    VEREDA,
    SEMAFORO,
    SENALIZACION,
    CICLOVIA,
    DRENAJE,
    ILUMINACION,
    BARANDA,
    PUENTE,
    ARBOL,
    ESCOMBROS,
    OBRA,
    OTRO
}
