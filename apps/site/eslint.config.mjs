import base from "@gespro/eslint-config";

// Base partilhada em packages/eslint-config. O site não herda as regras de
// arquitectura do ERP (sem Server Actions com createSafeAction, sem gates de
// modais) — são bibliotecas de UI distintas, só a marca é partilhada.
const eslintConfig = [
  ...base,
  {
    ignores: [".next/**", "node_modules/**", "content/**", "e2e/**"],
  },
];

export default eslintConfig;
