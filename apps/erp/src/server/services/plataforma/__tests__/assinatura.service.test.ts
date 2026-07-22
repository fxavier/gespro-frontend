import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    assinatura: { updateMany: vi.fn(), findFirst: vi.fn() },
    configuracaoFiscal: { updateMany: vi.fn() },
    eventoWebhookStripe: { create: vi.fn() },
    user: { findMany: vi.fn() },
    notificacao: { createMany: vi.fn() },
  };
  return {
    tx,
    assinaturaFindFirst: vi.fn(),
    assinaturaFindMany: vi.fn(),
    assinaturaUpdateMany: vi.fn(),
    eventoFindUnique: vi.fn(),
    tenantFindFirst: vi.fn(),
    cfgFindFirst: vi.fn(),
    $transaction: vi.fn(),
    // Stripe
    customersCreate: vi.fn(),
    checkoutCreate: vi.fn(),
    portalCreate: vi.fn(),
    subsUpdate: vi.fn(),
    subsCreate: vi.fn(),
    constructEvent: vi.fn(),
  };
});

vi.mock('@/server/db/client', () => ({
  prismaBase: {
    assinatura: {
      findFirst: mocks.assinaturaFindFirst,
      findMany: mocks.assinaturaFindMany,
      updateMany: mocks.assinaturaUpdateMany,
    },
    eventoWebhookStripe: { findUnique: mocks.eventoFindUnique },
    tenant: { findFirst: mocks.tenantFindFirst },
    configuracaoFiscal: { findFirst: mocks.cfgFindFirst },
    $transaction: mocks.$transaction,
  },
}));

vi.mock('@/server/billing/stripe-client', async () => {
  const real = await vi.importActual<typeof import('@/server/billing/stripe-client')>(
    '@/server/billing/stripe-client',
  );
  return {
    ...real,
    stripeConfigurado: () => true,
    getWebhookSecret: () => 'whsec_teste',
    resolverPriceId: (plano: string, ciclo: string) => `price_${plano}_${ciclo}`,
    getStripe: () => ({
      customers: { create: mocks.customersCreate },
      checkout: { sessions: { create: mocks.checkoutCreate } },
      billingPortal: { sessions: { create: mocks.portalCreate } },
      subscriptions: { update: mocks.subsUpdate, create: mocks.subsCreate },
      webhooks: { constructEvent: mocks.constructEvent },
    }),
  };
});

import {
  aplicarTransicao,
  abrirPortalCliente,
  cancelarSubscricao,
  criarSubscricaoTrial,
  expirarTrialsVencidos,
  iniciarCheckout,
  obter,
  obterOuNulo,
  processarEventoWebhook,
  sincronizarStatusAtivo,
  verificarAssinaturaWebhook,
} from '../assinatura.service';
import { prismaBase } from '@/server/db/client';

const CTX = { tenantId: 'tenant-1', userId: 'user-1' };

