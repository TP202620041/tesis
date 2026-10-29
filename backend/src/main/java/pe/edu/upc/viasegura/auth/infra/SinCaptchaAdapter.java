package pe.edu.upc.viasegura.auth.infra;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import pe.edu.upc.viasegura.auth.port.VerificadorDeCaptcha;

/**
 * Sin captcha (NC-08): {@code app.captcha.tipo=ninguno}, el valor por defecto
 * fuera del perfil {@code prod}. El registro no exige token y el
 * {@code captchaToken} que llegue se ignora. Permite correr la suite y el
 * desarrollo local sin red ni claves de Cloudflare; en {@code prod}
 * {@code CAPTCHA_TIPO} es obligatoria y no tiene valor por defecto.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.captcha.tipo", havingValue = "ninguno", matchIfMissing = true)
public class SinCaptchaAdapter implements VerificadorDeCaptcha {

    public SinCaptchaAdapter() {
        log.info("Registro sin captcha (CAPTCHA_TIPO=ninguno)");
    }

    @Override
    public boolean exigido() {
        return false;
    }

    @Override
    public void verificar(String token) {
        // Nada que verificar.
    }
}
