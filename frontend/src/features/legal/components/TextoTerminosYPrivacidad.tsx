import type { ReactNode } from 'react';
import { VERSION_TERMINOS } from '@/features/auth/model/terminos';

/**
 * NC-07b (D-12): texto de los terminos de uso y la politica de privacidad,
 * version {@link VERSION_TERMINOS}.
 *
 * Copia del borrador `project-context/legal/terminos-y-privacidad-v1.md`
 * (secciones 1 a 11), sin agregar contenido. Es un BORRADOR pendiente de
 * revision legal: por eso el aviso visible y los `[COMPLETAR]` resaltados
 * tal como estan en el original. La nota interna del borrador (quien lo
 * redacto y que debe revisarse) se resume en el aviso; no es texto para el
 * usuario.
 *
 * Al publicar una version nueva: reemplazar este texto, `VERSION_TERMINOS`
 * (`features/auth/model/terminos.ts`) y `app.legal.version-terminos` del
 * backend en la misma entrega (el test de `terminos.ts` lo vigila).
 */
export function TextoTerminosYPrivacidad({ conTitulo = true }: { conTitulo?: boolean }) {
  return (
    <article className="flex flex-col gap-4 text-sm leading-relaxed text-texto">
      {conTitulo && (
        <h1 className="text-2xl font-bold text-texto">
          Términos de uso y política de privacidad de Ciudad Viva
        </h1>
      )}

      <p
        role="note"
        className="rounded-control border border-aviso-borde bg-aviso-fondo px-3 py-2 text-aviso-texto"
      >
        <strong>Borrador pendiente de revisión</strong> (versión{' '}
        <code className="font-mono">{VERSION_TERMINOS}</code>, 19/10/2026). Este texto todavía no
        tiene revisión legal y puede cambiar; lo marcado [COMPLETAR] aún falta definir. Marco: Ley
        N.° 29733, Ley de Protección de Datos Personales, y su reglamento.
      </p>

      <Seccion titulo="1. Quiénes somos">
        <p>
          Ciudad Viva es una plataforma de reporte ciudadano de daños en la infraestructura vial de
          Lima Metropolitana. La desarrolla <Completar>nombres de los autores</Completar> como parte
          de una tesis de la Universidad Peruana de Ciencias Aplicadas (UPC).
        </p>
        <p>
          El titular del banco de datos personales es{' '}
          <Completar>persona natural o jurídica responsable, domicilio y correo de contacto</Completar>
          . Para cualquier consulta sobre tus datos puedes escribir a{' '}
          <Completar>correo de contacto</Completar> o usar la sección <strong>Soporte</strong> de la
          aplicación.
        </p>
      </Seccion>

      <Seccion titulo="2. Qué datos tratamos">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-linea-campo">
                <th className="py-1.5 pr-3 font-semibold">Dato</th>
                <th className="py-1.5 pr-3 font-semibold">Cuándo lo recogemos</th>
                <th className="py-1.5 font-semibold">Para qué</th>
              </tr>
            </thead>
            <tbody>
              {DATOS_TRATADOS.map(([dato, cuando, paraQue]) => (
                <tr key={dato} className="border-b border-linea align-top">
                  <td className="py-1.5 pr-3">{dato}</td>
                  <td className="py-1.5 pr-3">{cuando}</td>
                  <td className="py-1.5">{paraQue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          <strong>Lo que no hacemos:</strong> no vendemos tus datos, no los usamos para publicidad y
          no te pedimos datos sensibles.
        </p>
      </Seccion>

      <Seccion titulo="3. Qué es público">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>El reporte es público:</strong> cualquier persona puede ver en el mapa la foto
            del daño, su ubicación, la descripción, el tipo, el estado y la fecha. Así funciona una
            plataforma de transparencia: no fotografíes personas, placas de vehículos ni el interior
            de viviendas.
          </li>
          <li>
            <strong>Tu identidad como autor no se publica:</strong> el mapa y el detalle de un
            reporte no muestran quién lo hizo.
          </li>
          <li>
            <strong>Comentarios públicos:</strong> se muestran con tu nombre (no tu correo ni tu
            apellido completo).
          </li>
          <li>
            <strong>Índice de desempeño:</strong> con los reportes y calificaciones se calcula un
            índice público por distrito. Solo usa cifras agregadas; nunca datos de una persona.
          </li>
        </ul>
      </Seccion>

      <Seccion titulo="4. Con quién compartimos tus datos">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>La municipalidad del distrito</strong> donde está el daño recibe el reporte para
            atenderlo. El personal municipal no ve tu correo.
          </li>
          <li>
            <strong>Proveedores técnicos que procesan datos en nuestro nombre</strong>:{' '}
            <Completar>servicio de correo, alojamiento del servidor y de la base de datos</Completar>
            . Para las notificaciones push, el aviso pasa por el servicio de push de tu navegador
            (Google, Mozilla, Microsoft o Apple), que solo recibe un mensaje cifrado.
          </li>
          <li>
            <strong>Autoridades</strong>, solo cuando una ley o una orden judicial lo exija.
          </li>
        </ul>
      </Seccion>

      <Seccion titulo="5. Tus consentimientos (y cómo retirarlos)">
        <p>
          Te pedimos un consentimiento separado para cada finalidad, y puedes revisarlos en tu{' '}
          <strong>Perfil</strong>:
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <strong>Términos de uso y privacidad:</strong> obligatorio para usar la plataforma. Si
            cambia este documento, te pediremos aceptar la nueva versión al iniciar sesión.
          </li>
          <li>
            <strong>Notificaciones push:</strong> opcional. Puedes retirarlo cuando quieras; si lo
            haces, dejamos de enviarte push en todos tus navegadores.
          </li>
          <li>
            <strong>Notificaciones por correo:</strong> opcional. Sin este consentimiento no te
            enviamos avisos por correo sobre tus reportes. Los correos que <strong>tú pediste</strong>
            , como la recuperación de contraseña o la respuesta a una consulta de soporte, se envían
            siempre (decisión del 19/10).
          </li>
        </ol>
        <p>
          Retirar un consentimiento no invalida lo que hicimos antes con él. Para dejar de aceptar
          los términos de uso hay que cerrar la cuenta (ver §7).
        </p>
      </Seccion>

      <Seccion titulo="6. Cuánto tiempo guardamos tus datos">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Cuenta:</strong> mientras esté activa.
          </li>
          <li>
            <strong>Reportes:</strong> forman parte del registro público de daños y del índice de
            desempeño. <Completar>plazo, o la anonimización del autor al cerrar la cuenta.</Completar>
          </li>
          <li>
            <strong>Consultas de soporte:</strong> <Completar>plazo</Completar>.
          </li>
          <li>
            <strong>Suscripciones push:</strong> hasta que las desactives, cierres sesión en ese
            navegador o el servicio de push las dé por vencidas.
          </li>
        </ul>
      </Seccion>

      <Seccion titulo="7. Tus derechos">
        <p>
          Según la Ley N.° 29733 puedes ejercer tus derechos de{' '}
          <strong>acceso, rectificación, cancelación y oposición</strong> (ARCO), además de{' '}
          <strong>revocar</strong> tus consentimientos.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Puedes corregir tu nombre y tu foto desde tu <strong>Perfil</strong>.
          </li>
          <li>
            Para lo demás, incluido cerrar tu cuenta, escribe a{' '}
            <Completar>correo de contacto</Completar> o usa <strong>Soporte</strong>. Te
            responderemos en los plazos que fija la ley.
          </li>
          <li>
            Si no quedas conforme, puedes presentar un reclamo ante la Autoridad Nacional de
            Protección de Datos Personales.
          </li>
        </ul>
      </Seccion>

      <Seccion titulo="8. Seguridad">
        <ul className="list-disc space-y-1 pl-5">
          <li>La conexión va cifrada.</li>
          <li>Las contraseñas se guardan con un algoritmo de hash.</li>
          <li>Las fotos de perfil solo se entregan a su dueño.</li>
          <li>Las notificaciones push van cifradas de extremo a extremo hasta tu navegador.</li>
          <li>
            La sesión vence a las <Completar>confirmar</Completar> 2 horas.
          </li>
        </ul>
        <p>
          Ningún sistema es infalible. Si detectamos un incidente que afecte tus datos, te lo
          informaremos.
        </p>
      </Seccion>

      <Seccion titulo="9. Uso responsable de la plataforma">
        <ul className="list-disc space-y-1 pl-5">
          <li>Reporta solo daños reales en la vía pública.</li>
          <li>No subas fotos con personas identificables, placas de vehículos ni contenido ofensivo.</li>
          <li>No uses los comentarios para insultar ni para difundir datos de terceros.</li>
        </ul>
        <p>Podemos rechazar o retirar contenido que incumpla estas reglas.</p>
      </Seccion>

      <Seccion titulo="10. Responsabilidad sobre las fotografías y el contenido que subes">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Las fotografías, descripciones y comentarios que adjuntas son de tu exclusiva
            responsabilidad.
          </li>
          <li>
            Al subir una foto declaras que la tomaste tú o que tienes derecho a usarla, y que no
            vulnera derechos de terceros (imagen, intimidad, propiedad intelectual).
          </li>
          <li>
            Ciudad Viva no revisa las fotos antes de publicarlas. En la medida en que la ley lo
            permita, no se hace responsable de su contenido, su veracidad ni de los daños que su
            publicación cause a terceros; esa responsabilidad recae en quien la subió.
          </li>
          <li>
            Nos autorizas, de forma gratuita y no exclusiva, a mostrar la foto en la plataforma y a
            compartirla con la municipalidad para atender el reporte.
          </li>
          <li>
            Si una foto vulnera tus derechos, pide su retiro por Soporte. Podemos
            retirar sin aviso el contenido que incumpla estos términos (§9).
          </li>
        </ul>
      </Seccion>

      <Seccion titulo="11. Cambios a este documento">
        <p>
          Cada versión lleva una fecha. Si cambia algo importante, te pediremos que aceptes la nueva
          versión la próxima vez que entres; hasta que lo hagas, no podrás seguir usando la cuenta.
        </p>
      </Seccion>

      <p className="border-t border-linea pt-3 text-xs text-texto-2">
        Versión: <code className="font-mono">{VERSION_TERMINOS}</code> (borrador).
      </p>
    </article>
  );
}

/** Filas de la tabla de §2 (dato, cuándo, para qué), tal como en el borrador. */
const DATOS_TRATADOS: ReadonlyArray<readonly [string, string, string]> = [
  [
    'Correo electrónico, nombre, apellido y contraseña (guardada solo como hash, nunca en texto plano)',
    'Al crear tu cuenta',
    'Identificarte, iniciar sesión y escribirte sobre tus reportes',
  ],
  ['Foto de perfil (opcional)', 'Si la subes en tu perfil', 'Mostrarla solo a ti; no es pública'],
  [
    'Foto del daño, ubicación GPS (o el punto que marques en el mapa), descripción y tipo de daño',
    'Al crear un reporte',
    'Registrar el daño y enviarlo a la municipalidad del distrito donde está',
  ],
  [
    'Tu adhesión a un reporte existente',
    'Al reportar un daño ya registrado cerca',
    'Contar cuántos vecinos respaldan ese reporte',
  ],
  [
    'Comentarios públicos y calificaciones de la atención',
    'Si comentas o calificas un reporte',
    'Mostrar la opinión ciudadana y medir el desempeño de cada municipalidad',
  ],
  [
    'Consultas de soporte (asunto, mensaje y tu correo)',
    'Si contactas a soporte',
    'Responder tu consulta',
  ],
  [
    'Datos de suscripción a notificaciones push del navegador (dirección técnica del servicio de push, claves de cifrado y tipo de navegador)',
    'Si activas las notificaciones push',
    'Avisarte cuando cambie el estado de tus reportes',
  ],
  [
    'Historial de tus consentimientos (qué aceptaste, qué versión y cuándo, y cuándo lo revocaste)',
    'Al aceptar o revocar',
    'Demostrar que aceptaste, como exige la ley',
  ],
];

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-texto">{titulo}</h2>
      {children}
    </section>
  );
}

/** Lo que el borrador deja por definir, visible como tal. */
function Completar({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded bg-aviso-fondo px-1 text-aviso-texto">
      [COMPLETAR: {children}]
    </mark>
  );
}