function assinaturaDb(over: Record<string, unknown> = {}) {
  return {
    id: 'ass-1',
    tenantId: 'tenant-1',
    planoAssinatura: 'PROFISSIONAL',
    ciclo: null,
    estado: 'TRIAL',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    trialInicio: new Date('2026-07-01'),
    trialFim: new Date('2026-07-15'),
    dataAtivacao: null,
    dataCancelamento: null,
    motivoCancelamento: null,
    tentativasFalhadas: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function evento(tipo: string, object: Record<string, unknown>, id = 'evt_1') {
  return { id, type: tipo, data: { object } } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.$transaction.mockImplementation(async (fn: (t: typeof mocks.tx) => unknown) => fn(mocks.tx));
  mocks.tx.assinatura.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.configuracaoFiscal.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.eventoWebhookStripe.create.mockResolvedValue({});
  mocks.tx.user.findMany.mockResolvedValue([{ id: 'user-1' }]);
  mocks.tx.notificacao.createMany.mockResolvedValue({ count: 1 });
  mocks.tx.assinatura.findFirst.mockResolvedValue({ tentativasFalhadas: 0 });
  mocks.eventoFindUnique.mockResolvedValue(null);
  mocks.assinaturaUpdateMany.mockResolvedValue({ count: 1 });
});

// ---------------------------------------------------------------------------

describe('leitura', () => {
  it('filtra sempre por tenantId do contexto', async () => {
    mocks.assinaturaFindFirst.mockResolvedValue(assinaturaDb());
    const r = await obter(CTX);
    expect(mocks.assinaturaFindFirst).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' } });
    expect(r.estado).toBe('TRIAL');
    expect(r.bloqueado).toBe(false);
  });

  it('cross-tenant devolve NotFound (404), nunca 403', async () => {
    mocks.assinaturaFindFirst.mockResolvedValue(null);
    await expect(obter(CTX)).rejects.toMatchObject({ code: 'NAO_ENCONTRADO', status: 404 });
  });

  it('obterOuNulo tolera tenants antigos sem assinatura', async () => {
    mocks.assinaturaFindFirst.mockResolvedValue(null);
    expect(await obterOuNulo(CTX)).toBeNull();
  });

  it('marca bloqueado nos estados que bloqueiam o acesso', async () => {
    mocks.assinaturaFindFirst.mockResolvedValue(assinaturaDb({ estado: 'SUSPENSA' }));
    expect((await obter(CTX)).bloqueado).toBe(true);
  });
});

describe('sincronização statusAtivo ↔ estado', () => {
  it('activa para TRIAL e ATIVA', async () => {
    for (const estado of ['TRIAL', 'ATIVA'] as const) {
      mocks.tx.configuracaoFiscal.updateMany.mockClear();
      await sincronizarStatusAtivo(mocks.tx as never, 'tenant-1', estado);
      expect(mocks.tx.configuracaoFiscal.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        data: { statusAtivo: true },
      });
    }
  });

  it('bloqueia para EXPIRADO, SUSPENSA e CANCELADA', async () => {
    for (const estado of ['EXPIRADO', 'SUSPENSA', 'CANCELADA'] as const) {
      mocks.tx.configuracaoFiscal.updateMany.mockClear();
      await sincronizarStatusAtivo(mocks.tx as never, 'tenant-1', estado);
      expect(mocks.tx.configuracaoFiscal.updateMany.mock.calls[0][0].data).toEqual({
        statusAtivo: false,
      });
    }
  });
});

describe('aplicarTransicao', () => {
  const alvo = { id: 'ass-1', tenantId: 'tenant-1', estado: 'TRIAL' };

  it('aplica transição válida e sincroniza o bloqueio na mesma transacção', async () => {
    const ok = await aplicarTransicao(mocks.tx as never, alvo, 'ATIVA', { dataAtivacao: new Date() });
    expect(ok).toBe(true);
    expect(mocks.tx.assinatura.updateMany.mock.calls[0][0].where).toEqual({
      id: 'ass-1',
      tenantId: 'tenant-1',
    });
    expect(mocks.tx.configuracaoFiscal.updateMany).toHaveBeenCalled();
  });

  it('ignora (sem erro) transições fora de ordem — o Stripe não garante ordem', async () => {
    const ok = await aplicarTransicao(mocks.tx as never, alvo, 'SUSPENSA');
    expect(ok).toBe(false);
    expect(mocks.tx.assinatura.updateMany).not.toHaveBeenCalled();
  });

  it('em modo estrito lança TRANSICAO_INVALIDA (acção explícita da UI)', async () => {
    await expect(
      aplicarTransicao(mocks.tx as never, alvo, 'SUSPENSA', {}, { estrito: true }),
    ).rejects.toMatchObject({ code: 'TRANSICAO_INVALIDA' });
  });
});

