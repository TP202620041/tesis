package pe.edu.upc.viasegura.common.port;

/**
 * Archivo que subio el cliente, ya leido, sin tipos de Spring Web (BE-10).
 *
 * <p>El controller convierte el {@code MultipartFile} del pedido en este
 * record antes de llamar al servicio, asi {@code service/} y el puerto
 * {@link FotoStorageService} no dependen de HTTP (ARCHITECTURE.md 4.2). Las
 * validaciones (extension permitida y archivo no vacio) siguen en el
 * adaptador, igual que antes; el tamano maximo lo sigue imponiendo
 * {@code spring.servlet.multipart.max-file-size} antes de llegar aqui.</p>
 *
 * @param contenido      bytes del archivo (vacio si el cliente envio una parte sin contenido)
 * @param contentType    tipo declarado por el cliente; puede ser {@code null}
 * @param nombreOriginal nombre que envio el cliente; solo se usa su extension
 *                       y nunca llega al filesystem
 */
public record ArchivoSubido(byte[] contenido, String contentType, String nombreOriginal) {

    public ArchivoSubido {
        contenido = contenido == null ? new byte[0] : contenido;
    }

    /** Mismo criterio que {@code MultipartFile#isEmpty}: sin bytes. */
    public boolean vacio() {
        return contenido.length == 0;
    }

    /** Sin los bytes: un log o un mensaje de error no debe volcar el archivo. */
    @Override
    public String toString() {
        return "ArchivoSubido[" + nombreOriginal + ", " + contentType + ", " + contenido.length + " bytes]";
    }
}
