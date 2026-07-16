import next from "eslint-config-next";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Regra local: ficheiros 'use server' devem usar createSafeAction.
const useServerNeedsSafeAction = require("./eslint-rules/use-server-needs-safe-action.js");

// Next 16 removeu `next lint`; usamos o flat config nativo do eslint-config-next
// (o antigo FlatCompat + @eslint/eslintrc rebentava com eslint 9).
const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "prisma/migrations/**", "scripts/**"] },
  ...next,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "react/no-unescaped-entities": "off",
      "prefer-const": "off",
      "@typescript-eslint/no-explicit-any": "off",
      // Regras novas do React Compiler (eslint-config-next 16) que as 195 páginas
      // pré-existentes ainda violam (~140x). Ficam como aviso até serem levadas a
      // zero nas waves de UI — ver docs/status.md. Ver ADR-0001.
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/set-state-in-effect": "warn",
      // Dispara no padrão SC fetch-em-try/catch + render. O padrão correcto
      // (error.tsx em vez de try/catch) fica como limpeza da Wave UI-2.
      "react-hooks/error-boundaries": "warn",
    },
  },
  // Regra de arquitectura: 'use server' → createSafeAction obrigatório.
  // Aplicada apenas a ficheiros de actions (não a route handlers).
  {
    files: ["src/**/*.actions.ts", "src/**/*.actions.tsx"],
    plugins: {
      local: { rules: { "use-server-needs-safe-action": useServerNeedsSafeAction } },
    },
    rules: {
      "local/use-server-needs-safe-action": "error",
    },
  },
];

export default eslintConfig;
