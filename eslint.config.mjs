import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import globals from "globals";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // The Figma plugin is plain browser JS that runs inside Figma.
  {
    files: ["figma-plugin/code.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser, figma: "readonly", __html__: "readonly" },
    },
  },
  // Node scripts.
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  // Turns off style rules that Prettier handles.
  prettier,
  globalIgnores([".next/**", "node_modules/**", "out/**", "next-env.d.ts", "figma-plugin/ui.html"]),
]);
