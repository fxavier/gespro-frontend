import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` só existe para o bundler do Next barrar imports no
      // cliente; em vitest (node) resolve para um módulo vazio.
      "server-only": path.resolve(__dirname, "./test/server-only-stub.ts"),
    },
  },
});