describe('webhook — idempotência', () => {
  it('reentrega do mesmo evento não reprocessa', async () => {
    mocks.eventoFindUnique.mockResolvedValue({ id: 'e1', tenantId: 'tenant-1' });
    const r = await processarEventoWebhook(evento('invoice.paid', { customer: 'cus_1' }));
    expect(r.duplicado).toBe(true);
    expect(mocks.$transaction).not.toHaveBeenCalled();
  });

  it('regista o stripeEventId antes da lógica de negócio', async () => {
    mocks.assinaturaFindFirst.mockResolvedValue({
      id: 'ass-1',
      tenantId: 'tenant-1',
      estado: 'TRIAL',
    });
    await processarEventoWebhook(
      evento('checkout.session.completed', { customer: 'cus_1', subscription: 'sub_1' }),
    );
    expect(mocks.tx.eventoWebhookStripe.create).toHaveBeenCalledWith({
      data: { stripeEventId: 'evt_1', tipo: 'checkout.session.completed', tenantId: 'tenant-1' },
    });
  });

  it('corrida entre duas entregas: a perdedora (P2002) devolve duplicado', async () => {
    mocks.assinaturaFindFirst.mockResolvedValue({
      id: 'ass-1',
      tenantId: 'tenant-1',
      estado: 'TRIAL',
    });
    mocks.$transaction.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    const r = await processarEventoWebhook(evento('invoice.paid', { customer: 'cus_1' }));
    expect(r.duplicado).toBe(true);
  });

  it('usa prismaBase (nunca o cliente tenant-scoped)', async () => {
    mocks.assinaturaFindFirst.mockResolvedValue(null);
    await processarEventoWebhook(evento('invoice.paid', { customer: 'cus_x' }));
    expect(prismaBase.$transaction).toHaveBeenCalled();
    expect(prismaBase.assinatura.findFirst).toHaveBeenCalled();
  });
});

describe('webhook — resolução do tenant', () => {
  it('resolve pelo stripeSubscriptionId antes do customer', async () => {
    mocks.assinaturaFindFirst.mockResolvedValue({
      id: 'ass-1',
      tenantId: 'tenant-1',
      estado: 'TRIAL',
    });
    await processarEventoWebhook(
      evento('customer.subscription.updated', {
        id: 'sub_9',
        customer: 'cus_9',
        status: 'active',
      }),
    );
    expect(mocks.assinaturaFindFirst.mock.calls[0][0].where).toEqual({
      stripeSubscriptionId: 'sub_9',
    });
  });

  it('evento sem tenant conhecido é registado e ignorado (não é erro fatal)', async () => {
    mocks.assinaturaFindFirst.mockResolvedValue(null);
    const r = await processarEventoWebhook(evento('invoice.paid', { customer: 'cus_desconhecido' }));
    expect(r.tenantId).toBeNull();
    expect(r.transitou).toBe(false);
    expect(mocks.tx.eventoWebhookStripe.create).toHaveBeenCalled();
    expect(mocks.tx.assinatura.updateMany).not.toHaveBeenCalled();
  });

  it('não confia em metadata para resolver o tenant', async () => {
    mocks.assinaturaFindFirst.mockResolvedValue(null);
    await processarEventoWebhook(
      evento('invoice.paid', { customer: 'cus_x', metadata: { tenantId: 'tenant-vitima' } }),
    );
    // Nenhuma query usou o tenantId da metadata.
    for (const call of mocks.assinaturaFindFirst.mock.calls) {
      expect(JSON.stringify(call[0])).not.toContain('tenant-vitima');
    }
  });
});

