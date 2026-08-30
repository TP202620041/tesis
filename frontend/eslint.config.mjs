import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
]);

export default eslintConfig;
