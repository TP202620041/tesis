'use client';

import { useCallback, useLayoutEffect, useSyncExternalStore } from 'react';
import {
  APARIENCIA_POR_DEFECTO,
  aparienciaGuardada,
  CLAVE_APARIENCIA,
  temaDe,
  type Apariencia,
} from '../model/apariencia';

/*
 * US-23: la apariencia elegida en este dispositivo. `localStorage` siempre
 * con try/catch: en modo privado estricto o con el almacenamiento bloqueado
 * puede lanzar, y entonces la elección vale en memoria mientras dure la
 * pestaña.
 */

const oyentes = new Set<() => void>();
/** La elección hecha en esta pestaña cuando `localStorage` no la pudo guardar. */
let enMemoria: Apariencia | null = null;

function avisar() {
  for (const oyente of oyentes) oyente();
}

function alCambiarEnOtraPestana(evento: StorageEvent) {
  if (evento.key !== CLAVE_APARIENCIA && evento.key !== null) return;
  enMemoria = null;
  avisar();
}

function suscribir(alCambiar: () => void): () => void {
  if (oyentes.size === 0) window.addEventListener('storage', alCambiarEnOtraPestana);
  oyentes.add(alCambiar);
  return () => {
    oyentes.delete(alCambiar);
    if (oyentes.size === 0) window.removeEventListener('storage', alCambiarEnOtraPestana);
  };
}

function leer(): Apariencia {
  if (enMemoria) return enMemoria;
  try {
    return aparienciaGuardada(window.localStorage.getItem(CLAVE_APARIENCIA));
  } catch {
    return APARIENCIA_POR_DEFECTO;
  }
}

function guardar(apariencia: Apariencia): void {
  try {
    window.localStorage.setItem(CLAVE_APARIENCIA, apariencia);
    enMemoria = null;
  } catch {
    enMemoria = apariencia;
  }
  avisar();
}

function consulta(medio: string): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(medio) : null;
}

const OSCURO = '(prefers-color-scheme: dark)';
const MAS_CONTRASTE = '(prefers-contrast: more)';

/** Fija `data-theme` en `<html>` según la apariencia y lo que pide el sistema. */
function aplicar(apariencia: Apariencia): void {
  const tema = temaDe(apariencia, {
    oscuro: consulta(OSCURO)?.matches ?? false,
    masContraste: consulta(MAS_CONTRASTE)?.matches ?? false,
  });
  document.documentElement.setAttribute('data-theme', tema);
}

/**
 * La apariencia de este dispositivo y cómo cambiarla. En el servidor (y al
 * hidratar) es «Sistema»: lo guardado solo existe en el navegador, y lo que
 * dibuje la hidratación debe coincidir con el HTML del servidor.
 */
export function useApariencia(): { apariencia: Apariencia; elegir: (apariencia: Apariencia) => void } {
  const apariencia = useSyncExternalStore(suscribir, leer, () => APARIENCIA_POR_DEFECTO);
  const elegir = useCallback((nueva: Apariencia) => {
    guardar(nueva);
    aplicar(nueva);
  }, []);
  return { apariencia, elegir };
}

/**
 * Mantiene `data-theme` al día mientras la app está abierta: lo vuelve a
 * fijar al montar (en desarrollo, el doble montaje de React borra los
 * atributos de `<html>` que puso `public/tema.js`), al elegir en otra
 * pestaña y, con «Sistema», cuando el sistema cambia de modo. Lo usa el marco
 * de la app, que está en todas las pantallas.
 */
export function useTemaDeLaApp(): void {
  const { apariencia } = useApariencia();
  useLayoutEffect(() => {
    // Se lee lo guardado y no `apariencia`: al hidratar, `apariencia` todavía
    // es el valor del servidor («Sistema») y aplicarlo pisaría por un cuadro
    // el tema que `tema.js` ya había puesto. `apariencia` queda como
    // dependencia para volver a aplicar cuando cambie.
    const actual = leer();
    aplicar(actual);
    if (actual !== 'sistema') return;
    const consultas = [consulta(OSCURO), consulta(MAS_CONTRASTE)].filter((c): c is MediaQueryList => c !== null);
    const alCambiar = () => aplicar('sistema');
    for (const c of consultas) c.addEventListener('change', alCambiar);
    return () => {
      for (const c of consultas) c.removeEventListener('change', alCambiar);
    };
  }, [apariencia]);
}