describe('webhook — mapeamento de eventos para estados', () => {
  function comAssinatura(estado: string) {
    mocks.assinaturaFindFirst.mockResolvedValue({ id: 'ass-1', tenantId: 'tenant-1', estado });
  }

  it('checkout.session.completed activa e limpa o cancelamento', async () => {
    comAssinatura('TRIAL');
    const r = await processarEventoWebhook(
      evento('checkout.session.completed', { customer: 'cus_1', subscription: 'sub_1' }),
    );
    expect(r.transitou).toBe(true);
    const data = mocks.tx.assinatura.updateMany.mock.calls[0][0].data;
    expect(data.estado).toBe('ATIVA');
    expect(data.stripeSubscriptionId).toBe('sub_1');
    expect(data.dataCancelamento).toBeNull();
    expect(data.tentativasFalhadas).toBe(0);
  });

  it('subscription.updated status=trialing mantém TRIAL', async () => {
    comAssinatura('TRIAL');
    await processarEventoWebhook(
      evento('customer.subscription.updated', { id: 'sub_1', customer: 'c', status: 'trialing' }),
    );
    expect(mocks.tx.assinatura.updateMany.mock.calls[0][0].data.estado).toBe('TRIAL');
  });

  it('subscription.updated status=past_due suspende', async () => {
    comAssinatura('ATIVA');
    await processarEventoWebhook(
      evento('customer.subscription.updated', { id: 'sub_1', customer: 'c', status: 'past_due' }),
    );
    expect(mocks.tx.assinatura.updateMany.mock.calls[0][0].data.estado).toBe('SUSPENSA');
    expect(mocks.tx.configuracaoFiscal.updateMany.mock.calls[0][0].data.statusAtivo).toBe(false);
  });

  it('subscription.updated com status desconhecido não transita', async () => {
    comAssinatura('ATIVA');
    const r = await processarEventoWebhook(
      evento('customer.subscription.updated', { id: 'sub_1', customer: 'c', status: 'paused' }),
    );
    expect(r.transitou).toBe(false);
    expect(mocks.tx.assinatura.updateMany).not.toHaveBeenCalled();
  });

  it('subscription.deleted cancela, bloqueia e notifica os administradores', async () => {
    comAssinatura('ATIVA');
    await processarEventoWebhook(
      evento('customer.subscription.deleted', { id: 'sub_1', customer: 'c', status: 'canceled' }),
    );
    const data = mocks.tx.assinatura.updateMany.mock.calls[0][0].data;
    expect(data.estado).toBe('CANCELADA');
    expect(data.dataCancelamento).toBeInstanceOf(Date);
    expect(mocks.tx.configuracaoFiscal.updateMany.mock.calls[0][0].data.statusAtivo).toBe(false);
    expect(mocks.tx.notificacao.createMany).toHaveBeenCalled();
    const notif = mocks.tx.notificacao.createMany.mock.calls[0][0].data[0];
    expect(notif.tenantId).toBe('tenant-1');
    expect(notif.estadoEnvio).toBe('PENDENTE');
  });

  it('invoice.paid reactiva um tenant suspenso e zera as tentativas', async () => {
    comAssinatura('SUSPENSA');
    await processarEventoWebhook(evento('invoice.paid', { customer: 'cus_1' }));
    const data = mocks.tx.assinatura.updateMany.mock.calls[0][0].data;
    expect(data.estado).toBe('ATIVA');
    expect(data.tentativasFalhadas).toBe(0);
    expect(mocks.tx.configuracaoFiscal.updateMany.mock.calls[0][0].data.statusAtivo).toBe(true);
  });

  it('invoice.payment_failed com retry pendente só conta a tentativa', async () => {
    comAssinatura('ATIVA');
    mocks.tx.assinatura.findFirst.mockResolvedValue({ tentativasFalhadas: 1 });
    const r = await processarEventoWebhook(
      evento('invoice.payment_failed', { customer: 'cus_1', next_payment_attempt: 1780000000 }),
    );
    expect(r.transitou).toBe(false);
    expect(mocks.tx.assinatura.updateMany.mock.calls[0][0].data).toEqual({ tentativasFalhadas: 2 });
    expect(mocks.tx.notificacao.createMany).toHaveBeenCalled();
  });

  it('invoice.payment_failed no fim do dunning suspende e bloqueia o login', async () => {
    comAssinatura('ATIVA');
    mocks.tx.assinatura.findFirst.mockResolvedValue({ tentativasFalhadas: 3 });
    await processarEventoWebhook(
      evento('invoice.payment_failed', { customer: 'cus_1', next_payment_attempt: null }),
    );
    const data = mocks.tx.assinatura.updateMany.mock.calls[0][0].data;
    expect(data.estado).toBe('SUSPENSA');
    expect(mocks.tx.configuracaoFiscal.updateMany.mock.calls[0][0].data.statusAtivo).toBe(false);
  });

  it('trial_will_end apenas notifica, sem transitar', async () => {
    comAssinatura('TRIAL');
    const r = await processarEventoWebhook(
      evento('customer.subscription.trial_will_end', { id: 'sub_1', customer: 'c' }),
    );
    expect(r.transitou).toBe(false);
    expect(mocks.tx.assinatura.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.notificacao.createMany).toHaveBeenCalled();
  });

  it('evento não tratado é registado sem efeitos', async () => {
    comAssinatura('ATIVA');
    const r = await processarEventoWebhook(evento('customer.updated', { id: 'cus_1' }));
    expect(r.transitou).toBe(false);
    expect(mocks.tx.eventoWebhookStripe.create).toHaveBeenCalled();
  });
});

