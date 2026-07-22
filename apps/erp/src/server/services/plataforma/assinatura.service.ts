import 'server-only';
import type Stripe from 'stripe';
import type { Prisma } from '@prisma/client';
import { prismaBase } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { logger } from '@/server/observability/logger';
import type { Ctx } from '@/server/services/types';
import {
  bloqueiaAcesso,
  transicaoAssinaturaValida,
  type EstadoAssinatura,
} from '@/lib/state-machines';
import { TRIAL_DIAS, type CicloId, type PlanoId } from '@/lib/planos';
import {
  getStripe,
  getWebhookSecret,
  resolverPriceId,
  stripeConfigurado,
} from '@/server/billing/stripe-client';

/**
 * Ciclo de vida da subscrição SaaS — spec 19, Requisitos 3 a 6.
 *
 * Duas fronteiras muito diferentes vivem neste ficheiro:
 *
 *  - **Autenticada** (`iniciarCheckout`, `abrirPortalCliente`, `cancelar`,
 *    `obter`): chamada por Server Actions dentro do contexto de tenant. Ainda
 *    assim filtra por `tenantId` explicitamente — `findUnique`/`update` NÃO são
 *    scoped pela extensão.
 *  - **Webhook** (`processarEventoWebhook`): SEM sessão e SEM contexto de
 *    tenant. Usa sempre `prismaBase` e resolve o tenant a partir do
 *    `stripeCustomerId`/`stripeSubscriptionId` guardados por nós — nunca de
 *    metadata do evento, que é apenas texto que o Stripe devolve.
 */

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export interface AssinaturaRow {
  id: string;
  tenantId: string;
  planoAssinatura: PlanoId;
  ciclo: CicloId | null;
  estado: EstadoAssinatura;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  trialInicio: Date;
  trialFim: Date;
  dataAtivacao: Date | null;
  dataCancelamento: Date | null;
  motivoCancelamento: string | null;
  tentativasFalhadas: number;
  /** Dias que faltam para o fim do trial (0 se já passou ou não está em trial). */
  diasRestantesTrial: number;
  bloqueado: boolean;
}

type PrismaAssinatura = NonNullable<
  Awaited<ReturnType<typeof prismaBase.assinatura.findFirst>>
>;

