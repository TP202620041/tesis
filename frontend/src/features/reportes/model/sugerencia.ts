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
import type { EstadoDelCatalogo } from './tipos';

/**
 * Se ve junto a la ayuda de la foto ANTES de elegirla: la foto sale hacia el
 * servidor apenas se elige, así que el ciudadano lo sabe de antemano y no
 * solo por el «Analizando…» posterior.
 */
export const AVISO_DE_ANALISIS_DE_FOTO =
  'Al elegirla, la analizamos automáticamente para sugerirte el tipo de daño. La decisión es tuya.';

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
 * - `foto-no-permitida` (NC-10c): la moderación rechazó la foto
 *   (`fotoRechazada: true`). No hay sugerencia; el formulario quita la foto
 *   y avisa junto a ella.
 */
export type EstadoDeSugerencia =
  | { estado: 'inactiva' }
  | { estado: 'analizando' }
  | { estado: 'lista'; sugerencia: SugerenciaDeCategoria | null }
  | { estado: 'foto-rechazada'; mensaje: string }
  | { estado: 'foto-no-permitida' };

/**
 * Lo que dice la vista previa de una foto (NC-10c): la moderación la
 * rechazó, o la sugerencia (`null` si no hay). Con la foto rechazada la
 * respuesta no trae categoría, y si la trajera no se mostraría.
 */
export type ClasificacionDeLaFoto =
  | { fotoNoPermitida: true }
  | { fotoNoPermitida: false; sugerencia: SugerenciaDeCategoria | null };

/**
 * Lee la respuesta de `POST /api/clasificaciones`. Solo `fotoRechazada:
 * true` cuenta como rechazo: `false`, o un campo ausente (un backend anterior
 * a NC-10b), siguen como hasta ahora. Con `false` la vista previa no bloquea
 * nada aunque la moderación no se haya podido hacer: el veredicto oficial es
 * el de la creación.
 */
export function clasificacionDeRespuesta(
  respuesta: Partial<ClasificacionResponse> | null | undefined,
): ClasificacionDeLaFoto {
  if (respuesta?.fotoRechazada === true) return { fotoNoPermitida: true };
  return { fotoNoPermitida: false, sugerencia: sugerenciaDeRespuesta(respuesta) };
}

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

/** El catálogo de categorías que tiene el formulario, con su estado de carga. */
export interface CatalogoDelFormulario {
  categorias: readonly { id: number; nombre: string }[];
  estado: EstadoDelCatalogo;
}

/**
 * Qué mostrar según el estado de la vista previa, el catálogo que tiene el
 * formulario y la categoría que eligió el ciudadano (`null` si ninguna).
 *
 * - Una sugerencia que no está en el catálogo cargado se ignora (desfase de
 *   caché, handoff): cuenta como «sin sugerencia».
 * - Mientras el catálogo carga todavía no se sabe, y se sigue mostrando (sin
 *   el botón). Si no se pudo traer, no hay contra qué validarla ni cómo
 *   elegirla: «sin sugerencia», en vez de proponer algo que no se puede tocar.
 * - La foto rechazada (409) o no permitida (NC-10c) no se muestra aquí: su
 *   aviso va junto a la foto.
 */
export function vistaDeSugerencia(
  vistaPrevia: EstadoDeSugerencia,
  catalogo: CatalogoDelFormulario,
  categoriaElegida: number | null,
): VistaDeSugerencia {
  switch (vistaPrevia.estado) {
    case 'inactiva':
    case 'foto-rechazada':
    case 'foto-no-permitida':
      return { tipo: 'oculta' };
    case 'analizando':
      return { tipo: 'analizando' };
    case 'lista': {
      const { sugerencia } = vistaPrevia;
      if (!sugerencia) return { tipo: 'sin-sugerencia' };
      const enCatalogo = catalogo.categorias.find((c) => c.id === sugerencia.categoriaId);
      if (!enCatalogo && catalogo.estado !== 'cargando') return { tipo: 'sin-sugerencia' };
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