describe('webhook — verificação de assinatura', () => {
  it('delega em stripe.webhooks.constructEvent com o segredo do endpoint', () => {
    mocks.constructEvent.mockReturnValue({ id: 'evt_1', type: 'invoice.paid' });
    verificarAssinaturaWebhook('corpo-cru', 'assinatura');
    expect(mocks.constructEvent).toHaveBeenCalledWith('corpo-cru', 'assinatura', 'whsec_teste');
  });

  it('propaga o erro quando a assinatura não confere', () => {
    mocks.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature');
    });
    expect(() => verificarAssinaturaWebhook('corpo', 'ass-falsa')).toThrow();
  });
});

describe('checkout e portal', () => {
  it('cria o Customer, persiste-o e devolve o URL da Checkout Session', async () => {
    mocks.assinaturaFindFirst.mockResolvedValue(assinaturaDb());
    mocks.tenantFindFirst.mockResolvedValue({ nome: 'Padaria', nuit: '400123456' });
    mocks.cfgFindFirst.mockResolvedValue({ email: 'ana@padaria.mz' });
    mocks.customersCreate.mockResolvedValue({ id: 'cus_novo' });
    mocks.checkoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/x' });

    const r = await iniciarCheckout({ planoId: 'PROFISSIONAL', ciclo: 'ANUAL' }, CTX);

    expect(r.url).toBe('https://checkout.stripe.com/x');
    expect(mocks.assinaturaUpdateMany.mock.calls[0][0].data).toEqual({
      stripeCustomerId: 'cus_novo',
    });
    const args = mocks.checkoutCreate.mock.calls[0][0];
    expect(args.mode).toBe('subscription');
    // O Price vem do catálogo server-side, nunca do cliente.
    expect(args.line_items[0].price).toBe('price_PROFISSIONAL_ANUAL');
    expect(args.metadata.tenantId).toBe('tenant-1');
  });

  it('reaproveita o Customer existente', async () => {
    mocks.assinaturaFindFirst.mockResolvedValue(assinaturaDb({ stripeCustomerId: 'cus_ja' }));
    mocks.checkoutCreate.mockResolvedValue({ url: 'https://checkout/y' });
    await iniciarCheckout({ planoId: 'BASICO', ciclo: 'MENSAL' }, CTX);
    expect(mocks.customersCreate).not.toHaveBeenCalled();
    expect(mocks.checkoutCreate.mock.calls[0][0].customer).toBe('cus_ja');
  });

  it('falha com erro estável se o Stripe não devolver URL', async () => {
    mocks.assinaturaFindFirst.mockResolvedValue(assinaturaDb({ stripeCustomerId: 'cus_ja' }));
    mocks.checkoutCreate.mockResolvedValue({ url: null });
    await expect(iniciarCheckout({ planoId: 'BASICO', ciclo: 'MENSAL' }, CTX)).rejects.toMatchObject(
      { code: 'CHECKOUT_SEM_URL' },
    );
  });

  it('portal exige subscrição com Customer', async () => {
    mocks.assinaturaFindFirst.mockResolvedValue(assinaturaDb());
    await expect(abrirPortalCliente(CTX)).rejects.toMatchObject({ code: 'SEM_SUBSCRICAO_ATIVA' });
  });

  it('portal devolve o URL da sessão do Billing Portal', async () => {
    mocks.assinaturaFindFirst.mockResolvedValue(assinaturaDb({ stripeCustomerId: 'cus_1' }));
    mocks.portalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/z' });
    expect((await abrirPortalCliente(CTX)).url).toBe('https://billing.stripe.com/z');
  });
});

