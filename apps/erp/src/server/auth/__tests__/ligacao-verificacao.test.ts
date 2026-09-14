/**
 * Testes da ligação assinada de verificação de e-mail (ADR-0031 §5).
 *
 * É o único sítio do produto onde um segredo nosso decide se uma escrita no
 * Keycloak acontece — a assinatura e o prazo são o mecanismo inteiro, porque
 * não há tabela nem consumo atómico a servir de segunda linha.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  assinarTokenVerificacao,
  validarTokenVerificacao,
  urlVerificacao,
  baseAplicacao,
  PRAZO_VERIFICACAO_SEGUNDOS,
} from '../ligacao-verificacao';

const SUB = '11111111-1111-4111-8111-111111111111';
const EMAIL = 'ana@padaria.mz';
const AGORA = 1_780_000_000;

beforeEach(() => {
  process.env.EMAIL_VERIFY_SECRET = 'segredo-de-teste-distinto-do-auth';
});

afterEach(() => {
  delete process.env.EMAIL_VERIFY_SECRET;
  delete process.env.APP_URL;
});

describe('assinar e validar', () => {
  it('uma ligação acabada de assinar é válida e devolve sub e e-mail', () => {
    const t = assinarTokenVerificacao(SUB, EMAIL, AGORA);
    expect(validarTokenVerificacao(t, AGORA)).toEqual({ ok: true, sub: SUB, email: EMAIL });
  });

  it('a segunda visita é igual à primeira — a validação não consome nada', () => {
    const t = assinarTokenVerificacao(SUB, EMAIL, AGORA);
    const primeira = validarTokenVerificacao(t, AGORA);
    const segunda = validarTokenVerificacao(t, AGORA + 60);
    expect(primeira).toEqual(segunda);
  });

  it('o prazo é de 24 horas: válida ao segundo anterior, expirada no segundo do fim', () => {
    const t = assinarTokenVerificacao(SUB, EMAIL, AGORA);
    expect(validarTokenVerificacao(t, AGORA + PRAZO_VERIFICACAO_SEGUNDOS - 1).ok).toBe(true);
    expect(validarTokenVerificacao(t, AGORA + PRAZO_VERIFICACAO_SEGUNDOS)).toEqual({
      ok: false,
      motivo: 'expirada',
    });
  });
});

describe('recusas', () => {
  it('carga adulterada (outro sub) não passa — a assinatura é sobre a carga', () => {
    const t = assinarTokenVerificacao(SUB, EMAIL, AGORA);
    const assinatura = t.slice(t.lastIndexOf('.') + 1);
    const outraCarga = Buffer.from(
      JSON.stringify({ sub: 'outro-sub', email: EMAIL, exp: AGORA + 3600 }),
      'utf8',
    ).toString('base64url');
    expect(validarTokenVerificacao(`${outraCarga}.${assinatura}`, AGORA)).toEqual({
      ok: false,
      motivo: 'assinatura',
    });
  });

  it('um `exp` forjado é recusado por assinatura, não aceite por prazo', () => {
    // Ordem das verificações: se o prazo fosse lido antes da assinatura, uma
    // carga com `exp` no ano 3000 decidia a resposta sozinha.
    const carga = Buffer.from(
      JSON.stringify({ sub: SUB, email: EMAIL, exp: 32_503_680_000 }),
      'utf8',
    ).toString('base64url');
    expect(validarTokenVerificacao(`${carga}.assinatura-inventada`, AGORA).ok).toBe(false);
  });

  it('assinada com outro segredo não passa', () => {
    const t = assinarTokenVerificacao(SUB, EMAIL, AGORA);
    process.env.EMAIL_VERIFY_SECRET = 'outro-segredo-qualquer';
    expect(validarTokenVerificacao(t, AGORA)).toEqual({ ok: false, motivo: 'assinatura' });
  });

  it('formas malformadas não rebentam', () => {
    for (const t of ['', '.', 'sem-ponto', 'a.', '.b']) {
      expect(validarTokenVerificacao(t, AGORA).ok).toBe(false);
    }
  });

  it('carga com assinatura certa mas sem os campos esperados é malformada', () => {
    const t = assinarTokenVerificacao(SUB, EMAIL, AGORA);
    // Reassina uma carga válida em base64url mas sem `sub`.
    const { createHmac } = require('node:crypto') as typeof import('node:crypto');
    const carga = Buffer.from(JSON.stringify({ email: EMAIL, exp: AGORA + 60 }), 'utf8').toString(
      'base64url',
    );
    const assinatura = createHmac('sha256', process.env.EMAIL_VERIFY_SECRET!)
      .update(carga)
      .digest('base64url');
    expect(t).toContain('.');
    expect(validarTokenVerificacao(`${carga}.${assinatura}`, AGORA)).toEqual({
      ok: false,
      motivo: 'malformada',
    });
  });
});

describe('URL', () => {
  it('aponta para a rota pública com o token na query', () => {
    process.env.APP_URL = 'https://app.gestpro.co.mz/';
    const t = assinarTokenVerificacao(SUB, EMAIL, AGORA);
    expect(baseAplicacao()).toBe('https://app.gestpro.co.mz');
    expect(urlVerificacao(t)).toBe(
      `https://app.gestpro.co.mz/api/publico/verificar-email?t=${encodeURIComponent(t)}`,
    );
  });
});
