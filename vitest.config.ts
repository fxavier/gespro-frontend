import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Testes de integração tocam a DB partilhada — sem paralelismo entre ficheiros
    // para evitar colisões (isolamento por tenant único cobre o resto).
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve('./src'),
      // `server-only` rebenta ao ser importado fora do contexto react-server.
      'server-only': path.resolve('./test/server-only-stub.ts'),
    },
  },
});
