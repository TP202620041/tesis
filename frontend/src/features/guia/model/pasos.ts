/**
 * US-24 Esc. 1: guía «¿Cómo funciona?», paso a paso, para quien entra por
 * primera vez. Contenido y navegación son reglas puras (sin React): el
 * componente solo los pinta.
 *
 * Cada paso lleva una ilustración esquemática de la pantalla que describe
 * (`components/IlustracionDePaso`), dibujada con los tokens del tema: se ve
 * igual en claro, oscuro y alto contraste, y no envejece cuando cambia un
 * detalle visual, como pasaría con una captura en PNG.
 */

/** Pantalla que ilustra cada paso. */
export type Ilustracion = 'mapa' | 'cuenta' | 'reportar' | 'sin-conexion' | 'seguimiento' | 'desempeno';

export interface PasoDeGuia {
  /** Identificador estable (`key` e ids del DOM). */
  id: string;
  titulo: string;
  resumen: string;
  puntos: readonly string[];
  ilustracion: Ilustracion;
  /** Texto alternativo de la ilustración: qué muestra, no cómo se ve. */
  descripcionIlustracion: string;
  /** Dónde se hace esto en la app. */
  enlace: { href: string; texto: string };
}

export const PASOS: readonly PasoDeGuia[] = [
  {
    id: 'mapa',
    titulo: 'Mira lo que ya se reportó',
    resumen:
      'En el mapa ves los daños viales que reportaron tus vecinos en Lima Metropolitana, con su estado.',
    puntos: [
      'No necesitas cuenta para ver el mapa.',
      'Filtra por distrito, tipo de daño, estado o fechas.',
      'Toca un marcador para ver la foto y el seguimiento del reporte.',
    ],
    ilustracion: 'mapa',
    descripcionIlustracion: 'Mapa de Lima con marcadores de reportes y el panel de filtros.',
    enlace: { href: '/mapa', texto: 'Abrir el mapa' },
  },
  {
    id: 'cuenta',
    titulo: 'Crea tu cuenta',
    resumen: 'Para reportar necesitas una cuenta gratuita con tu correo. No hay que instalar nada.',
    puntos: [
      'Regístrate con tu correo y una contraseña.',
      'Confirma tu correo con el enlace que te enviamos.',
      'Puedes instalar Ciudad Viva en tu teléfono desde el navegador, como una app.',
    ],
    ilustracion: 'cuenta',
    descripcionIlustracion: 'Formulario de registro con correo y contraseña.',
    enlace: { href: '/registro', texto: 'Crear cuenta' },
  },
  {
    id: 'reportar',
    titulo: 'Reporta un daño',
    resumen:
      'Toma una foto, confirma la ubicación y elige el tipo de daño. El reporte llega solo a la municipalidad del distrito.',
    puntos: [
      'La ubicación se toma del GPS; también puedes marcarla en el mapa.',
      'Elige el tipo de daño (bache, vereda dañada, semáforo…) y qué tan grave es.',
      'Si alguien ya reportó el mismo daño en ese lugar, tu reporte se suma como apoyo al existente.',
    ],
    ilustracion: 'reportar',
    descripcionIlustracion: 'Formulario de reporte con la foto, la ubicación y el tipo de daño.',
    enlace: { href: '/reportar', texto: 'Hacer un reporte' },
  },
  {
    id: 'sin-conexion',
    titulo: 'Sin señal también se puede',
    resumen:
      'Si te quedas sin conexión al enviar, el reporte se guarda en tu teléfono y se envía solo al volver la señal.',
    puntos: [
      'Mantén la app abierta para que se envíe.',
      'Te avisamos cuando se haya enviado.',
      'Mientras tanto lo ves en «Mis reportes», como pendiente de envío.',
    ],
    ilustracion: 'sin-conexion',
    descripcionIlustracion: 'Aviso de reporte guardado sin conexión y luego enviado.',
    enlace: { href: '/mis-reportes', texto: 'Ver mis reportes' },
  },
  {
    id: 'seguimiento',
    titulo: 'Sigue tu reporte',
    resumen:
      'En «Mis reportes» ves el estado de cada uno y su historial, con fechas y comentarios de la municipalidad.',
    puntos: [
      'Los estados son Pendiente, Recibido, En proceso y Resuelto (o Rechazado, con el motivo).',
      'Recibes un aviso cuando cambia el estado.',
      'Mientras siga Pendiente puedes editarlo o retirarlo.',
    ],
    ilustracion: 'seguimiento',
    descripcionIlustracion: 'Detalle de un reporte con su línea de tiempo de estados.',
    enlace: { href: '/mis-reportes', texto: 'Ver mis reportes' },
  },
  {
    id: 'desempeno',
    titulo: 'Califica y compara',
    resumen:
      'Cuando tu reporte se resuelve, califica la atención. El índice público muestra cómo responde cada distrito.',
    puntos: [
      'Califica con estrellas la atención que recibiste.',
      'Comenta si la reparación funcionó.',
      'Compara la tasa de resolución y el tiempo de atención entre distritos.',
    ],
    ilustracion: 'desempeno',
    descripcionIlustracion: 'Ranking de distritos con la tasa de resolución en barras.',
    enlace: { href: '/desempeno', texto: 'Ver el desempeño por distrito' },
  },
];

/** Índice válido más cercano: la guía nunca muestra un paso que no existe. */
export function acotarPaso(indice: number, total: number = PASOS.length): number {
  if (total <= 0 || !Number.isFinite(indice)) return 0;
  return Math.min(Math.max(Math.trunc(indice), 0), total - 1);
}

export function esPrimerPaso(indice: number): boolean {
  return indice <= 0;
}

export function esUltimoPaso(indice: number, total: number = PASOS.length): boolean {
  return indice >= total - 1;
}

/** «Paso 2 de 6». */
export function textoDeProgreso(indice: number, total: number = PASOS.length): string {
  return `Paso ${acotarPaso(indice, total) + 1} de ${total}`;
}

/** Ruta de la guía (US-24): la enlazan el menú principal, la cuenta y la portada. */
export const RUTA_GUIA = '/como-funciona';
