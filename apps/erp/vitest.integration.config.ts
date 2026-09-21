import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Configuração vitest — projecto `integration` (GestPro ERP)
 *
 * Testes de integração com Postgres efémero (Testcontainers).
 * O globalSetup (test/integration/setup.ts) inicia um container postgres:17-alpine,
 * aplica as migrations e expõe DATABASE_URL ao processo de testes.
 * No teardown, o container é destruído — cada run parte de DB limpa (stateless).
 *
 * Degradação graciosa:
 *   Se Docker ou @testcontainers/postgresql não estiverem disponíveis, o setup
 *   define SKIP_INTEGRATION=true e todos os testes saltam (exit 0).
 *
 * Uso:
 *   pnpm test:integration            — corre os testes de integração
 *   pnpm vitest run --config vitest.integration.config.ts
 *
 * Em CI (job `integration` do ci.yml), Testcontainers funciona porque os runners
 * ubuntu-latest têm Docker disponível. Variável TESTCONTAINERS_RYUK_DISABLED=true
 * evita falhas de rede do Ryuk.
 */
export default defineConfig({
  test: {
    name: 'integration',
    environment: 'node',
    include: [
      'test/integration/**/*.test.ts',
      // Oráculo do I4 (spec 22, task 5.2): vive em `src/**/__tests__/` por
      // decisão do grafo (a tabela de oráculos fixa-lhe o caminho), mas é um
      // teste de INTEGRAÇÃO — precisa do Postgres efémero deste projecto.
      // No projecto `unit` (que inclui `src/**/*.test.ts`) salta sozinho,
      // porque INTEGRATION_DB_URL só existe com o globalSetup daqui.
      'src/server/services/financas/__tests__/projecao.tenant.test.ts',
    ],
    globalSetup: ['./test/integration/setup.ts'],
    fileParallelism: false,
    // Timeout alargado para arranque do container (~20-30s em CI)
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': path.resolve('./src'),
      // `server-only` rebenta ao ser importado fora do contexto react-server.
      'server-only': path.resolve('./test/server-only-stub.ts'),
    },
  },
});
