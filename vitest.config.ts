import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Configuração vitest — projecto `unit` (GestPro ERP)
 *
 * Cobre todos os testes unitários e de integração legados em src/**‌/*.test.ts.
 * Os testes que precisam de DB partilhada usam describe.skipIf(!hasDB) e saltam
 * automaticamente quando DATABASE_URL não está definido.
 *
 * Para testes de integração com DB efémera (Testcontainers), usar:
 *   pnpm test:integration  →  vitest run --config vitest.integration.config.ts
 *
 * Cobertura:
 *   pnpm test:unit:coverage  →  falha o job se os limiares não forem atingidos.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Sem paralelismo entre ficheiros — alguns testes de integração legados
    // partilham a mesma DB e poderiam colidir se corressem em paralelo.
    fileParallelism: false,

    // Cobertura: foca em código de servidor e utilitários.
    // Os limiares falham o job de CI se a cobertura descer abaixo dos valores.
    // Aumentar progressivamente conforme a cobertura sobe (spec 15, task 2.3).
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/server/**/*.ts', 'src/lib/**/*.ts', 'src/hooks/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.d.ts',
        'src/**/__tests__/**',
        'node_modules/**',
      ],
      thresholds: {
        // Limiares conservadores — aumentar progressivamente.
        // Falham o job se a cobertura descer abaixo destes valores.
        lines: 60,
        functions: 55,
        branches: 45,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve('./src'),
      // `server-only` rebenta ao ser importado fora do contexto react-server.
      'server-only': path.resolve('./test/server-only-stub.ts'),
    },
  },
});
