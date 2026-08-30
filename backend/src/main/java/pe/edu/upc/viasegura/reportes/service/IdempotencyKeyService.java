package pe.edu.upc.viasegura.reportes.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.reportes.domain.IdempotencyKey;
import pe.edu.upc.viasegura.reportes.dto.ReporteResponse;
import pe.edu.upc.viasegura.reportes.repository.IdempotencyKeyRepository;

/**
 * US-06: idempotencia real en {@code POST /api/reportes} via el header
 * HTTP {@code Idempotency-Key}.
 *
 * <p><b>Distincion frente al 409 de acumulacion de US-09:</b> el 409 de
 * US-09 significa "este punto+categoria ya tiene un reporte activo, te
 * ADHIERES en vez de duplicar" y aplica entre intentos DISTINTOS (dos
 * ciudadanos distintos, o el mismo ciudadano reportando genuinamente el
 * mismo dano dos veces con dos intentos separados). La idempotencia de
 * esta clase resuelve un problema distinto: "esto es LITERALMENTE el
 * mismo intento de creacion, reenviado por el cliente porque la
 * respuesta original no llego" (p.ej. un reintento de sincronizacion del
 * Service Worker tras una conexion caida). Ambos mecanismos conviven sin
 * pisarse: la clave de idempotencia se resuelve ANTES de tocar la logica
 * de negocio de US-09 (ver {@code ReporteService#crear}); si la clave no
 * se ha visto antes (o vencio), US-09 se ejecuta exactamente igual que
 * sin idempotencia.</p>
 *
 * <p>Solo se cachean respuestas EXITOSAS (el reporte/adhesion se creo).
 * Si el intento original fallo por una regla de negocio (categoria
 * invalida, fuera de cobertura, etc.) no se registra nada: un reintento
 * con la misma clave vuelve a ejecutar la logica completa. Ese tipo de
 * error normalmente requiere que el cliente corrija algo, asi que
 * cachear el error no aporta -- y podria ocultar que la condicion ya se
 * resolvio (p.ej. la categoria se reactivo).</p>
 *
 * <p>Clave vencida (mas de {@value #VIGENCIA_HORAS} h): se trata como
 * intento NUEVO, no como reintento. El cache se ignora y se ejecuta la
 * logica de negocio completa, incluida la deduplicacion de US-09. Eso
 * NO significa "crear otro reporte a la fuerza": si el intento original
 * ya dejo un reporte/adhesion, US-09 seguira aplicando (tipicamente 409
 * si el mismo ciudadano ya esta adherido). La expiracion solo olvida la
 * respuesta cacheada, no deshace el efecto de negocio.</p>
 *
 * <p><b>Concurrencia (limitacion conocida y acotada).</b> La lectura de
 * {@link #respuestaPrevia} es la ruta rapida, no la garantia: si dos
 * requests con la MISMA clave llegan simultaneamente, ambos pueden leer
 * "no hay respuesta previa" y ejecutar la logica de negocio en paralelo.
 * Quien impide la duplicacion en ese caso es la restriccion UNIQUE
 * {@code uk_idempotency_key_clave_usuario}: ambas transacciones intentan
 * insertar la misma clave, la perdedora aborta y hace rollback COMPLETO
 * -- incluido el reporte/adhesion que alcanzo a crear, porque
 * {@code registrar} corre dentro de la misma transaccion que
 * {@code ReporteService#crear}. Es decir, el invariante "una clave = un
 * efecto de negocio" se mantiene aun sin sincronizacion explicita.
 * Consecuencia aceptada: el cliente perdedor recibe un 500 en vez de la
 * respuesta cacheada; su siguiente reintento (ya con la transaccion
 * ganadora confirmada) obtiene el 201 correcto. No se agrego un lock ni
 * un reintento sobre {@code DataIntegrityViolationException} porque el
 * caso de uso real de US-06 es la resincronizacion diferida de un
 * Service Worker (reintento tras timeout, secuencial), no requests
 * concurrentes; la integridad de datos ya esta garantizada y el costo
 * seria complejidad sin beneficio en el alcance de la tesis.</p>
 */
@Service
@RequiredArgsConstructor
public class IdempotencyKeyService {

    /** Vigencia de una clave: un reporte offline puede tardar en sincronizar. */
    private static final long VIGENCIA_HORAS = 48;

    private final IdempotencyKeyRepository repository;
    private final ObjectMapper objectMapper;

    /** Respuesta ya registrada para esta clave+usuario, si sigue vigente. */
    @Transactional(readOnly = true)
    public Optional<ReporteResponse> respuestaPrevia(String clave, Usuario usuario) {
        return repository.findByClaveAndUsuarioId(clave, usuario.getId())
                .filter(IdempotencyKey::vigente)
                .map(this::deserializar);
    }

    /**
     * Registra la respuesta de una ejecucion exitosa. Si existia una fila
     * previa para la misma clave+usuario, era necesariamente una vencida
     * (una vigente la habria devuelto {@link #respuestaPrevia} y este
     * metodo no se habria llamado) y se reemplaza: reutilizar la misma
     * clave despues de que vencio es, por definicion, un intento nuevo.
     */
    @Transactional
    public void registrar(String clave, Usuario usuario, ReporteResponse respuesta) {
        repository.deleteByClaveAndUsuarioId(clave, usuario.getId());
        // El delete derivado no se flushea solo: sin esto, el INSERT de la
        // fila nueva choca con uk_idempotency_key_clave_usuario si habia
        // una fila vencida con la misma clave (reutilizacion post-expiracion).
        repository.flush();
        Instant ahora = Instant.now();
        repository.save(IdempotencyKey.builder()
                .clave(clave)
                .usuario(usuario)
                .responseBody(serializar(respuesta))
                .createdAt(ahora)
                .expiresAt(ahora.plus(VIGENCIA_HORAS, ChronoUnit.HOURS))
                .build());
    }

    private String serializar(ReporteResponse respuesta) {
        try {
            return objectMapper.writeValueAsString(respuesta);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("No se pudo serializar la respuesta de idempotencia", e);
        }
    }

    private ReporteResponse deserializar(IdempotencyKey key) {
        try {
            return objectMapper.readValue(key.getResponseBody(), ReporteResponse.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("No se pudo deserializar la respuesta de idempotencia", e);
        }
    }
}
