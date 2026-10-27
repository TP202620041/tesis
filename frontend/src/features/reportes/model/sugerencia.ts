/**
 * NC-04: la categoría que sugiere la foto mientras el ciudadano arma el
 * reporte (vista previa de `POST /api/clasificaciones`, handoff
 * `2026-10-25-clasificacion-vista-previa`). Reglas puras: qué cuenta como
 * sugerencia y qué se muestra según lo que ya eligió el ciudadano.
 *
 * La sugerencia solo **propone**: el formulario nunca cambia la categoría sin
 * una acción del ciudadano (DS 016-2024-JUS, art. 6.1). Una sugerencia que
 * llega tarde, o que no coincide con lo elegido, se muestra como propuesta y
 * nada más. La razón está en el README («Sugerencia de la categoría por la
 * foto»).
 */
import type { ClasificacionResponse } from '@/lib/types/domain';

/** Categoría que propone la foto. Siempre una estándar activa (handoff). */
export interface SugerenciaDeCategoria {
  categoriaId: number;
  categoriaNombre: string;
}

/**
 * Estado de la vista previa de la foto que está en el formulario.
 *
 * - `inactiva`: no hay foto, o la vista previa se descartó (el ciudadano envió
 *   el reporte antes de que llegara la respuesta).
 * - `analizando`: la foto se está enviando o clasificando (hasta unos 3 s en
 *   el servidor, más la subida).
 * - `lista`: llegó la respuesta; `sugerencia` es `null` si no hay. Un fallo de
 *   red, un 5xx o la espera agotada también terminan aquí, sin sugerencia: la
 *   IA nunca bloquea un reporte.
 * - `foto-rechazada`: el servidor dijo que la foto no es una imagen válida
 *   (409). Crear el reporte con ella fallaría igual, así que se avisa junto a
 *   la foto.
 */
export type EstadoDeSugerencia =
  | { estado: 'inactiva' }
  | { estado: 'analizando' }
  | { estado: 'lista'; sugerencia: SugerenciaDeCategoria | null }
  | { estado: 'foto-rechazada'; mensaje: string };

/**
 * Cuánto se espera la vista previa antes de darla por perdida (subida de la
 * foto incluida). El servidor corta la inferencia a los 3 s, pero en una red
 * móvil lenta la subida de una foto de varios MB puede tardar más. Pasado
 * este tiempo se cancela y queda «sin sugerencia»: nada espera por ella, solo
 * evita un «Analizando…» que no termina.
 */
export const ESPERA_MAXIMA_DE_SUGERENCIA_MS = 20_000;

/**
 * La sugerencia de la respuesta, o `null` si no hay. Exige los dos campos:
 * el contrato los manda nulos a la vez, y con uno solo no hay qué proponer.
 */
export function sugerenciaDeRespuesta(
  respuesta: Partial<ClasificacionResponse> | null | undefined,
): SugerenciaDeCategoria | null {
  const id = respuesta?.categoriaId;
  const nombre = respuesta?.categoriaNombre?.trim();
  if (typeof id !== 'number' || !Number.isFinite(id) || !nombre) return null;
  return { categoriaId: id, categoriaNombre: nombre };
}

/** Lo que el formulario muestra junto al selector de categoría. */
export type VistaDeSugerencia =
  | { tipo: 'oculta' }
  | { tipo: 'analizando' }
  | { tipo: 'sin-sugerencia' }
  | {
      tipo: 'sugerida';
      categoriaId: number;
      /** El nombre como figura en el selector (o el de la respuesta, si aún carga). */
      nombre: string;
      /** `true` si el ciudadano ya tiene elegida esa categoría. */
      yaElegida: boolean;
      /**
       * `true` si está en el catálogo cargado y se puede elegir con un toque.
       * Mientras el catálogo recarga (cambió el distrito) es `false`: el texto
       * no cambia, solo se oculta el botón, para no volver a anunciarlo.
       */
      seleccionable: boolean;
    };

/**
 * Qué mostrar según el estado de la vista previa, el catálogo que tiene el
 * formulario y la categoría que eligió el ciudadano (`null` si ninguna).
 *
 * - Una sugerencia que no está en el catálogo cargado se ignora (desfase de
 *   caché, handoff): cuenta como «sin sugerencia». Con el catálogo vacío (está
 *   cargando) todavía no se sabe, y se sigue mostrando.
 * - La foto rechazada no se muestra aquí: su aviso va junto a la foto.
 */
export function vistaDeSugerencia(
  vistaPrevia: EstadoDeSugerencia,
  catalogo: readonly { id: number; nombre: string }[],
  categoriaElegida: number | null,
): VistaDeSugerencia {
  switch (vistaPrevia.estado) {
    case 'inactiva':
    case 'foto-rechazada':
      return { tipo: 'oculta' };
    case 'analizando':
      return { tipo: 'analizando' };
    case 'lista': {
      const { sugerencia } = vistaPrevia;
      if (!sugerencia) return { tipo: 'sin-sugerencia' };
      const enCatalogo = catalogo.find((c) => c.id === sugerencia.categoriaId);
      if (!enCatalogo && catalogo.length > 0) return { tipo: 'sin-sugerencia' };
      return {
        tipo: 'sugerida',
        categoriaId: sugerencia.categoriaId,
        nombre: enCatalogo?.nombre ?? sugerencia.categoriaNombre,
        yaElegida: categoriaElegida === sugerencia.categoriaId,
        seleccionable: enCatalogo !== undefined,
      };
    }
  }
}

/**
 * Aviso para la foto que el servidor rechazó (409 de formato o de
 * megapíxeles): su motivo y qué hacer. El backend manda el motivo sin punto
 * final («Formato de foto no permitido (usa JPG, PNG o WEBP)»).
 */
export function avisoDeFotoRechazada(motivo: string): string {
  const limpio = motivo.trim().replace(/[.\s]+$/, '');
  const base = limpio || 'La foto no es una imagen válida';
  return `${base}. Elige otra foto o quítala: con esta, el reporte no se podrá enviar.`;
}
