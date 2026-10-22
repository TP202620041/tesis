import { describe, expect, it } from 'vitest';
import { idDeRuta } from './idDeRuta';

describe('idDeRuta (QA-1 M-11)', () => {
  it('acepta enteros positivos', () => {
    expect(idDeRuta('1')).toBe(1);
    expect(idDeRuta('186')).toBe(186);
  });

  it('rechaza lo que no es un id, sin llegar al API', () => {
    for (const texto of ['abc', '', '0', '-3', '7.0', '1.5', ' 7', '7 ', '0x7', '1e3', '007', 'NaN']) {
      expect(idDeRuta(texto)).toBeNull();
    }
    expect(idDeRuta(null)).toBeNull();
    expect(idDeRuta(undefined)).toBeNull();
  });

  it('rechaza ids fuera de lo que un number representa exacto', () => {
    expect(idDeRuta('9007199254740993')).toBeNull();
  });
});
