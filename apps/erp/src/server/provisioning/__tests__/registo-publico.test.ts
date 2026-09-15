/**
 * Testes de `registarTenant()` — a fronteira pública partilhada pelo Route
 * Handler `POST /api/publico/registo` e pelo ecrã `/registo` do ERP.
 *
 * O que aqui se fixa é o que o ADR-0031 mudou e o que ele NÃO pode deixar
 * regredir: a identidade nasce sem `VERIFY_EMAIL`, a palavra-passe é escrita
 * antes de haver tenant em Postgres, e uma falha nessa escrita não deixa lixo
 * meio-criado. O envelope HTTP é testado noutro sítio
 * (`src/app/api/publico/__tests__/registo-handler.test.ts`) — aqui não há
 * `Request` nem `Response`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  provisionarTenant: vi.fn(),
  criarSubscricaoTrial: vi.fn(),
  verificarCaptcha: vi.fn(),
  reservarChave: vi.fn(),
  concluirChave: vi.fn(),
  falharChave: vi.fn(),
  consumir: vi.fn(),
  garantirUtilizador: vi.fn(),
  definirPalavraPasse: vi.fn(),
  eliminarUtilizador: vi.fn(),
  userFindFirst: vi.fn(),
  userUpdateMany: vi.fn(),
}));

vi.mock('@/server/services/plataforma/tenant-provisioning.service', () => ({
  provisionarTenant: mocks.provisionarTenant,
}));
vi.mock('@/server/services/plataforma/assinatura.service', () => ({
  criarSubscricaoTrial: mocks.criarSubscricaoTrial,
}));
vi.mock('@/server/security/captcha', () => ({ verificarCaptcha: mocks.verificarCaptcha }));
vi.mock('@/server/security/rate-limiter', () => ({
  registoLimiter: { consume: mocks.consumir },
}));
vi.mock('@/server/provisioning/idempotencia', async () => {
  const real = await vi.importActual<typeof import('@/server/provisioning/idempotencia')>(
    '@/server/provisioning/idempotencia',
  );
  return {
    fingerprintDe: real.fingerprintDe,
    reservarChave: mocks.reservarChave,
    concluirChave: mocks.concluirChave,
    falharChave: mocks.falharChave,
  };
});
// `prismaBase` só é tocado pelo guarda-costas do apagamento (e nunca no
// caminho feliz) — daí o dublê mínimo.
vi.mock('@/server/db/client', () => ({
  prismaBase: {
    user: { findFirst: mocks.userFindFirst, updateMany: mocks.userUpdateMany },
  },
}));
vi.mock('@/server/auth/keycloak', async () => {
  const real = await vi.importActual<typeof import('@/server/auth/keycloak')>(
    '@/server/auth/keycloak',
  );
  return {
    // `ErroKeycloak` é a classe real: o `instanceof` do módulo sob teste e o do
    // teste têm de olhar para o mesmo objecto.
    ErroKeycloak: real.ErroKeycloak,
    garantirUtilizador: mocks.garantirUtilizador,
    definirPalavraPasse: mocks.definirPalavraPasse,
    eliminarUtilizador: mocks.eliminarUtilizador,
  };
});

import { BusinessRuleError } from '@/lib/errors';
import { ErroKeycloak } from '@/server/auth/keycloak';
import { CORPO_ILEGIVEL, registarTenant } from '../registo-publico';

const SENHA = 'padaria-ana-2026';

const CORPO_VALIDO = {
  empresa: { nome: 'Padaria Ana, Lda', nuit: '400123456' },
  admin: { nome: 'Ana Sitoe', email: 'ana@padaria.mz' },
  senha: SENHA,
  confirmacao: SENHA,
  planoId: 'PROFISSIONAL',
  provincia: 'Maputo Cidade',
  captchaToken: 'ok',
};

const CONTEXTO = { ip: '41.0.0.1', idempotencyKey: '11111111-2222-3333-4444-555555555555' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consumir.mockResolvedValue({ limited: false, remaining: 4, retryAfterSec: 0 });
  mocks.reservarChave.mockResolvedValue({ tipo: 'NOVA' });
  mocks.verificarCaptcha.mockResolvedValue({ valido: true });
  mocks.garantirUtilizador.mockResolvedValue({ sub: 'kc-sub-ana', criado: true });
  mocks.userFindFirst.mockResolvedValue(null);
  mocks.userUpdateMany.mockResolvedValue({ count: 1 });
  mocks.definirPalavraPasse.mockResolvedValue(undefined);
  mocks.eliminarUtilizador.mockResolvedValue(undefined);
  mocks.provisionarTenant.mockResolvedValue({
    tenantId: 'tenant-1',
    tenantSlug: 'padaria-ana-lda',
    userId: 'user-1',
    keycloakSub: 'kc-sub-ana',
    adminEmail: 'ana@padaria.mz',
    adminNome: 'Ana Sitoe',
    notificacaoBoasVindasId: 'notif-1',
  });
  mocks.criarSubscricaoTrial.mockResolvedValue({ criada: true });
});

describe('resultado discriminado', () => {
  it('sucesso devolve tenantSlug, sub e email — o que o signIn e a verificação precisam', async () => {
    const r = await registarTenant(CORPO_VALIDO, CONTEXTO);
    expect(r).toMatchObject({
      ok: true,
      tenantSlug: 'padaria-ana-lda',
      sub: 'kc-sub-ana',
      email: 'ana@padaria.mz',
      repetido: false,
    });
  });

  it('a palavra-passe não sai no resultado', async () => {
    const r = await registarTenant(CORPO_VALIDO, CONTEXTO);
    expect(JSON.stringify(r)).not.toContain(SENHA);
  });

  it('reentrega idempotente devolve repetido: true com o corpo gravado', async () => {
    mocks.reservarChave.mockResolvedValue({
      tipo: 'REPETIDA',
      resposta: {
        tenantSlug: 'padaria-ana-lda',
        mensagem: 'corpo-original',
        sub: 'kc-sub-ana',
        email: 'ana@padaria.mz',
      },
    });
    const r = await registarTenant(CORPO_VALIDO, CONTEXTO);
    expect(r).toMatchObject({
      ok: true,
      repetido: true,
      tenantSlug: 'padaria-ana-lda',
      mensagem: 'corpo-original',
      sub: 'kc-sub-ana',
    });
    expect(mocks.garantirUtilizador).not.toHaveBeenCalled();
    expect(mocks.provisionarTenant).not.toHaveBeenCalled();
  });
});

describe('ordem das defesas', () => {
  it('limite por IP responde antes de a chave ser sequer lida', async () => {
    mocks.consumir.mockResolvedValue({ limited: true, remaining: 0, retryAfterSec: 120 });
    const r = await registarTenant(CORPO_VALIDO, { ip: '41.0.0.1', idempotencyKey: '' });
    expect(r).toMatchObject({ ok: false, estado: 429, retryAfterSec: 120 });
    expect(mocks.reservarChave).not.toHaveBeenCalled();
  });

  it('chave em falta é recusada antes de olhar para o corpo', async () => {
    const r = await registarTenant(CORPO_ILEGIVEL, { ip: '41.0.0.1', idempotencyKey: 'curta' });
    expect(r).toMatchObject({ ok: false, code: 'IDEMPOTENCY_KEY_OBRIGATORIA', estado: 400 });
  });

  it('corpo ilegível é JSON_INVALIDO, e não um erro de validação', async () => {
    const r = await registarTenant(CORPO_ILEGIVEL, CONTEXTO);
    expect(r).toMatchObject({ ok: false, code: 'JSON_INVALIDO', estado: 400 });
  });

  it('captcha recusado não chega ao Keycloak e liberta a chave', async () => {
    mocks.verificarCaptcha.mockResolvedValue({ valido: false, motivo: 'captcha_invalido' });
    const r = await registarTenant(CORPO_VALIDO, CONTEXTO);
    expect(r).toMatchObject({ ok: false, code: 'CAPTCHA_INVALIDO', estado: 403 });
    expect(mocks.garantirUtilizador).not.toHaveBeenCalled();
    expect(mocks.falharChave).toHaveBeenCalled();
  });
});

describe('validação da palavra-passe (ADR-0031, mesma regra do ADR-0030)', () => {
  it('recusa com menos de 10 caracteres', async () => {
    const r = await registarTenant(
      { ...CORPO_VALIDO, senha: 'curta1', confirmacao: 'curta1' },
      CONTEXTO,
    );
    expect(r).toMatchObject({ ok: false, code: 'VALIDACAO', estado: 422 });
  });

  it('recusa quando a confirmação não coincide', async () => {
    const r = await registarTenant({ ...CORPO_VALIDO, confirmacao: 'outra-coisa-10' }, CONTEXTO);
    expect(r).toMatchObject({ ok: false, code: 'VALIDACAO' });
    const detalhes = (r as { detalhes: { fieldErrors: Record<string, string[]> } }).detalhes;
    expect(detalhes.fieldErrors.confirmacao).toBeTruthy();
  });

  it('recusa quando não há palavra-passe nenhuma — o campo é obrigatório', async () => {
    const { senha: _s, confirmacao: _c, ...semSenha } = CORPO_VALIDO;
    const r = await registarTenant(semSenha, CONTEXTO);
    expect(r).toMatchObject({ ok: false, code: 'VALIDACAO' });
    expect(mocks.garantirUtilizador).not.toHaveBeenCalled();
  });
});

describe('identidade — regressão do defeito que o ADR-0031 corrige', () => {
  /**
   * Este é o teste que impede o regresso do defeito. Com `VERIFY_EMAIL`
   * pendente o Direct Access Grant recusa a sessão, e o registo deixa de dar
   * entrada nenhuma — que é a razão de o ADR-0031 existir.
   */
  it('NUNCA cria a identidade com VERIFY_EMAIL: `accoes: []` e e-mail por verificar', async () => {
    await registarTenant(CORPO_VALIDO, CONTEXTO);
    expect(mocks.garantirUtilizador).toHaveBeenCalledWith({
      email: 'ana@padaria.mz',
      nome: 'Ana Sitoe',
      accoes: [],
      emailVerificado: false,
    });
    expect(JSON.stringify(mocks.garantirUtilizador.mock.calls)).not.toContain('VERIFY_EMAIL');
  });

  it('escreve a palavra-passe com temporaria: false e ANTES da transacção', async () => {
    await registarTenant(CORPO_VALIDO, CONTEXTO);
    expect(mocks.definirPalavraPasse).toHaveBeenCalledWith('kc-sub-ana', SENHA, {
      temporaria: false,
    });
    expect(mocks.definirPalavraPasse.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.provisionarTenant.mock.invocationCallOrder[0],
    );
  });

  it('nunca passa a palavra-passe ao provisionamento', async () => {
    await registarTenant(CORPO_VALIDO, CONTEXTO);
    expect(JSON.stringify(mocks.provisionarTenant.mock.calls[0][0])).not.toContain(SENHA);
  });

  it('não reescreve a credencial de uma identidade que já existia — seria tomada de conta', async () => {
    mocks.garantirUtilizador.mockResolvedValue({ sub: 'kc-sub-ana', criado: false });
    mocks.provisionarTenant.mockRejectedValue(
      new BusinessRuleError('EMAIL_JA_REGISTADO', 'Este e-mail já está associado a uma conta.'),
    );
    const r = await registarTenant(CORPO_VALIDO, CONTEXTO);
    expect(r).toMatchObject({ ok: false, code: 'EMAIL_JA_REGISTADO' });
    expect(mocks.definirPalavraPasse).not.toHaveBeenCalled();
    // E não se apaga a identidade de outrem.
    expect(mocks.eliminarUtilizador).not.toHaveBeenCalled();
  });

  /**
   * O 409 do Keycloak diz a quem perde a corrida que não foi ele a criar. Sem
   * isso, os dois pedidos liam `null` antes de criar, partilhavam o `sub`
   * deduplicado e julgavam-se ambos criadores — e o perdedor escrevia a sua
   * credencial por cima da do vencedor (ADR-0031 §2-bis).
   */
  it('quem perde a corrida (criado: false) não escreve credencial antes da transacção', async () => {
    mocks.garantirUtilizador.mockResolvedValue({ sub: 'kc-sub-ana', criado: false });
    await registarTenant(CORPO_VALIDO, CONTEXTO);
    // A única escrita é a de depois do commit — nunca antes dele.
    expect(mocks.definirPalavraPasse.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.provisionarTenant.mock.invocationCallOrder[0],
    );
    expect(mocks.definirPalavraPasse).toHaveBeenCalledTimes(1);
  });

  it('órfã comprovada pelo commit: a credencial do pedido corrente sobrepõe-se, depois da transacção', async () => {
    mocks.garantirUtilizador.mockResolvedValue({ sub: 'kc-sub-orfa', criado: false });
    // O serviço reencontra a MESMA identidade (idempotente por e-mail).
    mocks.provisionarTenant.mockResolvedValue({
      tenantId: 'tenant-1',
      tenantSlug: 'padaria-ana-lda',
      userId: 'user-1',
      keycloakSub: 'kc-sub-orfa',
      adminEmail: 'ana@padaria.mz',
      adminNome: 'Ana Sitoe',
      notificacaoBoasVindasId: 'notif-1',
    });
    const r = await registarTenant(CORPO_VALIDO, CONTEXTO);
    expect(r).toMatchObject({ ok: true });
    expect(mocks.definirPalavraPasse).toHaveBeenCalledWith('kc-sub-orfa', SENHA, {
      temporaria: false,
    });
  });

  /**
   * O entrelaçamento do re-parecer: outro pedido com o mesmo e-mail e um NUIT
   * duplicado é recusado em dezenas de milissegundos, não vê `User` nenhum
   * (esta transacção ainda não cometeu) e apaga o `sub` partilhado. Sem a
   * auto-cura, o tenant fica cometido a apontar para uma identidade que já
   * não existe — cliente real sem forma de entrar.
   */
  it('404 na escrita pós-commit: recria a identidade com a credencial de quem se registou', async () => {
    mocks.garantirUtilizador
      .mockResolvedValueOnce({ sub: 'kc-sub-apagado', criado: false })
      .mockResolvedValueOnce({ sub: 'kc-sub-renascido', criado: true });
    mocks.provisionarTenant.mockResolvedValue({
      tenantId: 'tenant-1',
      tenantSlug: 'padaria-ana-lda',
      userId: 'user-1',
      keycloakSub: 'kc-sub-apagado',
      adminEmail: 'ana@padaria.mz',
      adminNome: 'Ana Sitoe',
      notificacaoBoasVindasId: 'notif-1',
    });
    mocks.definirPalavraPasse
      .mockRejectedValueOnce(new ErroKeycloak(404, '[keycloak] não existe'))
      .mockResolvedValueOnce(undefined);

    const r = await registarTenant(CORPO_VALIDO, CONTEXTO);

    expect(r).toMatchObject({ ok: true, sub: 'kc-sub-renascido' });
    // A identidade renasce com a palavra-passe do registante, nunca com a de
    // quem a apagou.
    expect(mocks.definirPalavraPasse).toHaveBeenLastCalledWith('kc-sub-renascido', SENHA, {
      temporaria: false,
    });
    // E o `User` cometido passa a apontar-lhe, com o tenant explícito.
    expect(mocks.userUpdateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', tenantId: 'tenant-1' },
      data: { keycloakSub: 'kc-sub-renascido' },
    });
  });

  it('a auto-cura só existe depois do commit — um 404 antes da transacção não recria nada', async () => {
    mocks.definirPalavraPasse.mockRejectedValue(new ErroKeycloak(404, '[keycloak] não existe'));
    const r = await registarTenant(CORPO_VALIDO, CONTEXTO);
    expect(r).toMatchObject({ ok: false, code: 'ERRO_INTERNO' });
    expect(mocks.provisionarTenant).not.toHaveBeenCalled();
    expect(mocks.userUpdateMany).not.toHaveBeenCalled();
    // Uma única tentativa de identidade: sem commit não há prova de posse.
    expect(mocks.garantirUtilizador).toHaveBeenCalledTimes(1);
  });

  it('identidade substituída a meio: a credencial vai para o sub que o tenant cometeu', async () => {
    // A identidade criada aqui foi apagada entre a escrita da credencial e a
    // transacção; o `provisionarTenant` criou outra ao reencontrá-la em falta.
    mocks.provisionarTenant.mockResolvedValue({
      tenantId: 'tenant-1',
      tenantSlug: 'padaria-ana-lda',
      userId: 'user-1',
      keycloakSub: 'kc-sub-outro',
      adminEmail: 'ana@padaria.mz',
      adminNome: 'Ana Sitoe',
      notificacaoBoasVindasId: 'notif-1',
    });
    const r = await registarTenant(CORPO_VALIDO, CONTEXTO);
    expect(r).toMatchObject({ ok: true, sub: 'kc-sub-outro' });
    expect(mocks.definirPalavraPasse).toHaveBeenLastCalledWith('kc-sub-outro', SENHA, {
      temporaria: false,
    });
  });

  it('se a credencial da órfã não se deixar escrever, o tenant continua criado', async () => {
    mocks.garantirUtilizador.mockResolvedValue({ sub: 'kc-sub-ana', criado: false });
    mocks.definirPalavraPasse.mockRejectedValue(new Error('HTTP 503'));
    const r = await registarTenant(CORPO_VALIDO, CONTEXTO);
    // O tenant existe: não se desfaz nem se mente a dizer que falhou.
    expect(r).toMatchObject({ ok: true, tenantSlug: 'padaria-ana-lda' });
    expect(mocks.eliminarUtilizador).not.toHaveBeenCalled();
  });
});

