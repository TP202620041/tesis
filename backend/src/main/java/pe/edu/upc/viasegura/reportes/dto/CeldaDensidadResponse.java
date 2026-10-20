package pe.edu.upc.viasegura.reportes.dto;

/**
 * Una celda de la grilla del mapa de calor (US-11).
 *
 * <p>Solo coordenadas del punto de la grilla y cuantos reportes caen en
 * ella: ni ids, ni categoria, ni estado, ni ninguna senal interna
 * ({@code posibleReincidencia}, sugerencias de IA, prioridad). Es un DTO
 * publico y anonimo (SEC-02): cualquier campo nuevo aqui lo lee cualquiera.</p>
 *
 * @param latitud  latitud del punto de la grilla (redondeada al tamano de celda)
 * @param longitud longitud del punto de la grilla
 * @param cantidad reportes en la celda (siempre 1 o mas)
 */
public record CeldaDensidadResponse(double latitud, double longitud, long cantidad) {}
