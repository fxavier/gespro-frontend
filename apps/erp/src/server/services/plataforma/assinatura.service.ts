import 'server-only';
import type Stripe from 'stripe';
import type { Prisma } from '@prisma/client';
import { prismaBase } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { logger } from '@/server/observability/logger';
import type { Ctx } from '@/server/services/types';
import {
  LEITURA_DIAS,
  estadoDeAcesso,
  transicaoAssinaturaValida,
  type EstadoAcesso,
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
  /** Instante em que o acesso fecha. Nulo fora de `LEITURA`. */
  leituraFim: Date | null;
  dataAtivacao: Date | null;
  dataCancelamento: Date | null;
  motivoCancelamento: string | null;
  tentativasFalhadas: number;
  /** Dias que faltam para o fim do trial (0 se já passou ou não está em trial). */
  diasRestantesTrial: number;
  /** Dias até o acesso fechar. Zero fora de `LEITURA`. */
  diasRestantesLeitura: number;
  /**
   * Nível de acesso do tenant (ADR-0032 §4). Quem vê este DTO está dentro do
   * produto, logo não foi fechado pela GestPro — daí o segundo argumento ser
   * sempre `false` aqui. A arbitragem completa vive no `auth.ts`.
   */
  acesso: EstadoAcesso;
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
    leituraFim: a.leituraFim,
    diasRestantesTrial: estado === 'TRIAL' ? diasRestantes(a.trialFim) : 0,
    diasRestantesLeitura:
      estado === 'LEITURA' && a.leituraFim ? diasRestantes(a.leituraFim) : 0,
    acesso: estadoDeAcesso(estado, false),
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

/**
 * Despacha, depois do commit, as notificações escritas dentro da transacção.
 *
 * O import é **tardio de propósito**: `notificacao.service` escolhe e constrói
 * o provider de e-mail no momento em que é carregado (singleton por variável de
 * ambiente), e o ciclo de vida das subscrições tem de poder ser carregado sem
 * pilha de e-mail nenhuma — é o que acontece no webhook e nos testes. O custo é
 * zero: isto só corre quando há mesmo alguma coisa para enviar.
 */
async function despacharNotificacoes(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { despacharNotificacoes: despachar } = await import('./notificacao.service');
  await despachar(ids);
}

// ---------------------------------------------------------------------------
// Transições de estado
// ---------------------------------------------------------------------------

/**
 * Instante em que o acesso fecha, a contar de agora (ADR-0027 §6).
 * Um prazo só para as três saídas: fim de Trial, cancelamento e falta de
 * pagamento. Três prazos diferentes é o que ninguém acerta a implementar nem
 * consegue explicar ao cliente.
 */
export function fimDaLeitura(agora: Date = new Date()): Date {
  return new Date(agora.getTime() + LEITURA_DIAS * 24 * 60 * 60 * 1000);
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
  leituraFim?: Date | null;
}

/**
 * Aplica uma transição validada contra o estado ACTUAL e sincroniza o bloqueio.
 *
 * **Compare-and-set, não check-then-act.** O `estado` lido entra no `where` do
 * `UPDATE`: se outro evento transitou a assinatura entretanto, o update afecta
 * zero linhas e esta transição é declarada perdida. Sem isto, um
 * `invoice.payment_failed` e um `invoice.paid` entregues em paralelo lêem o
 * mesmo estado, ambos validam, e o último a escrever ganha — um tenant que
 * pagou podia ficar `SUSPENSA` (e sem acesso) até ao ciclo seguinte. Mesmo
 * padrão do consumo de `jti` em `handoff.service.ts` e do token de verificação
 * de email.
 *
 * O Stripe não garante ordem de entrega: uma transição que não encaixa não é um
 * erro fatal — é registada e ignorada (devolve `false`). Transições explícitas
 * da UI usam `estrito: true` e recebem `BusinessRuleError('TRANSICAO_INVALIDA')`.
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

  const { count } = await tx.assinatura.updateMany({
    // `estado: actual` é a trava: só escreve quem ainda vê o estado que leu.
    where: { id: assinatura.id, tenantId: assinatura.tenantId, estado: actual as never },
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
      ...(patch.leituraFim !== undefined ? { leituraFim: patch.leituraFim } : {}),
    },
  });

  if (count !== 1) {
    // Outro evento chegou primeiro e mudou o estado sob os nossos pés: a
    // transição é declarada perdida, e não se escreve mais nada — sobrescrever
    // seria desfazer a decisão de quem ganhou.
    logger.warn(
      { tenantId: assinatura.tenantId, de: actual, para: novoEstado },
      '[assinatura] transição perdida por corrida — estado mudou entretanto',
    );
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Notificações (persistir-depois-enviar, spec 13)
// ---------------------------------------------------------------------------

/**
 * Persiste uma notificação PENDENTE para todos os administradores do tenant e
 * devolve os ids criados.
 *
 * **Os ids não são decoração: são a metade que faltava.** O padrão da casa é
 * «persistir-depois-enviar», e esta função só fazia a primeira metade — nada
 * varria as PENDENTE, e nenhum e-mail de subscrição alguma vez saiu. Quem
 * chama guarda os ids e chama `despacharNotificacoes()` **depois do commit**;
 * I/O externo dentro de uma transacção continua proibido (ADR-0032).
 */
export async function notificarAdministradores(
  tx: Prisma.TransactionClient,
  tenantId: string,
  dados: { titulo: string; mensagem: string },
): Promise<string[]> {
  const admins = await tx.user.findMany({
    where: {
      tenantId,
      ativo: true,
      deletedAt: null,
      roles: { some: { role: { permissions: { some: { permission: { code: 'assinatura:gerir' } } } } } },
    },
    select: { id: true },
  });

  if (admins.length === 0) return [];

  const criadas = await tx.notificacao.createManyAndReturn({
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
    select: { id: true },
  });

  return criadas.map((n) => n.id);
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
      const agora = new Date();
      await aplicarTransicao(
        tx,
        { id: assinatura.id, tenantId: ctx.tenantId, estado: assinatura.estado },
        'LEITURA',
        {
          dataCancelamento: agora,
          motivoCancelamento: input.motivo ?? null,
          leituraFim: fimDaLeitura(agora),
        },
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

    let customerId = assinatura.stripeCustomerId;
    if (!customerId) {
      customerId = (
        await stripe.customers.create({
          name: tenant?.nome,
          email: cfg?.email ?? undefined,
          metadata: { tenantId, nuit: tenant?.nuit ?? '' },
        })
      ).id;

      // Persistir ANTES de criar a subscrição: o Stripe pode disparar
      // `customer.subscription.created` antes de `subscriptions.create()`
      // retornar, e sem o `stripeCustomerId` gravado o webhook não resolve o
      // tenant. É a janela que obriga o handler a devolver 5xx nesse caso.
      await prismaBase.assinatura.updateMany({
        where: { id: assinatura.id, tenantId },
        data: { stripeCustomerId: customerId },
      });
    }

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
  /**
   * `true` quando é um evento de faturação que nos diz respeito mas cujo tenant
   * não foi possível resolver. O evento NÃO fica registado: o chamador tem de
   * devolver 5xx para o Stripe reentregar.
   */
  naoResolvido: boolean;
}

/**
 * Tipos cujo processamento depende de haver um tenant resolvido. Se um destes
 * chegar sem alvo, é uma falha temporária (a subscrição pode estar a ser criada
 * neste preciso momento), não um evento a ignorar.
 */
function exigeTenantResolvido(tipo: string): boolean {
  return (
    tipo.startsWith('checkout.session.') ||
    tipo.startsWith('customer.subscription.') ||
    tipo.startsWith('invoice.')
  );
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
    // As três saídas convergem em LEITURA (ADR-0027 §6): o cliente vê e
    // exporta o que é seu durante trinta dias, e pode pagar para voltar.
    case 'past_due':
    case 'unpaid':
      return 'LEITURA';
    // Subscrição em pausa (`pause_collection`): o Stripe deixa de cobrar. Sem
    // este ramo a assinatura ficava `ATIVA` para sempre — acesso gratuito
    // indefinido, sem nenhum evento posterior a corrigi-lo.
    case 'paused':
      return 'LEITURA';
    case 'canceled':
    case 'incomplete_expired':
      return 'LEITURA';
    // `incomplete`: a primeira factura ainda não foi paga (ex.: 3-D Secure
    // pendente). Deliberadamente não transita — o desfecho chega a seguir como
    // `active` ou `incomplete_expired`, e bloquear aqui tiraria o acesso a quem
    // está a meio da autenticação do cartão.
    case 'incomplete':
      return null;
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
 *
 * **Excepção deliberada**: um evento de faturação cujo tenant não foi resolvido
 * NÃO é registado. Registá-lo tornaria a perda permanente — o Stripe receberia
 * 200, deixaria de reentregar, e uma reentrega manual bateria na trava de
 * idempotência. A janela é real: `criarSubscricaoTrial` chama o Stripe e só
 * depois grava `stripeCustomerId`/`stripeSubscriptionId`, pelo que um webhook
 * pode chegar antes de existir por quem procurar.
 */
export async function processarEventoWebhook(evento: Stripe.Event): Promise<ResultadoWebhook> {
  // Pré-verificação barata (fora da tx) para reentregas frequentes.
  const jaVisto = await prismaBase.eventoWebhookStripe.findUnique({
    where: { stripeEventId: evento.id },
    select: { id: true, tenantId: true },
  });
  if (jaVisto) {
    return {
      duplicado: true,
      tipo: evento.type,
      tenantId: jaVisto.tenantId,
      transitou: false,
      naoResolvido: false,
    };
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

  if (!alvo) {
    // Nada é gravado: a decisão de reentregar (ou não) fica com o chamador.
    if (exigeTenantResolvido(evento.type)) {
      logger.error(
        {
          evento: evento.type,
          eventoId: evento.id,
          customerId,
          subscriptionId,
          alerta: 'webhook_stripe_tenant_nao_resolvido',
        },
        '[webhook-stripe] evento de faturação sem tenant — reentrega necessária',
      );
      return {
        duplicado: false,
        tipo: evento.type,
        tenantId: null,
        transitou: false,
        naoResolvido: true,
      };
    }

    // Tipos que não nos dizem respeito (ex.: `customer.updated` de um cliente
    // que não é nosso): 200 e seguir em frente, sem sujar o livro de eventos.
    logger.info(
      { evento: evento.type, customerId, subscriptionId },
      '[webhook-stripe] evento sem tenant e sem impacto — ignorado',
    );
    return {
      duplicado: false,
      tipo: evento.type,
      tenantId: null,
      transitou: false,
      naoResolvido: false,
    };
  }

  // Ids das notificações escritas dentro da transacção. O envio é depois do
  // commit: I/O externo lá dentro prenderia a ligação e, se falhasse, desfazia
  // uma transição de estado por causa de um e-mail.
  const pendentes: string[] = [];

  try {
    const resultado = await prismaBase.$transaction(async (tx) => {
      // Trava de idempotência — falha por P2002 se outra entrega ganhou a corrida.
      await tx.eventoWebhookStripe.create({
        data: {
          stripeEventId: evento.id,
          tipo: evento.type,
          tenantId: alvo.tenantId,
        },
      });

      const transitou = await aplicarEvento(tx, evento, alvo, {
        customerId,
        subscriptionId,
        objecto,
        pendentes,
      });

      return {
        duplicado: false,
        tipo: evento.type,
        tenantId: alvo.tenantId,
        transitou,
        naoResolvido: false,
      };
    });

    await despacharNotificacoes(pendentes);
    return resultado;
  } catch (e) {
    // Corrida entre duas entregas do MESMO evento: a perdedora vê P2002.
    if ((e as { code?: string })?.code === 'P2002') {
      return {
        duplicado: true,
        tipo: evento.type,
        tenantId: alvo.tenantId,
        transitou: false,
        naoResolvido: false,
      };
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
    /** Acumulador de notificações a despachar DEPOIS do commit. */
    pendentes: string[];
  },
): Promise<boolean> {
  const { objecto } = ctx;
  const agora = new Date();

  switch (evento.type) {
    case 'checkout.session.completed': {
      // `completed` significa que o fluxo terminou, NÃO que foi pago. Uma sessão
      // pode completar-se com `payment_status: 'unpaid'` (ex.: débito directo a
      // liquidar); activar aí dava acesso a quem ainda não pagou.
      const modo = typeof objecto.mode === 'string' ? objecto.mode : '';
      if (modo !== 'subscription') {
        logger.info(
          { tenantId: alvo.tenantId, modo },
          '[webhook-stripe] checkout fora do modo subscription — ignorado',
        );
        return false;
      }

      const estadoPagamento =
        typeof objecto.payment_status === 'string' ? objecto.payment_status : '';
      if (estadoPagamento !== 'paid' && estadoPagamento !== 'no_payment_required') {
        logger.warn(
          { tenantId: alvo.tenantId, estadoPagamento },
          '[webhook-stripe] checkout completo mas não pago — sem activação',
        );
        return false;
      }

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
        ...(novoEstado === 'ATIVA'
          ? { dataAtivacao: agora, tentativasFalhadas: 0, leituraFim: null }
          : {}),
        ...(novoEstado === 'LEITURA' ? { leituraFim: fimDaLeitura(agora) } : {}),
      };
      return aplicarTransicao(tx, alvo, novoEstado, patch);
    }

    case 'customer.subscription.deleted': {
      const transitou = await aplicarTransicao(tx, alvo, 'LEITURA', {
        dataCancelamento: agora,
        leituraFim: fimDaLeitura(agora),
      });
      if (transitou) {
        ctx.pendentes.push(
          ...(await notificarAdministradores(tx, alvo.tenantId, {
            titulo: 'Subscrição cancelada',
            mensagem:
              `A subscrição do GestPro foi cancelada. Durante ${LEITURA_DIAS} dias continua a poder ` +
              'entrar, consultar e exportar tudo o que é seu; deixa de poder gravar. Subscreva um ' +
              'plano quando quiser — nada se perde.',
          })),
        );
      }
      return transitou;
    }

    case 'invoice.paid': {
      const transitou = await aplicarTransicao(tx, alvo, 'ATIVA', {
        dataAtivacao: alvo.estado === 'ATIVA' ? undefined : agora,
        tentativasFalhadas: 0,
        leituraFim: null,
      });
      if (transitou && alvo.estado !== 'ATIVA' && alvo.estado !== 'TRIAL') {
        ctx.pendentes.push(
          ...(await notificarAdministradores(tx, alvo.tenantId, {
            titulo: 'Subscrição reactivada',
            mensagem: 'O pagamento foi recebido e o acesso ao GestPro foi reposto.',
          })),
        );
      }
      return transitou;
    }

    case 'invoice.payment_failed': {
      const registo = await tx.assinatura.findFirst({
        where: { id: alvo.id, tenantId: alvo.tenantId },
        select: { tentativasFalhadas: true },
      });
      const tentativas = (registo?.tentativasFalhadas ?? 0) + 1;

      // O contador é gravado SEMPRE e primeiro, num update próprio. Se fosse só
      // um campo do patch da transição, uma transição inválida (ex.: a partir de
      // TRIAL, que não pode ir para SUSPENSA) descartava-o — e o dunning
      // reiniciava do zero a cada falha, sem nunca chegar à suspensão.
      await tx.assinatura.updateMany({
        where: { id: alvo.id, tenantId: alvo.tenantId },
        data: { tentativasFalhadas: tentativas },
      });

      // O Stripe marca a subscrição `unpaid`/`past_due` quando esgota o dunning;
      // até lá só contamos as tentativas e avisamos.
      const status = typeof objecto.status === 'string' ? objecto.status : '';
      const proximaTentativa = objecto.next_payment_attempt;
      const dunningEsgotado =
        proximaTentativa === null || status === 'uncollectible' || tentativas >= 4;

      if (dunningEsgotado) {
        const transitou = await aplicarTransicao(tx, alvo, 'LEITURA', {
          leituraFim: fimDaLeitura(agora),
        });
        ctx.pendentes.push(
          ...(await notificarAdministradores(tx, alvo.tenantId, {
            titulo: 'Subscrição em modo de leitura por falta de pagamento',
            mensagem:
              'Não conseguimos cobrar a subscrição do GestPro. Continua a poder entrar, consultar e ' +
              `exportar tudo o que é seu durante ${LEITURA_DIAS} dias; deixa de poder gravar. ` +
              'Actualize o método de pagamento para repor o acesso completo.',
          })),
        );
        return transitou;
      }

      ctx.pendentes.push(
          ...(await notificarAdministradores(tx, alvo.tenantId, {
            titulo: 'Pagamento da subscrição falhou',
            mensagem:
            'A cobrança da subscrição do GestPro não foi concluída. Vamos tentar novamente; verifique o método de pagamento.',
          })),

      );
      return false;
    }

    case 'customer.subscription.trial_will_end': {
      // Não transita estado — apenas avisa (3 dias antes, pelo Stripe).
      ctx.pendentes.push(
          ...(await notificarAdministradores(tx, alvo.tenantId, {
            titulo: 'O período de teste termina em breve',
            mensagem:
            'O teste gratuito do GestPro está a terminar. Subscreva um plano para manter o acesso.',
          })),
      );
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
// Processo agendado — as duas pontas da Leitura
// ---------------------------------------------------------------------------

export interface ResultadoCicloVida {
  /** Trials cujo prazo passou e que entraram em Leitura. */
  trialsEmLeitura: number;
  /** Assinaturas em Leitura cujo prazo passou e que fecharam. */
  fechadas: number;
  /** Avisos de pré-fecho enviados nesta corrida. */
  avisos: number;
  /** Total de candidatas lidas (as três pernas somadas). */
  avaliadas: number;
}

/** Dias de antecedência do aviso de que o acesso vai fechar. */
export const AVISO_PRE_FECHO_DIAS = 7;

/**
 * Faz avançar o ciclo de vida das subscrições. Três pernas, uma só corrida
 * diária (ADR-0032; ticket #36 — «natural estender o que já expira os Trials,
 * em vez de criar um quarto»):
 *
 *   1. `TRIAL` com `trialFim` passado  → `LEITURA`, e o relógio dos 30 dias
 *      começa a contar.
 *   2. `LEITURA` a sete dias do fim    → aviso, uma única vez.
 *   3. `LEITURA` com `leituraFim` passado → `FECHADA`. **Nada se apaga**
 *      (ADR-0027 §7): os dados ficam indefinidamente, e apagar é um acto
 *      pedido pelo cliente.
 *
 * **Idempotente.** O `findMany` só produz candidatas; quem decide é o
 * compare-and-set dentro de `aplicarTransicao` (o `where` inclui o estado
 * lido). Se um `checkout.session.completed` activar o tenant entre a leitura e
 * a escrita, o update afecta zero linhas e o processo não lhe tira nada. O
 * aviso protege-se com `avisoPreFechoEm`, pela mesma razão.
 *
 * Os e-mails saem **depois** de cada commit — nunca dentro da transacção.
 */
export async function processarCicloDeVida(
  agora: Date = new Date(),
): Promise<ResultadoCicloVida> {
  const resultado: ResultadoCicloVida = {
    trialsEmLeitura: 0,
    fechadas: 0,
    avisos: 0,
    avaliadas: 0,
  };

  // 1. Fim do Trial → Leitura
  const trials = await prismaBase.assinatura.findMany({
    where: { estado: 'TRIAL', trialFim: { lt: agora } },
    select: { id: true, tenantId: true, estado: true },
  });
  resultado.avaliadas += trials.length;

  for (const a of trials) {
    const pendentes: string[] = [];
    await prismaBase.$transaction(async (tx) => {
      const transitou = await aplicarTransicao(tx, a, 'LEITURA', {
        leituraFim: fimDaLeitura(agora),
      });
      if (!transitou) return;
      resultado.trialsEmLeitura++;
      pendentes.push(
        ...(await notificarAdministradores(tx, a.tenantId, {
          titulo: 'O período de teste terminou',
          mensagem:
            `O teste gratuito do GestPro terminou. Durante ${LEITURA_DIAS} dias continua a entrar, ` +
            'a consultar e a exportar tudo o que é seu — deixa de poder gravar. Subscreva um plano ' +
            'para repor o acesso completo; nada se perde.',
        })),
      );
    });
    await despacharNotificacoes(pendentes);
  }

  // 2. Aviso de pré-fecho, uma única vez por passagem pela Leitura
  const limiteAviso = new Date(agora.getTime() + AVISO_PRE_FECHO_DIAS * 24 * 60 * 60 * 1000);
  const aAvisar = await prismaBase.assinatura.findMany({
    where: {
      estado: 'LEITURA',
      avisoPreFechoEm: null,
      leituraFim: { gte: agora, lte: limiteAviso },
    },
    select: { id: true, tenantId: true, leituraFim: true },
  });
  resultado.avaliadas += aAvisar.length;

  for (const a of aAvisar) {
    const pendentes: string[] = [];
    await prismaBase.$transaction(async (tx) => {
      // Trava por compare-and-set, como as transições: duas corridas em
      // paralelo não mandam dois avisos.
      const { count } = await tx.assinatura.updateMany({
        where: { id: a.id, tenantId: a.tenantId, avisoPreFechoEm: null },
        data: { avisoPreFechoEm: agora },
      });
      if (count !== 1) return;
      resultado.avisos++;
      const dias = a.leituraFim ? Math.max(0, diasRestantes(a.leituraFim)) : AVISO_PRE_FECHO_DIAS;
      pendentes.push(
        ...(await notificarAdministradores(tx, a.tenantId, {
          titulo: 'O acesso ao GestPro fecha dentro de dias',
          mensagem:
            `Faltam ${dias} dias para o acesso à sua conta fechar. Os dados ficam onde estão e não ` +
            'se apagam — mas deixa de poder entrar. Subscreva um plano, ou exporte o que precisar, ' +
            'enquanto tem acesso.',
        })),
      );
    });
    await despacharNotificacoes(pendentes);
  }

  // 3. Fim da Leitura → Fechada. Nada se apaga.
  const aFechar = await prismaBase.assinatura.findMany({
    where: { estado: 'LEITURA', leituraFim: { lt: agora } },
    select: { id: true, tenantId: true, estado: true },
  });
  resultado.avaliadas += aFechar.length;

  for (const a of aFechar) {
    const pendentes: string[] = [];
    await prismaBase.$transaction(async (tx) => {
      const transitou = await aplicarTransicao(tx, a, 'FECHADA', {});
      if (!transitou) return;
      resultado.fechadas++;
      pendentes.push(
        ...(await notificarAdministradores(tx, a.tenantId, {
          titulo: 'O acesso ao GestPro foi fechado',
          mensagem:
            'O prazo de leitura terminou e o acesso à aplicação foi fechado. **Os seus dados não ' +
            'foram apagados** e continuam guardados: subscreva um plano quando quiser e volta a ' +
            'encontrar tudo como estava.',
        })),
      );
    });
    await despacharNotificacoes(pendentes);
  }

  logger.info({ ...resultado }, '[assinatura] ciclo de vida processado');
  return resultado;
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
  aplicarTransicao,
  fimDaLeitura,
  processarCicloDeVida,
};