describe('falhas — nada de lixo meio-criado (tarefa 2.3)', () => {
  it('falha a escrever a palavra-passe: não toca em Postgres, apaga a identidade e deixa repetir', async () => {
    mocks.definirPalavraPasse.mockRejectedValue(new Error('HTTP 503'));
    const r = await registarTenant(CORPO_VALIDO, CONTEXTO);
    expect(r).toMatchObject({ ok: false, code: 'ERRO_INTERNO', estado: 500 });
    expect(mocks.provisionarTenant).not.toHaveBeenCalled();
    expect(mocks.eliminarUtilizador).toHaveBeenCalledWith('kc-sub-ana');
    expect(mocks.falharChave).toHaveBeenCalled();
  });

  it('a mensagem de erro não revela a palavra-passe', async () => {
    mocks.definirPalavraPasse.mockRejectedValue(new Error(`falhou com ${SENHA}`));
    const r = await registarTenant(CORPO_VALIDO, CONTEXTO);
    expect(JSON.stringify(r)).not.toContain(SENHA);
  });

  it('recusa determinística do provisionamento apaga a identidade semeada por este pedido', async () => {
    mocks.provisionarTenant.mockRejectedValue(
      new BusinessRuleError('NUIT_JA_REGISTADO', 'Já existe uma conta com este NUIT.'),
    );
    const r = await registarTenant(CORPO_VALIDO, CONTEXTO);
    expect(r).toMatchObject({ ok: false, code: 'NUIT_JA_REGISTADO', estado: 409 });
    expect(mocks.eliminarUtilizador).toHaveBeenCalledWith('kc-sub-ana');
    expect(mocks.falharChave).toHaveBeenCalled();
  });

  /**
   * A corrida que o parecer apanhou: os dois pedidos partilham o `sub`, o que
   * PERDE a corrida no Keycloak pode cometer o tenant primeiro, e o que ganha
   * apanha `EMAIL_JA_REGISTADO` a seguir. Apagar aí deixava um cliente real
   * com tenant cometido e sem identidade.
   */
  it('recusa determinística NÃO apaga a identidade se já houver User local a referenciá-la', async () => {
    mocks.userFindFirst.mockResolvedValue({ id: 'user-do-vencedor' });
    mocks.provisionarTenant.mockRejectedValue(
      new BusinessRuleError('EMAIL_JA_REGISTADO', 'Este e-mail já está associado a uma conta.'),
    );
    const r = await registarTenant(CORPO_VALIDO, CONTEXTO);
    expect(r).toMatchObject({ ok: false, code: 'EMAIL_JA_REGISTADO' });
    expect(mocks.eliminarUtilizador).not.toHaveBeenCalled();
  });

  it('falha ao escrever a credencial não apaga a identidade que já tem User local', async () => {
    mocks.userFindFirst.mockResolvedValue({ id: 'user-do-vencedor' });
    mocks.definirPalavraPasse.mockRejectedValue(new Error('HTTP 503'));
    const r = await registarTenant(CORPO_VALIDO, CONTEXTO);
    expect(r).toMatchObject({ ok: false, code: 'ERRO_INTERNO' });
    expect(mocks.eliminarUtilizador).not.toHaveBeenCalled();
  });

  it('falha inesperada do provisionamento mantém a identidade — órfã reparável (ADR-0013 §3)', async () => {
    mocks.provisionarTenant.mockRejectedValue(new Error('ligação perdida'));
    const r = await registarTenant(CORPO_VALIDO, CONTEXTO);
    expect(r).toMatchObject({ ok: false, code: 'ERRO_INTERNO', estado: 500 });
    expect((r as { mensagem: string }).mensagem).not.toContain('ligação perdida');
    expect(mocks.eliminarUtilizador).not.toHaveBeenCalled();
  });
});
