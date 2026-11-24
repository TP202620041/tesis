package pe.edu.upc.viasegura.auth.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Intentos fallidos de inicio de sesion de un correo (US-02 Esc. 2, V22).
 *
 * <p>Se indexa por el correo normalizado, exista o no la cuenta, para que el
 * bloqueo no revele que correos estan registrados. La escribe un
 * {@code UPSERT} atomico de {@code IntentoLoginRepository}: la entidad solo
 * se lee.</p>
 */
@Entity
@Table(name = "intento_login")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class IntentoLogin {

    @Id
    @Column(length = 150)
    private String email;

    @Column(nullable = false)
    private int fallidos;

    @Column(name = "ultimo_fallo", nullable = false)
    private Instant ultimoFallo;

    @Column(name = "bloqueado_hasta")
    private Instant bloqueadoHasta;
}