function diasRestantes(fim: Date): number {
  const ms = fim.getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function mapAssinatura(a: PrismaAssinatura): AssinaturaRow {
  const estado = a.estado as EstadoAssinatura;
  return {
    id: a.id,
    tenantId: a.tenantId,
    planoAssinatura: a.planoAssinatura as PlanoId,
    ciclo: (a.ciclo as CicloId | null) ?? null,
    estado,
    stripeCustomerId: a.stripeCustomerId,
    stripeSubscriptionId: a.stripeSubscriptionId,
    trialInicio: a.trialInicio,
    trialFim: a.trialFim,
    dataAtivacao: a.dataAtivacao,
    dataCancelamento: a.dataCancelamento,
    motivoCancelamento: a.motivoCancelamento,
    tentativasFalhadas: a.tentativasFalhadas,
    diasRestantesTrial: estado === 'TRIAL' ? diasRestantes(a.trialFim) : 0,
    bloqueado: bloqueiaAcesso(estado),
  };
}

/** Assinatura do tenant do contexto. Cross-tenant é impossível: filtra por ctx. */
export async function obter(ctx: Ctx): Promise<AssinaturaRow> {
  const a = await prismaBase.assinatura.findFirst({ where: { tenantId: ctx.tenantId } });
  if (!a) throw new NotFoundError('Subscrição não encontrada');
  return mapAssinatura(a);
}

/** Variante tolerante para UI de tenants antigos (pré-spec 19), sem assinatura. */
export async function obterOuNulo(ctx: Ctx): Promise<AssinaturaRow | null> {
  const a = await prismaBase.assinatura.findFirst({ where: { tenantId: ctx.tenantId } });
  return a ? mapAssinatura(a) : null;
}

// ---------------------------------------------------------------------------
// Transições de estado + sincronização do bloqueio de acesso
// ---------------------------------------------------------------------------

/**
 * Mantém `ConfiguracaoFiscal.statusAtivo` em sintonia com o estado da
 * assinatura (Requisito 6.1). Chamada SEMPRE dentro da mesma transacção da
 * transição: se ficassem separadas, uma falha entre as duas deixaria um tenant
 * pago e bloqueado (ou cancelado e a usar o produto).
 */
export async function sincronizarStatusAtivo(
  tx: Prisma.TransactionClient,
  tenantId: string,
  estado: EstadoAssinatura,
): Promise<void> {
  await tx.configuracaoFiscal.updateMany({
    where: { tenantId },
    data: { statusAtivo: !bloqueiaAcesso(estado) },
  });
}

export interface PatchAssinatura {
  planoAssinatura?: PlanoId;
  ciclo?: CicloId | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  dataAtivacao?: Date | null;
  dataCancelamento?: Date | null;
  motivoCancelamento?: string | null;
  tentativasFalhadas?: number;
  trialFim?: Date;
}

/**
 * Aplica uma transição validada contra o estado ACTUAL e sincroniza o bloqueio.
 *
 * O Stripe não garante ordem de entrega de webhooks: uma transição que não
 * encaixa não é um erro fatal — é registada e ignorada (devolve `false`), como
 * manda o design. Transições explícitas da UI usam `estrito: true` e recebem
 * `BusinessRuleError('TRANSICAO_INVALIDA')`.
 */
export async function aplicarTransicao(
  tx: Prisma.TransactionClient,
  assinatura: { id: string; tenantId: string; estado: string },
  novoEstado: EstadoAssinatura,
  patch: PatchAssinatura = {},
  opts?: { estrito?: boolean },
): Promise<boolean> {
  const actual = assinatura.estado as EstadoAssinatura;

  if (!transicaoAssinaturaValida(actual, novoEstado)) {
    if (opts?.estrito) {
      throw new BusinessRuleError(
        'TRANSICAO_INVALIDA',
        `Transição de assinatura inválida: ${actual} → ${novoEstado}`,
      );
    }
    logger.warn(
      { tenantId: assinatura.tenantId, de: actual, para: novoEstado },
      '[assinatura] transição fora de ordem ignorada',
    );
    return false;
  }

  await tx.assinatura.updateMany({
    where: { id: assinatura.id, tenantId: assinatura.tenantId },
    data: {
      estado: novoEstado as never,
      ...(patch.planoAssinatura !== undefined
        ? { planoAssinatura: patch.planoAssinatura as never }
        : {}),
      ...(patch.ciclo !== undefined ? { ciclo: patch.ciclo as never } : {}),
      ...(patch.stripeCustomerId !== undefined
        ? { stripeCustomerId: patch.stripeCustomerId }
        : {}),
      ...(patch.stripeSubscriptionId !== undefined
        ? { stripeSubscriptionId: patch.stripeSubscriptionId }
        : {}),
      ...(patch.stripePriceId !== undefined ? { stripePriceId: patch.stripePriceId } : {}),
      ...(patch.dataAtivacao !== undefined ? { dataAtivacao: patch.dataAtivacao } : {}),
      ...(patch.dataCancelamento !== undefined
        ? { dataCancelamento: patch.dataCancelamento }
        : {}),
      ...(patch.motivoCancelamento !== undefined
        ? { motivoCancelamento: patch.motivoCancelamento }
        : {}),
      ...(patch.tentativasFalhadas !== undefined
        ? { tentativasFalhadas: patch.tentativasFalhadas }
        : {}),
      ...(patch.trialFim !== undefined ? { trialFim: patch.trialFim } : {}),
    },
  });

  await sincronizarStatusAtivo(tx, assinatura.tenantId, novoEstado);
  return true;
}

// ---------------------------------------------------------------------------
// Notificações (persistir-depois-enviar, spec 13)
// ---------------------------------------------------------------------------

/**
 * Persiste uma notificação PENDENTE para todos os administradores do tenant.
 * O envio de email é efeito colateral fora da transacção (o job/rota que chama
 * este serviço trata do despacho) — nunca I/O externo dentro da tx.
 */
export async function notificarAdministradores(
  tx: Prisma.TransactionClient,
  tenantId: string,
  dados: { titulo: string; mensagem: string },
): Promise<number> {
  const admins = await tx.user.findMany({
    where: {
      tenantId,
      ativo: true,
      deletedAt: null,
      roles: { some: { role: { permissions: { some: { permission: { code: 'assinatura:gerir' } } } } } },
    },
    select: { id: true },
  });

  if (admins.length === 0) return 0;

  await tx.notificacao.createMany({
    data: admins.map((u) => ({
      tenantId,
      userId: u.id,
      tipo: 'ALERTA_SISTEMA' as never,
      canal: 'EMAIL' as never,
      titulo: dados.titulo,
      mensagem: dados.mensagem,
      entidadeTipo: 'ASSINATURA',
      entidadeId: tenantId,
      estadoEnvio: 'PENDENTE' as never,
    })),
  });

  return admins.length;
}

// ---------------------------------------------------------------------------
// Checkout / Portal (fronteira autenticada)
// ---------------------------------------------------------------------------

function urlBase(): string {
  return (
    process.env.APP_URL ??
    process.env.NEXTAUTH_URL ??
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

/** Garante (e persiste) o `stripeCustomerId` do tenant. */
async function garantirCustomer(assinatura: AssinaturaRow, ctx: Ctx): Promise<string> {
  if (assinatura.stripeCustomerId) return assinatura.stripeCustomerId;

  const stripe = getStripe();
  const tenant = await prismaBase.tenant.findFirst({
    where: { id: ctx.tenantId },
    select: { nome: true, nuit: true },
  });
  const cfg = await prismaBase.configuracaoFiscal.findFirst({
    where: { tenantId: ctx.tenantId },
    select: { email: true },
  });

  const customer = await stripe.customers.create({
    name: tenant?.nome,
    email: cfg?.email ?? undefined,
    // Metadata é conveniência de suporte; a resolução de tenant nos webhooks
    // faz-se sempre pelo `stripeCustomerId` que guardamos, nunca por aqui.
    metadata: { tenantId: ctx.tenantId, nuit: tenant?.nuit ?? '' },
  });

  await prismaBase.assinatura.updateMany({
    where: { id: assinatura.id, tenantId: ctx.tenantId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

export interface ResultadoCheckout {
  url: string;
}

/**
 * Cria uma Checkout Session em modo `subscription` para o plano/ciclo pedidos.
 * O plano vem revalidado contra o catálogo server-side (`resolverPriceId`) —
 * nunca se confia num identificador de preço enviado pelo cliente.
 */
export async function iniciarCheckout(
  input: { planoId: PlanoId; ciclo: CicloId },
  ctx: Ctx,
): Promise<ResultadoCheckout> {
  const assinatura = await obter(ctx);
  const stripe = getStripe();
  const priceId = resolverPriceId(input.planoId, input.ciclo);
  const customerId = await garantirCustomer(assinatura, ctx);
  const base = urlBase();

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: ctx.tenantId,
    metadata: { tenantId: ctx.tenantId, planoId: input.planoId, ciclo: input.ciclo },
    subscription_data: {
      metadata: { tenantId: ctx.tenantId, planoId: input.planoId, ciclo: input.ciclo },
    },
    success_url: `${base}/definicoes/faturacao?checkout=sucesso`,
    cancel_url: `${base}/definicoes/faturacao?checkout=cancelado`,
  });

  if (!session.url) {
    throw new BusinessRuleError('CHECKOUT_SEM_URL', 'Não foi possível iniciar o pagamento.');
  }
  return { url: session.url };
}

/** Sessão do Billing Portal: mudar plano/cartão, ver facturas, cancelar. */
export async function abrirPortalCliente(ctx: Ctx): Promise<ResultadoCheckout> {
  const assinatura = await obter(ctx);
  if (!assinatura.stripeCustomerId) {
    throw new BusinessRuleError(
      'SEM_SUBSCRICAO_ATIVA',
      'Ainda não existe uma subscrição paga. Subscreva um plano primeiro.',
    );
  }
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: assinatura.stripeCustomerId,
    return_url: `${urlBase()}/definicoes/faturacao`,
  });
  return { url: session.url };
}

/**
 * Cancela a subscrição no fim do período pago. O estado local só muda quando o
 * Stripe confirmar (`customer.subscription.deleted`) — o Stripe é a fonte de
 * verdade e antecipar o `CANCELADA` bloquearia um tenant que ainda pagou o mês.
 */
export async function cancelarSubscricao(
  input: { motivo?: string },
  ctx: Ctx,
): Promise<{ fimDoPeriodo: boolean }> {
  const assinatura = await obter(ctx);

  if (!assinatura.stripeSubscriptionId) {
    // Trial sem subscrição Stripe: cancela localmente (nada a cobrar).
    await prismaBase.$transaction(async (tx) => {
      await aplicarTransicao(
        tx,
        { id: assinatura.id, tenantId: ctx.tenantId, estado: assinatura.estado },
        'CANCELADA',
        { dataCancelamento: new Date(), motivoCancelamento: input.motivo ?? null },
        { estrito: true },
      );
    });
    return { fimDoPeriodo: false };
  }

  const stripe = getStripe();
  await stripe.subscriptions.update(assinatura.stripeSubscriptionId, {
    cancel_at_period_end: true,
    ...(input.motivo ? { cancellation_details: { comment: input.motivo } } : {}),
  });

  await prismaBase.assinatura.updateMany({
    where: { id: assinatura.id, tenantId: ctx.tenantId },
    data: { motivoCancelamento: input.motivo ?? null },
  });

  return { fimDoPeriodo: true };
}

// ---------------------------------------------------------------------------
// Subscrição de trial criada em background (best-effort)
// ---------------------------------------------------------------------------

/**
 * Cria no Stripe o `Customer` + a subscrição em trial (sem exigir cartão).
 * É *best-effort*: corre fora da transacção de provisionamento e uma falha
 * NUNCA impede o acesso ao trial já provisionado localmente. O cron de fallback
 * (`expirarTrialsVencidos`) cobre o caso de o Stripe nunca chegar a saber deste
 * tenant.
 */
export async function criarSubscricaoTrial(
  tenantId: string,
  planoId: PlanoId,
  ciclo: CicloId = 'MENSAL',
): Promise<{ criada: boolean; motivo?: string }> {
  if (!stripeConfigurado()) return { criada: false, motivo: 'stripe_nao_configurado' };

  try {
    const stripe = getStripe();
    const priceId = resolverPriceId(planoId, ciclo);

    const assinatura = await prismaBase.assinatura.findFirst({
      where: { tenantId },
      select: { id: true, stripeCustomerId: true, stripeSubscriptionId: true },
    });
    if (!assinatura) return { criada: false, motivo: 'assinatura_inexistente' };
    if (assinatura.stripeSubscriptionId) return { criada: false, motivo: 'ja_existe' };

    const tenant = await prismaBase.tenant.findFirst({
      where: { id: tenantId },
      select: { nome: true, nuit: true },
    });
    const cfg = await prismaBase.configuracaoFiscal.findFirst({
      where: { tenantId },
      select: { email: true },
    });

    const customerId =
      assinatura.stripeCustomerId ??
      (
        await stripe.customers.create({
          name: tenant?.nome,
          email: cfg?.email ?? undefined,
          metadata: { tenantId, nuit: tenant?.nuit ?? '' },
        })
      ).id;

    const subscricao = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      trial_period_days: TRIAL_DIAS,
      // Trial sem cartão: não recolher método de pagamento antes de ser preciso.
      payment_behavior: 'default_incomplete',
      trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
      metadata: { tenantId, planoId, ciclo },
    });

    await prismaBase.assinatura.updateMany({
      where: { id: assinatura.id, tenantId },
      data: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscricao.id,
        stripePriceId: priceId,
        ciclo: ciclo as never,
      },
    });

    return { criada: true };
  } catch (e) {
    logger.error(
      { tenantId, err: (e as Error)?.message },
      '[assinatura] falha a criar subscrição de trial no Stripe (trial local mantém-se)',
    );
    return { criada: false, motivo: 'erro_stripe' };
  }
}

