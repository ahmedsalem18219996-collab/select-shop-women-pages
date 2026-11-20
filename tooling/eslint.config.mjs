import js from "@eslint/js";
import globals from "globals";

// Lints the landing-page runtime and this tooling only; the legacy storefront scripts are out of scope.
export default [
  { ignores: ["**/node_modules/**", "tooling/.lighthouseci/**", "tooling/playwright-report/**", "tooling/test-results/**"] },
  { files: ["lp/runtime.js", "lp/related.js", "lp/motion.js", "tooling/**/*.mjs"], ...js.configs.recommended },
  { files: ["lp/runtime.js", "lp/related.js", "lp/motion.js"], languageOptions: { sourceType: "module", globals: globals.browser } },
  { files: ["tooling/**/*.mjs"], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
];
