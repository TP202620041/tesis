import { describe, expect, it, vi } from 'vitest';
import {
  borrarToken,
  borrarTokenSi,
  leerToken,
  generacionDeSesion,
  guardarToken,
  suscribirCambiosDeSesion,
} from './token-storage';

describe('generacion de sesion', () => {
  it('sube al guardar y al borrar el token, y avisa a los suscriptores', () => {
    const alCambiar = vi.fn();
    const desuscribir = suscribirCambiosDeSesion(alCambiar);
    const inicial = generacionDeSesion();

    guardarToken('t1');
    borrarToken();
    desuscribir();
    guardarToken('t2');

    expect(generacionDeSesion()).toBe(inicial + 3);
    expect(alCambiar).toHaveBeenCalledTimes(2);
    borrarToken();
  });

  it('borrarTokenSi solo borra si la sesion es la de esa generacion', () => {
    guardarToken('vieja');
    const deLaVieja = generacionDeSesion();
    guardarToken('nueva');

    expect(borrarTokenSi(deLaVieja)).toBe(false);
    expect(leerToken()).toBe('nueva');
    expect(borrarTokenSi(generacionDeSesion())).toBe(true);
    expect(leerToken()).toBeNull();
  });

  it('un cambio del token en otra pestaña (evento storage) tambien cuenta', () => {
    const inicial = generacionDeSesion();

    window.dispatchEvent(new StorageEvent('storage', { key: 'viasegura.token' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'otra-clave' }));

    expect(generacionDeSesion()).toBe(inicial + 1);
  });
});
