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
        // Baseline medida em 2026-07-20 (src/server + src/lib + src/hooks):
        //   lines 21.2% · statements 20.5% · branches 15.8% · functions 16.2%
        // Valores abaixo da baseline para que o job passe e suba gradualmente.
        // DEVE subir ~5pp por trimestre à medida que se adicionam testes.
        lines: 18,
        functions: 14,
        branches: 13,
        statements: 18,
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