describe('cancelamento', () => {
  it('com subscrição Stripe cancela no fim do período (estado local intacto)', async () => {
    mocks.assinaturaFindFirst.mockResolvedValue(
      assinaturaDb({ estado: 'ATIVA', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' }),
    );
    mocks.subsUpdate.mockResolvedValue({});

    const r = await cancelarSubscricao({ motivo: 'demasiado caro' }, CTX);

    expect(r.fimDoPeriodo).toBe(true);
    expect(mocks.subsUpdate.mock.calls[0][1].cancel_at_period_end).toBe(true);
    // Não antecipa CANCELADA: o tenant ainda pagou o período corrente.
    expect(mocks.$transaction).not.toHaveBeenCalled();
  });

  it('em trial sem subscrição Stripe cancela localmente', async () => {
    mocks.assinaturaFindFirst.mockResolvedValue(assinaturaDb({ estado: 'TRIAL' }));
    const r = await cancelarSubscricao({}, CTX);
    expect(r.fimDoPeriodo).toBe(false);
    expect(mocks.tx.assinatura.updateMany.mock.calls[0][0].data.estado).toBe('CANCELADA');
    expect(mocks.tx.configuracaoFiscal.updateMany.mock.calls[0][0].data.statusAtivo).toBe(false);
  });
});

describe('subscrição de trial em background', () => {
  it('cria customer + subscrição com trial de 14 dias e persiste as referências', async () => {
    mocks.assinaturaFindFirst.mockResolvedValue({
      id: 'ass-1',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
    mocks.tenantFindFirst.mockResolvedValue({ nome: 'Padaria', nuit: '4' });
    mocks.cfgFindFirst.mockResolvedValue({ email: 'a@b.mz' });
    mocks.customersCreate.mockResolvedValue({ id: 'cus_1' });
    mocks.subsCreate.mockResolvedValue({ id: 'sub_1' });

    expect(await criarSubscricaoTrial('tenant-1', 'BASICO')).toEqual({ criada: true });
    expect(mocks.subsCreate.mock.calls[0][0].trial_period_days).toBe(14);
    const data = mocks.assinaturaUpdateMany.mock.calls[0][0].data;
    expect(data.stripeSubscriptionId).toBe('sub_1');
    expect(mocks.assinaturaUpdateMany.mock.calls[0][0].where.tenantId).toBe('tenant-1');
  });

  it('não duplica se já existir subscrição', async () => {
    mocks.assinaturaFindFirst.mockResolvedValue({
      id: 'ass-1',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    });
    expect(await criarSubscricaoTrial('tenant-1', 'BASICO')).toEqual({
      criada: false,
      motivo: 'ja_existe',
    });
    expect(mocks.subsCreate).not.toHaveBeenCalled();
  });

  it('uma falha do Stripe não rebenta o registo (trial local mantém-se)', async () => {
    mocks.assinaturaFindFirst.mockRejectedValue(new Error('rede'));
    expect(await criarSubscricaoTrial('tenant-1', 'BASICO')).toEqual({
      criada: false,
      motivo: 'erro_stripe',
    });
  });
});

describe('cron de fallback — expiração de trials', () => {
  it('expira apenas trials vencidos e é idempotente', async () => {
    mocks.assinaturaFindMany.mockResolvedValue([
      { id: 'a1', tenantId: 't1', estado: 'TRIAL' },
      { id: 'a2', tenantId: 't2', estado: 'TRIAL' },
    ]);

    const r = await expirarTrialsVencidos(new Date('2026-08-01'));

    expect(mocks.assinaturaFindMany.mock.calls[0][0].where).toEqual({
      estado: 'TRIAL',
      trialFim: { lt: new Date('2026-08-01') },
    });
    expect(r).toEqual({ avaliadas: 2, expiradas: 2 });
    expect(mocks.tx.configuracaoFiscal.updateMany.mock.calls[0][0].data.statusAtivo).toBe(false);
  });

  it('sem trials vencidos não faz nada', async () => {
    mocks.assinaturaFindMany.mockResolvedValue([]);
    expect(await expirarTrialsVencidos()).toEqual({ avaliadas: 0, expiradas: 0 });
    expect(mocks.$transaction).not.toHaveBeenCalled();
  });
});