// ---------------------------------------------------------------------------
// Webhooks Stripe
// ---------------------------------------------------------------------------

export interface ResultadoWebhook {
  /** `true` quando o evento já tinha sido processado (reentrega). */
  duplicado: boolean;
  tipo: string;
  tenantId: string | null;
  transitou: boolean;
}

/** Verifica a assinatura do evento. Lança se o corpo/assinatura não conferirem. */
export function verificarAssinaturaWebhook(rawBody: string | Buffer, assinatura: string): Stripe.Event {
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(rawBody, assinatura, getWebhookSecret());
}

function extrairCustomerId(valor: unknown): string | null {
  if (typeof valor === 'string') return valor;
  if (valor && typeof valor === 'object' && 'id' in valor) {
    const id = (valor as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

/** Resolve o tenant a partir das referências Stripe que NÓS guardámos. */
async function resolverTenant(
  customerId: string | null,
  subscriptionId: string | null,
): Promise<{ id: string; tenantId: string; estado: string } | null> {
  if (subscriptionId) {
    const porSub = await prismaBase.assinatura.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
      select: { id: true, tenantId: true, estado: true },
    });
    if (porSub) return porSub;
  }
  if (customerId) {
    const porCustomer = await prismaBase.assinatura.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true, tenantId: true, estado: true },
    });
    if (porCustomer) return porCustomer;
  }
  return null;
}

