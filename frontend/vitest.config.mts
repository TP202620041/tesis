import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Tests de frontend.
 *
 * ALCANCE DELIBERADO: logica pura y componentes sin mapa. No se testea
 * Leaflet en jsdom — jsdom no implementa layout ni canvas, asi que un test
 * de mapa terminaria verificando un mock de react-leaflet en vez del
 * comportamiento real, con mucho andamiaje y poca garantia. El mapa se
 * verifica en el navegador; lo que si se testea aqui es todo lo que decide
 * QUE se le pide al backend y COMO se representa cada estado, que es donde
 * viven los errores reales.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // El pool `forks` (por defecto) no logra arrancar sus workers en este
    // entorno Windows: fallan con "Timeout waiting for worker to respond"
    // antes de ejecutar un solo test. Con `threads` corre sin problemas.
    pool: 'threads',
    // Un worker por vez. Con `threads` en paralelo el mismo timeout de
    // arranque reaparecia de forma intermitente cuando la maquina estaba
    // cargada (p.ej. con el backend corriendo al lado), dejando la suite en
    // "no tests" sin ejecutar nada — un falso verde peligroso si no se mira
    // la salida. La suite completa tarda ~2 s, asi que serializarla no
    // cuesta nada y elimina la intermitencia.
    fileParallelism: false,
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
});
