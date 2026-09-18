/**
 * O que a verificação pendente NÃO trava (spec 21, tarefa 5.3).
 *
 * Este ficheiro não prova nada por omissão: com o endereço POR CONFIRMAR,
 * chama-se o Checkout, o Portal de subscrição e a exportação e exige-se que
 * passem. Um travão a mais é um defeito tão real como um travão a menos —
 * nunca se trava quem quer pagar (ADR-0027 §6) e os dados exportados são do
 * cliente (ADR-0031, «O que a verificação pendente trava»).
 *
 * Se alguém, um dia, acrescentar uma verificação de e-mail a qualquer um destes
 * três caminhos — no serviço, no `withApi` ou no `createSafeAction` —, é aqui
 * que isso acende.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  assinaturaFindFirst: vi.fn(),
  assinaturaUpdateMany: vi.fn(),
  tenantFindFirst: vi.fn(),
  cfgFindFirst: vi.fn(),
  customersCreate: vi.fn(),
  checkoutCreate: vi.fn(),
  portalCreate: vi.fn(),
  clienteListar: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));

vi.mock('@/server/db/client', () => ({
  prisma: {},
  prismaBase: {
    assinatura: {
      findFirst: mocks.assinaturaFindFirst,
      updateMany: mocks.assinaturaUpdateMany,
    },
    tenant: { findFirst: mocks.tenantFindFirst },
    configuracaoFiscal: { findFirst: mocks.cfgFindFirst },
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
    }),
  };
});

// A exportação é exercitada pela rota real, com o registry real; só a leitura
// de domínio é dublada. É o caminho que um cliente percorre.
vi.mock('@/server/services/comercial/cliente.service', () => ({
  clienteService: { listar: mocks.clienteListar },
}));

import { NextRequest } from 'next/server';
import { iniciarCheckout, abrirPortalCliente } from '../assinatura.service';
import { GET as GET_EXPORT } from '@/app/api/export/[modulo]/route';

const CTX = { tenantId: 'tenant-1', userId: 'user-1' };

/** A sessão de quem se registou há cinco minutos e ainda não confirmou o e-mail. */
const POR_CONFIRMAR = {
  user: {
    id: 'user-1',
    tenantId: 'tenant-1',
    permissions: ['clientes:ver'],
    emailVerificado: false,
  },
};

// Tenant em TRIAL, acabado de se registar — é exactamente quem tem o endereço
// por confirmar e quem se quer que consiga pagar.
const ASSINATURA = {
  id: 'ass-1',
  tenantId: 'tenant-1',
  planoAssinatura: 'PROFISSIONAL',
  ciclo: 'MENSAL',
  estado: 'TRIAL',
  stripeCustomerId: 'cus_123',
  stripeSubscriptionId: null,
  trialInicio: new Date('2026-09-01'),
  trialFim: new Date('2026-10-01'),
  dataAtivacao: null,
  dataCancelamento: null,
  motivoCancelamento: null,
  tentativasFalhadas: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(POR_CONFIRMAR);
  mocks.assinaturaFindFirst.mockResolvedValue(ASSINATURA);
  mocks.checkoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/xpto' });
  mocks.portalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/p/session/xpto' });
  mocks.clienteListar.mockResolvedValue({
    items: [{ codigo: 'C001', nome: 'Kanimambo, Lda', nuit: '400123456', email: null }],
    nextCursor: null,
  });
});

describe('pagar nunca é travado (ADR-0027 §6)', () => {
  it('o Checkout passa com o endereço por confirmar', async () => {
    const r = await iniciarCheckout({ planoId: 'PROFISSIONAL', ciclo: 'MENSAL' }, CTX);
    expect(r.url).toContain('checkout.stripe.com');
    expect(mocks.checkoutCreate).toHaveBeenCalledOnce();
  });

  it('o Portal de subscrição passa com o endereço por confirmar', async () => {
    const r = await abrirPortalCliente(CTX);
    expect(r.url).toContain('billing.stripe.com');
    expect(mocks.portalCreate).toHaveBeenCalledOnce();
  });
});

describe('exportar nunca é travado — os dados são do cliente', () => {
  function pedido(modulo: string, formato = 'csv') {
    return new NextRequest(`http://localhost:3000/api/export/${modulo}?formato=${formato}`);
  }
  const segmento = (modulo: string) => ({ params: Promise.resolve({ modulo }) });

  it('CSV sai com 200 e conteúdo, com o endereço por confirmar', async () => {
    const res = await GET_EXPORT(pedido('clientes'), segmento('clientes'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    await expect(res.text()).resolves.toContain('Kanimambo');
  });

  it('XLSX sai com 200, com o endereço por confirmar', async () => {
    const res = await GET_EXPORT(pedido('clientes', 'xlsx'), segmento('clientes'));
    expect(res.status).toBe(200);
  });
});