function estadoDeStatusStripe(status: string): EstadoAssinatura | null {
  switch (status) {
    case 'trialing':
      return 'TRIAL';
    case 'active':
      return 'ATIVA';
    case 'past_due':
    case 'unpaid':
      return 'SUSPENSA';
    case 'canceled':
    case 'incomplete_expired':
      return 'CANCELADA';
    default:
      return null;
  }
}

/**
 * Processa um evento Stripe **no máximo uma vez**.
 *
 * A garantia de idempotência é o `@unique` em `EventoWebhookStripe.stripeEventId`:
 * o registo é inserido ANTES da lógica de negócio, dentro da mesma transacção.
 * Uma reentrega colide no índice e devolve `duplicado: true` com 200 — o Stripe
 * pára de reentregar e nada é reprocessado.
 */
export async function processarEventoWebhook(evento: Stripe.Event): Promise<ResultadoWebhook> {
  // Pré-verificação barata (fora da tx) para reentregas frequentes.
  const jaVisto = await prismaBase.eventoWebhookStripe.findUnique({
    where: { stripeEventId: evento.id },
    select: { id: true, tenantId: true },
  });
  if (jaVisto) {
    return { duplicado: true, tipo: evento.type, tenantId: jaVisto.tenantId, transitou: false };
  }

  // A união de todos os objectos Stripe não é indexável por string; o acesso é
  // feito campo a campo, com verificação de tipo em cada extracção.
  const objecto = evento.data.object as unknown as Record<string, unknown>;
  const customerId = extrairCustomerId(objecto.customer);
  const subscriptionId =
    evento.type.startsWith('customer.subscription')
      ? (typeof objecto.id === 'string' ? objecto.id : null)
      : extrairCustomerId(objecto.subscription);

  const alvo = await resolverTenant(customerId, subscriptionId);

  try {
    return await prismaBase.$transaction(async (tx) => {
      // Trava de idempotência — falha por P2002 se outra entrega ganhou a corrida.
      await tx.eventoWebhookStripe.create({
        data: {
          stripeEventId: evento.id,
          tipo: evento.type,
          tenantId: alvo?.tenantId ?? null,
        },
      });

      if (!alvo) {
        logger.warn(
          { evento: evento.type, customerId, subscriptionId },
          '[webhook-stripe] evento sem tenant correspondente — registado e ignorado',
        );
        return { duplicado: false, tipo: evento.type, tenantId: null, transitou: false };
      }

      const transitou = await aplicarEvento(tx, evento, alvo, {
        customerId,
        subscriptionId,
        objecto,
      });

      return { duplicado: false, tipo: evento.type, tenantId: alvo.tenantId, transitou };
    });
  } catch (e) {
    // Corrida entre duas entregas do MESMO evento: a perdedora vê P2002.
    if ((e as { code?: string })?.code === 'P2002') {
      return { duplicado: true, tipo: evento.type, tenantId: alvo?.tenantId ?? null, transitou: false };
    }
    throw e;
  }
}

