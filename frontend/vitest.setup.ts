import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Desmonta lo renderizado despues de cada test.
 *
 * Testing Library solo registra esta limpieza sola cuando Vitest corre con
 * `globals: true`. Aqui se usan imports explicitos, asi que hay que hacerlo
 * a mano: sin esto los renders se acumulan en el mismo documento y las
 * consultas empiezan a encontrar elementos duplicados de tests anteriores.
 */
afterEach(cleanup);
