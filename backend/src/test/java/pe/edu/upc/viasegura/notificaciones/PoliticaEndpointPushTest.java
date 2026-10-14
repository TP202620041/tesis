package pe.edu.upc.viasegura.notificaciones;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import pe.edu.upc.viasegura.notificaciones.domain.PoliticaEndpointPush;

/** Lista blanca de servicios de push contra SSRF (NC-07). Test puro. */
class PoliticaEndpointPushTest {

    private static final List<String> PERMITIDOS = List.of(
            "fcm.googleapis.com", "*.push.services.mozilla.com", "*.notify.windows.com", "web.push.apple.com");

    @ParameterizedTest
    @ValueSource(strings = {
            "https://fcm.googleapis.com/fcm/send/abc:APA91b",
            "https://FCM.GoogleAPIs.com/fcm/send/abc",
            "https://fcm.googleapis.com:443/fcm/send/abc",
            "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
            "https://wns2-par02p.notify.windows.com/w/?token=abc",
            "https://web.push.apple.com/QGuQyavXutnMH"
    })
    void serviciosDePushConocidos_sePermiten(String endpoint) {
        assertThat(PoliticaEndpointPush.esPermitido(endpoint, PERMITIDOS)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "https://evil.example/push",
            "http://fcm.googleapis.com/fcm/send/abc",                 // sin TLS
            "https://fcm.googleapis.com.evil.com/fcm/send/abc",       // sufijo engañoso
            "https://evilfcm.googleapis.com/x",                       // exacto, no comodin
            "https://fcm.googleapis.com@evil.com/fcm/send/abc",       // credenciales
            "https://evil.com#@fcm.googleapis.com/",                  // fragmento
            "https://evil.com/fcm.googleapis.com",                    // host en la ruta
            "https://evil.com?h=fcm.googleapis.com",                  // host en la query
            "https://fcm.googleapis.com:8443/fcm/send/abc",           // puerto no estandar
            "https://fcm.googleapis.com./fcm/send/abc",               // punto final
            "https://push.services.mozilla.com/wpush",                // comodin exige subdominio
            "https://x.push.services.mozilla.com.evil.com/wpush",
            "https://127.0.0.1/push",
            "https://169.254.169.254/latest/meta-data",
            "https://[::1]/push",
            "https://localhost/push",
            "fcm.googleapis.com/fcm/send/abc",                        // sin esquema
            "https://fcm.googleapis.com /x",                          // no parsea
            ""
    })
    void hostsNoPermitidosOEnganosos_seRechazan(String endpoint) {
        assertThat(PoliticaEndpointPush.esPermitido(endpoint, PERMITIDOS)).isFalse();
    }

    @org.junit.jupiter.api.Test
    void nulo_seRechaza() {
        assertThat(PoliticaEndpointPush.esPermitido(null, PERMITIDOS)).isFalse();
    }
}
