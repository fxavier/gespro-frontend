import { describe, expect, it } from 'vitest';
import { destinoSeguro } from '../destino-seguro';

/**
 * #551 — redireccionamento aberto no login. O `callbackUrl` vem da query
 * string; só um caminho relativo da mesma origem pode sair daqui.
 */
describe('destinoSeguro (#551)', () => {
  const ORIGEM = 'https://erp.exemplo.mz';

  it.each([
    ['https://exemplo.invalid'],
    ['//exemplo.invalid'],
    ['/\\exemplo.invalid'],
    ['\\\\exemplo.invalid'],
    ['javascript:alert(1)'],
    ['/%2F%2Fexemplo.invalid'],
    ['  /faturacao'],
    ['/\t/exemplo.invalid'],
    // Pontos que o parser resolve para pathname `//exemplo.invalid` (revisão G5).
    ['/.//exemplo.invalid'],
    ['/..//exemplo.invalid'],
    ['/./\\exemplo.invalid'],
    ['/%2e%2e//exemplo.invalid'],
    [''],
    [null],
    [undefined],
  ])('recusa %j e devolve /dashboard', (cb) => {
    expect(destinoSeguro(cb, ORIGEM)).toBe('/dashboard');
  });

  // `100%` não é descodificável: não é motivo para recusar um caminho legítimo.
  it.each([['/faturacao'], ['/faturacao?x=1#y'], ['/dashboard'], ['/faturacao?q=100%']])('aceita %j tal como vem', (cb) => {
    expect(destinoSeguro(cb, ORIGEM)).toBe(cb);
  });

  it('funciona sem origem explícita (servidor, sem window)', () => {
    expect(destinoSeguro('/faturacao')).toBe('/faturacao');
    expect(destinoSeguro('//exemplo.invalid')).toBe('/dashboard');
  });
});
