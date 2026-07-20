/**
 * globalSetup para o projecto `integration` do vitest.
 *
 * Inicia um container Postgres 17 efémero (Testcontainers) e aplica as migrations
 * de Prisma. O DATABASE_URL fica disponível para todos os workers do projecto.
 *
 * Comportamento por ambiente:
 *   - CI=true  → qualquer falha (módulo ausente, Docker, migration) é relançada,
 *                fazendo o job falhar explicitamente. Nunca mascara erros em CI.
 *   - Local     → degrada graciosamente: define SKIP_INTEGRATION=true e os testes
 *                saltam, permitindo que `pnpm check` passe sem Docker/deps instaladas.
 *
 * Deps necessárias (devDependencies):
 *   pnpm add -D testcontainers @testcontainers/postgresql
 */

import { execSync } from 'node:child_process';

const IS_CI = Boolean(process.env.CI);

// Referência ao container para teardown (tipado como any — carregado dinamicamente).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _container: any = null;

export async function setup(): Promise<void> {
  if (process.env.SKIP_INTEGRATION === 'true') {
    return;
  }

  // ── 1. Importar @testcontainers/postgresql ──────────────────────────────────
  // Importação dinâmica com nome de variável: TypeScript trata `import(string)`
  // como Promise<any>, evitando resolução estática e erros de tsc quando o
  // pacote ainda não está instalado.
  const moduleName: string = '@testcontainers/postgresql';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let PostgreSqlContainer: any;
  try {
    const tc = await import(moduleName);
    PostgreSqlContainer = tc.PostgreSqlContainer;
  } catch (importErr: unknown) {
    if (IS_CI) {
      // Em CI o pacote DEVE estar instalado — qualquer erro é um blocker real.
      throw importErr;
    }
    const msg = importErr instanceof Error ? importErr.message : String(importErr);
    const isNotFound =
      (importErr as NodeJS.ErrnoException)?.code === 'ERR_MODULE_NOT_FOUND' ||
      msg.includes('Cannot find package') ||
      msg.includes('Cannot find module');
    if (isNotFound) {
      console.warn(
        '[integration] @testcontainers/postgresql não instalado.\n' +
          '  Instala com: pnpm add -D testcontainers @testcontainers/postgresql\n' +
          '  Também é necessário Docker em execução.\n' +
          '  Testes de integração saltados (local only).',
      );
    } else {
      console.warn(`[integration] Falha ao importar Testcontainers: ${msg} — testes saltados.`);
    }
    process.env.SKIP_INTEGRATION = 'true';
    return;
  }

  // ── 2. Arrancar o container Postgres ────────────────────────────────────────
  try {
    const container = await new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase('gespro_test')
      .withUsername('gespro_test')
      .withPassword('gespro_test')
      .start();

    _container = container;

    const connectionUri: string = container.getConnectionUri();
    process.env.DATABASE_URL = connectionUri;
    process.env.DIRECT_URL = connectionUri;
    process.env.INTEGRATION_DB_URL = connectionUri;

    const safeUrl = connectionUri.replace(/:([^:@]+)@/, ':***@');
    console.info(`[integration] Container Postgres pronto: ${safeUrl}`);
  } catch (dockerErr: unknown) {
    if (IS_CI) {
      // Em CI o Docker está sempre disponível — erro é um blocker real.
      throw dockerErr;
    }
    const msg = dockerErr instanceof Error ? dockerErr.message : String(dockerErr);
    console.warn(
      `[integration] Docker não disponível ou container falhou: ${msg}\n` +
        '  Testes de integração saltados (local only).',
    );
    process.env.SKIP_INTEGRATION = 'true';
    return;
  }

  // ── 3. Aplicar migrations ao container efémero ──────────────────────────────
  // Separado do catch de Docker: uma migration quebrada é um blocker em qualquer
  // ambiente (local ou CI) — não deve ser silenciada como "Docker indisponível".
  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: process.env.INTEGRATION_DB_URL },
    stdio: 'inherit',
  });
}

export async function teardown(): Promise<void> {
  if (_container) {
    try {
      await _container.stop();
      console.info('[integration] Container Postgres parado.');
    } catch {
      // Ignorar erros de teardown — o runner CI destrói a VM de qualquer forma
    } finally {
      _container = null;
    }
  }
}