async function aplicarEvento(
  tx: Prisma.TransactionClient,
  evento: Stripe.Event,
  alvo: { id: string; tenantId: string; estado: string },
  ctx: {
    customerId: string | null;
    subscriptionId: string | null;
    objecto: Record<string, unknown>;
  },
): Promise<boolean> {
  const { objecto } = ctx;
  const agora = new Date();

  switch (evento.type) {
    case 'checkout.session.completed': {
      const subId = extrairCustomerId(objecto.subscription);
      return aplicarTransicao(tx, alvo, 'ATIVA', {
        stripeCustomerId: ctx.customerId ?? undefined,
        stripeSubscriptionId: subId ?? undefined,
        dataAtivacao: agora,
        dataCancelamento: null,
        motivoCancelamento: null,
        tentativasFalhadas: 0,
      });
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const status = typeof objecto.status === 'string' ? objecto.status : '';
      const novoEstado = estadoDeStatusStripe(status);
      if (!novoEstado) return false;

      const priceId = extrairPriceId(objecto);
      const patch: PatchAssinatura = {
        stripeSubscriptionId: ctx.subscriptionId ?? undefined,
        stripeCustomerId: ctx.customerId ?? undefined,
        ...(priceId ? { stripePriceId: priceId } : {}),
        ...(novoEstado === 'ATIVA' ? { dataAtivacao: agora, tentativasFalhadas: 0 } : {}),
        ...(novoEstado === 'CANCELADA' ? { dataCancelamento: agora } : {}),
      };
      return aplicarTransicao(tx, alvo, novoEstado, patch);
    }

    case 'customer.subscription.deleted': {
      const transitou = await aplicarTransicao(tx, alvo, 'CANCELADA', {
        dataCancelamento: agora,
      });
      if (transitou) {
        await notificarAdministradores(tx, alvo.tenantId, {
          titulo: 'Subscrição cancelada',
          mensagem:
            'A subscrição do GestPro foi cancelada. O acesso à aplicação fica suspenso até nova subscrição.',
        });
      }
      return transitou;
    }

    case 'invoice.paid': {
      const transitou = await aplicarTransicao(tx, alvo, 'ATIVA', {
        dataAtivacao: alvo.estado === 'ATIVA' ? undefined : agora,
        tentativasFalhadas: 0,
      });
      if (transitou && alvo.estado === 'SUSPENSA') {
        await notificarAdministradores(tx, alvo.tenantId, {
          titulo: 'Subscrição reactivada',
          mensagem: 'O pagamento foi recebido e o acesso ao GestPro foi reposto.',
        });
      }
      return transitou;
    }

    case 'invoice.payment_failed': {
      const registo = await tx.assinatura.findFirst({
        where: { id: alvo.id, tenantId: alvo.tenantId },
        select: { tentativasFalhadas: true },
      });
      const tentativas = (registo?.tentativasFalhadas ?? 0) + 1;

      // O Stripe marca a subscrição `unpaid`/`past_due` quando esgota o dunning;
      // até lá só contamos as tentativas e avisamos.
      const status = typeof objecto.status === 'string' ? objecto.status : '';
      const proximaTentativa = objecto.next_payment_attempt;
      const dunningEsgotado =
        proximaTentativa === null || status === 'uncollectible' || tentativas >= 4;

      if (dunningEsgotado) {
        const transitou = await aplicarTransicao(tx, alvo, 'SUSPENSA', {
          tentativasFalhadas: tentativas,
        });
        await notificarAdministradores(tx, alvo.tenantId, {
          titulo: 'Subscrição suspensa por falta de pagamento',
          mensagem:
            'Não conseguimos cobrar a subscrição do GestPro. Actualize o método de pagamento para repor o acesso.',
        });
        return transitou;
      }

      await tx.assinatura.updateMany({
        where: { id: alvo.id, tenantId: alvo.tenantId },
        data: { tentativasFalhadas: tentativas },
      });
      await notificarAdministradores(tx, alvo.tenantId, {
        titulo: 'Pagamento da subscrição falhou',
        mensagem:
          'A cobrança da subscrição do GestPro não foi concluída. Vamos tentar novamente; verifique o método de pagamento.',
      });
      return false;
    }

    case 'customer.subscription.trial_will_end': {
      // Não transita estado — apenas avisa (3 dias antes, pelo Stripe).
      await notificarAdministradores(tx, alvo.tenantId, {
        titulo: 'O período de teste termina em breve',
        mensagem:
          'O teste gratuito do GestPro está a terminar. Subscreva um plano para manter o acesso.',
      });
      return false;
    }

    default:
      logger.info({ tipo: evento.type }, '[webhook-stripe] evento sem tratamento — registado');
      return false;
  }
}

