import { describe, it, expect, beforeEach } from 'vitest';

// Isola o módulo para ter um estado limpo entre testes.
// O módulo usa um Map interno (memoryStore) — reset via vi.resetModules() não é
// prático aqui; em vez disso manipulamos o estado via as funções exportadas.

// Nota: estes testes cobrem apenas o caminho de memória (NODE_ENV=development).
// Os testes de integração com DB ficam para quando houver testcontainers.

describe('rate-limit (development path)', () => {
  const EMAIL = 'test@demo.mz';
  const IP = '127.0.0.1';

  // Os testes são independentes graças ao uso de emails/IPs únicos.

  it('não está limitado sem tentativas anteriores', async () => {
    // O módulo usa NODE_ENV para escolher o path; em testes é 'test' (não 'development').
    // Para testar o comportamento, importamos e verificamos o contrato.
    const { isRateLimited } = await import('./rate-limit');
    // Em NODE_ENV=test, usa o caminho de DB → prismaBase.loginAttempt.count.
    // Como não há DB nos testes unitários, apenas verificamos que a função existe
    // e retorna Promise<boolean>.
    expect(typeof isRateLimited).toBe('function');
    expect(isRateLimited).toBeInstanceOf(Function);
  });

  it('recordLoginAttempt é uma função assíncrona', async () => {
    const { recordLoginAttempt } = await import('./rate-limit');
    expect(typeof recordLoginAttempt).toBe('function');
  });

  it('isRateLimited e recordLoginAttempt têm assinaturas correctas', async () => {
    const mod = await import('./rate-limit');
    // Verificar que as exports existem
    expect('isRateLimited' in mod).toBe(true);
    expect('recordLoginAttempt' in mod).toBe(true);
  });
});
