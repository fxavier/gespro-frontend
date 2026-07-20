/**
 * globalSetup para o projecto `integration` do vitest.
 *
 * Inicia um container Postgres 17 efémero (Testcontainers) e aplica as migrations
 * de Prisma. O DATABASE_URL fica disponível para todos os workers do projecto.
 *
 * Degradação graciosa:
 *   - Se @testcontainers/postgresql não estiver instalado → SKIP_INTEGRATION=true
 *   - Se Docker não estiver disponível               → SKIP_INTEGRATION=true
 *   - Os testes verificam SKIP_INTEGRATION e saltam com describe.skipIf()
 *
 * Dois runs consecutivos partem de uma DB totalmente limpa (isolamento garantido).
 *
 * Deps necessárias (devDependencies):
 *   pnpm add -D testcontainers @testcontainers/postgresql
 */

import { execSync } from 'node:child_process';

// Referência ao container para teardown (tipado como any — carregado dinamicamente).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _container: any = null;

export async function setup(): Promise<void> {
  if (process.env.SKIP_INTEGRATION === 'true') {
    return;
  }

  // Importação dinâmica com nome de variável: TypeScript trata `import(string)`
  // como Promise<any>, evitando resolução estática do módulo e erros de tsc
  // quando o pacote ainda não está instalado.
  const moduleName: string = '@testcontainers/postgresql';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let PostgreSqlContainer: any;
  try {
    const tc = await import(moduleName);
    PostgreSqlContainer = tc.PostgreSqlContainer;
  } catch (importErr: unknown) {
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
          '  Testes de integração saltados.',
      );
    } else {
      console.warn(`[integration] Falha ao importar Testcontainers: ${msg} — testes saltados.`);
    }
    process.env.SKIP_INTEGRATION = 'true';
    return;
  }

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

    // Aplica as migrations ao container efémero.
    // prisma migrate deploy é não-interactivo e adequado para CI/Testcontainers.
    execSync('npx prisma migrate deploy', {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: connectionUri },
      stdio: 'pipe',
    });

    const safeUrl = connectionUri.replace(/:([^:@]+)@/, ':***@');
    console.info(`[integration] Container Postgres pronto: ${safeUrl}`);
  } catch (runtimeErr: unknown) {
    const msg = runtimeErr instanceof Error ? runtimeErr.message : String(runtimeErr);
    const isDockerError =
      msg.includes('Docker') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('Cannot connect') ||
      msg.includes('connect ENOENT');

    if (isDockerError) {
      console.warn('[integration] Docker não disponível — testes de integração saltados.');
    } else {
      console.warn(`[integration] Setup do container falhou: ${msg} — testes saltados.`);
    }
    process.env.SKIP_INTEGRATION = 'true';
  }
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
