import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
// Reglas de capas (ARCHITECTURE.md, seccion 5.4). Van al final: en flat
// config, el ultimo bloque que configura una regla para un archivo gana.
import { reglasDeCapas } from "./eslint.capas.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Artefactos generados: no se editan a mano, asi que lintarlos solo
    // produce ruido. `sw.js` lo emite `npm run pwa:build` (Serwist) y
    // `schema.ts` lo emite `npm run api:types` (openapi-typescript).
    "public/sw.js",
    "src/lib/api/generated/**",
  ]),
  ...reglasDeCapas,
]);

export default eslintConfig;
