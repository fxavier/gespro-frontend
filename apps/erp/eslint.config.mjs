import base from "@gespro/eslint-config";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Regra local: ficheiros 'use server' devem usar createSafeAction.
const useServerNeedsSafeAction = require("./eslint-rules/use-server-needs-safe-action.js");

// Base partilhada em packages/eslint-config (flat config nativo do eslint-config-next).
const eslintConfig = [
  ...base,
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
