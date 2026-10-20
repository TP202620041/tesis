import { describe, expect, it } from 'vitest';
import {
  antesDeCerrarSesion,
  hayPasosAntesDeCerrarSesion,
  registrarAntesDeCerrarSesion,
} from './antesDeCerrarSesion';

describe('antesDeCerrarSesion', () => {
  it('espera a cada guarda registrada y deja de llamarla al quitarla', async () => {
    const orden: string[] = [];
    const quitarA = registrarAntesDeCerrarSesion(async () => {
      orden.push('a');
    });
    const quitarB = registrarAntesDeCerrarSesion(() => Promise.reject(new Error('falla')));
    const quitarC = registrarAntesDeCerrarSesion(async () => {
      orden.push('c');
    });
    expect(hayPasosAntesDeCerrarSesion()).toBe(true);

    await antesDeCerrarSesion();
    expect(orden).toEqual(['a', 'c']);

    quitarA();
    quitarB();
    quitarC();
    expect(hayPasosAntesDeCerrarSesion()).toBe(false);
    await antesDeCerrarSesion();
    expect(orden).toEqual(['a', 'c']);
  });

  it('si una guarda nunca responde, cierra igual al llegar al tope', async () => {
    const quitar = registrarAntesDeCerrarSesion(() => new Promise<void>(() => {}));

    await expect(antesDeCerrarSesion(20)).resolves.toBeUndefined();
    quitar();
  });
});
