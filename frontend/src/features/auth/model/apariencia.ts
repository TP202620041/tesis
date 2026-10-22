/**
 * US-23 · Apariencia (DIS-1): claro, oscuro, alto contraste o lo que diga el
 * sistema. Es una preferencia del DISPOSITIVO, no de la cuenta: se guarda en
 * `localStorage` (no viaja al backend) y la aplica `public/tema.js` en
 * `<html data-theme>` antes de pintar, sin cookies (leerlas en el layout raíz
 * lo volvería dinámico).
 *
 * `public/tema.js` repite estas reglas en JavaScript plano (corre antes que
 * React y que el bundle). `apariencia.test.ts` lo ejecuta y comprueba que
 * resuelve igual que {@link temaDe}: si cambia una, el test obliga a cambiar
 * la otra.
 */

export const APARIENCIAS = ['sistema', 'claro', 'oscuro', 'alto-contraste'] as const;
export type Apariencia = (typeof APARIENCIAS)[number];

/** Lo que de verdad se aplica: el valor de `data-theme` en `<html>`. */
export type Tema = Exclude<Apariencia, 'sistema'>;

/** Clave en `localStorage` (con el prefijo técnico de siempre, como `viasegura.token`). */
export const CLAVE_APARIENCIA = 'viasegura.apariencia';

export const APARIENCIA_POR_DEFECTO: Apariencia = 'sistema';

export function esApariencia(valor: unknown): valor is Apariencia {
  return typeof valor === 'string' && (APARIENCIAS as readonly string[]).includes(valor);
}

/** Lo guardado, o «Sistema» si no hay nada o el valor no se reconoce. */
export function aparienciaGuardada(valor: string | null | undefined): Apariencia {
  return esApariencia(valor) ? valor : APARIENCIA_POR_DEFECTO;
}

/** Lo que el sistema operativo pide (`prefers-color-scheme`, `prefers-contrast`). */
export interface PreferenciasDelSistema {
  oscuro: boolean;
  masContraste: boolean;
}

/**
 * Tema que corresponde a una apariencia. «Sistema» respeta primero el pedido
 * de más contraste (es una necesidad, no un gusto) y después el modo oscuro.
 */
export function temaDe(apariencia: Apariencia, sistema: PreferenciasDelSistema): Tema {
  if (apariencia !== 'sistema') return apariencia;
  if (sistema.masContraste) return 'alto-contraste';
  return sistema.oscuro ? 'oscuro' : 'claro';
}

export interface OpcionDeApariencia {
  valor: Apariencia;
  etiqueta: string;
  descripcion: string;
}

export const OPCIONES_DE_APARIENCIA: readonly OpcionDeApariencia[] = [
  { valor: 'sistema', etiqueta: 'Sistema', descripcion: 'Sigue la configuración de tu dispositivo.' },
  { valor: 'claro', etiqueta: 'Claro', descripcion: 'Fondo claro y texto oscuro.' },
  { valor: 'oscuro', etiqueta: 'Oscuro', descripcion: 'Fondo oscuro, más cómodo de noche.' },
  {
    valor: 'alto-contraste',
    etiqueta: 'Alto contraste',
    descripcion: 'Negro sobre blanco, bordes gruesos y estados con contorno.',
  },
];