function extrairPriceId(objecto: Record<string, unknown>): string | null {
  const items = objecto.items as { data?: Array<{ price?: { id?: string } }> } | undefined;
  return items?.data?.[0]?.price?.id ?? null;
}

// ---------------------------------------------------------------------------
// Cron de fallback — expiração local de trials
// ---------------------------------------------------------------------------

export interface ResultadoExpiracao {
  avaliadas: number;
  expiradas: number;
}

/**
 * Belt-and-suspenders do trial: expira localmente qualquer tenant em `TRIAL`
 * cujo `trialFim` já passou e cujo evento Stripe não chegou (falha de entrega
 * de webhook). Idempotente — pode correr as vezes que forem precisas.
 */
export async function expirarTrialsVencidos(agora: Date = new Date()): Promise<ResultadoExpiracao> {
  const candidatas = await prismaBase.assinatura.findMany({
    where: { estado: 'TRIAL', trialFim: { lt: agora } },
    select: { id: true, tenantId: true, estado: true },
  });

  let expiradas = 0;
  for (const a of candidatas) {
    await prismaBase.$transaction(async (tx) => {
      const transitou = await aplicarTransicao(tx, a, 'EXPIRADO', {});
      if (transitou) {
        expiradas++;
        await notificarAdministradores(tx, a.tenantId, {
          titulo: 'Período de teste terminado',
          mensagem:
            'O teste gratuito do GestPro terminou. Subscreva um plano para repor o acesso à aplicação.',
        });
      }
    });
  }

  return { avaliadas: candidatas.length, expiradas };
}

export const assinaturaService = {
  obter,
  obterOuNulo,
  iniciarCheckout,
  abrirPortalCliente,
  cancelarSubscricao,
  criarSubscricaoTrial,
  verificarAssinaturaWebhook,
  processarEventoWebhook,
  sincronizarStatusAtivo,
  aplicarTransicao,
  expirarTrialsVencidos,
};
