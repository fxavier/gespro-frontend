/**
 * Resolução do meio de pagamento — contrato reutilizável por qualquer domínio
 * que precise de pagar (WS B: contas a pagar; WS E: payroll futuro).
 *
 * Resolve a conta PGC creditada e o diário a partir da forma de pagamento e
 * da ContaBancaria indicada. Para NUMERARIO localiza a sessão de caixa aberta
 * do utilizador corrente e retorna o id da sessão para o chamador registar
 * o MovimentoCaixa.
 *
 * Nunca escreve: só lê e valida. Chamar ANTES de qualquer escrita dentro da
 * $transaction, para que a recusa não deixe registos a meio.
 */
import 'server-only';

import type { ContaMeioPagamentoPOS, MetodoPagamentoTipo, Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type { Ctx } from '@/server/services/types';
import {
  METODOS_POS_CONFIGURAVEIS,
  TIPOS_CONTA_POR_FORMA,
  TIPOS_CONTA_POR_METODO_POS,
  eMetodoPOSConfiguravel,
  type FormaPagamento,
  type MetodoPOSConfiguravel,
} from '@/lib/meios-pagamento';

export interface ResolucaoMeioPagamento {
  contaCodigo: string;
  diarioTipo: 'CAIXA' | 'BANCO';
  /** Presente apenas quando forma = NUMERARIO */
  sessaoCaixaId?: string;
}

/**
 * Resolve o meio de pagamento dentro de uma transacção.
 *
 * @param tx            - TransactionClient da $transaction em curso.
 * @param forma         - Forma de pagamento escolhida.
 * @param contaBancariaId - ID da ContaBancaria (obrigatório para formas não-NUMERARIO).
 * @param ctx           - Contexto do tenant e utilizador.
 */
export async function resolverContaMeioPagamento(
  tx: Prisma.TransactionClient,
  {
    forma,
    contaBancariaId,
  }: {
    forma: FormaPagamento;
    contaBancariaId?: string;
  },
  ctx: Ctx,
): Promise<ResolucaoMeioPagamento> {
  // ── NUMERARIO ──────────────────────────────────────────────────────────────
  if (forma === 'NUMERARIO') {
    // Localizar sessão de caixa ABERTA do utilizador corrente (nunca de outro)
    const sessao = await tx.sessaoCaixa.findFirst({
      where: { tenantId: ctx.tenantId, responsavelId: ctx.userId, status: 'ABERTA' },
      select: { id: true },
    });
    if (!sessao) {
      throw new BusinessRuleError(
        'SESSAO_CAIXA_NECESSARIA',
        'Para pagar em numerário é necessário ter uma sessão de caixa aberta. Abra o caixa em Caixa › Abertura antes de pagar em numerário.',
      );
    }
    return { contaCodigo: '111', diarioTipo: 'CAIXA', sessaoCaixaId: sessao.id };
  }

  // ── Formas bancárias ────────────────────────────────────────────────────────
  if (!contaBancariaId) {
    throw new BusinessRuleError(
      'CONTA_BANCARIA_OBRIGATORIA',
      `A forma de pagamento "${forma}" requer uma conta bancária.`,
    );
  }

  // Buscar a ContaBancaria com a sua ContaPGC (tenantId explícito — findFirst é scoped, mas garantimos)
  const conta = await tx.contaBancaria.findFirst({
    where: { id: contaBancariaId, tenantId: ctx.tenantId },
    include: { contaContabil: { select: { codigo: true } } },
  });

  if (!conta) {
    throw new NotFoundError('Conta bancária não encontrada');
  }

  if (!conta.ativo) {
    throw new BusinessRuleError(
      'CONTA_BANCARIA_INATIVA',
      'A conta bancária indicada está inactiva e não pode ser utilizada.',
    );
  }

  // Verificar compatibilidade do tipo de conta com a forma de pagamento
  const tiposAceites = TIPOS_CONTA_POR_FORMA[forma];
  if (!tiposAceites) {
    throw new BusinessRuleError('FORMA_PAGAMENTO_INVALIDA', `Forma de pagamento desconhecida: "${forma}".`);
  }
  if (!tiposAceites.includes(conta.tipoConta)) {
    throw new BusinessRuleError(
      'CONTA_BANCARIA_INCOMPATIVEL',
      `A conta bancária do tipo "${conta.tipoConta}" não é compatível com a forma de pagamento "${forma}".`,
    );
  }

  const contaContabil = conta.contaContabil as { codigo: string } | null;
  if (!contaContabil) {
    throw new BusinessRuleError(
      'CONTA_CONTABIL_BANCARIA_EM_FALTA',
      'A conta bancária não tem conta contabilística associada.',
    );
  }

  return { contaCodigo: contaContabil.codigo, diarioTipo: 'BANCO' };
}

// ---------------------------------------------------------------------------
// Conta a débito por meio de pagamento do POS (ADR-0041 §4)
//
// Estado lido por um predicado de decisão (a conta que a venda POS debita):
// escrito por `definirContaMeioPagamentoPOS` (página de configuração), lido por
// `resolverContasPagamentoPOS` dentro da transacção da venda. Sem linha → 121.
// ---------------------------------------------------------------------------

/** Contrato publicado para o WS C (VendaService), injectado em `comercial/index.ts`. */
export interface IMeioPagamentoPOSService {
  resolverContasPagamentoPOS(
    tx: Prisma.TransactionClient,
    ctx: Ctx,
  ): Promise<Partial<Record<MetodoPagamentoTipo, string>>>;
}

export interface ContaMeioPagamentoPOSRow {
  metodo: MetodoPOSConfiguravel;
  contaBancariaId: string | null;
  /** Código PGC da conta contabilística da ContaBancaria configurada. */
  contaCodigo?: string;
  /** «Banco · n.º conta», para mostrar. */
  contaBancariaDescricao?: string;
  /** A ContaBancaria configurada foi entretanto desactivada. */
  contaBancariaInativa?: boolean;
}

/**
 * Define (ou, com `contaBancariaId: null`, retira) a ContaBancaria que a venda POS
 * debita para um meio. A conta tem de ser do tenant, activa e de tipo compatível.
 */
export async function definirContaMeioPagamentoPOS(
  input: { metodo: MetodoPagamentoTipo; contaBancariaId: string | null },
  ctx: Ctx,
): Promise<ContaMeioPagamentoPOS | null> {
  if (!eMetodoPOSConfiguravel(input.metodo)) {
    throw new BusinessRuleError(
      'METODO_NAO_CONFIGURAVEL',
      `O meio "${input.metodo}" não tem conta configurável: numerário debita sempre 111 Caixa e crédito 411 Clientes.`,
    );
  }

  // Escritas SINGULARES (create/update/delete) de propósito: a audit-extension
  // não intercepta upsert nem deleteMany, e esta mudança tem de ficar no trilho.
  const actual = await prisma.contaMeioPagamentoPOS.findFirst({
    where: { tenantId: ctx.tenantId, metodo: input.metodo },
    select: { id: true },
  });

  if (input.contaBancariaId === null) {
    // Retirar uma configuração que não existe não é erro.
    if (actual) await prisma.contaMeioPagamentoPOS.delete({ where: { id: actual.id } });
    return null;
  }

  const conta = await prisma.contaBancaria.findFirst({
    where: { id: input.contaBancariaId, tenantId: ctx.tenantId },
    select: { id: true, tipoConta: true, ativo: true },
  });
  if (!conta) throw new NotFoundError('Conta bancária não encontrada');
  if (!conta.ativo) {
    throw new BusinessRuleError(
      'CONTA_BANCARIA_INATIVA',
      'A conta bancária indicada está inactiva e não pode ser utilizada.',
    );
  }
  if (!TIPOS_CONTA_POR_METODO_POS[input.metodo].includes(conta.tipoConta)) {
    throw new BusinessRuleError(
      'CONTA_BANCARIA_INCOMPATIVEL',
      `A conta bancária do tipo "${conta.tipoConta}" não é compatível com o meio "${input.metodo}".`,
    );
  }

  // ponytail: dois pedidos concorrentes ao mesmo meio sem linha → o segundo
  // create colide no @@unique e falha; é uma acção de configuração rara.
  return actual
    ? prisma.contaMeioPagamentoPOS.update({ where: { id: actual.id }, data: { contaBancariaId: conta.id } })
    : prisma.contaMeioPagamentoPOS.create({
        data: { tenantId: ctx.tenantId, metodo: input.metodo, contaBancariaId: conta.id },
      });
}

async function lerConfiguracoes(client: Prisma.TransactionClient | typeof prisma, ctx: Ctx) {
  const linhas = await client.contaMeioPagamentoPOS.findMany({
    where: { tenantId: ctx.tenantId },
    select: { metodo: true, contaBancariaId: true },
  });
  const contas = linhas.length
    ? await client.contaBancaria.findMany({
        where: { tenantId: ctx.tenantId, id: { in: linhas.map((l) => l.contaBancariaId) } },
        select: {
          id: true,
          banco: true,
          numeroConta: true,
          ativo: true,
          contaContabil: { select: { codigo: true } },
        },
      })
    : [];
  const porId = new Map(contas.map((c) => [c.id, c]));
  return linhas.map((l) => ({ ...l, conta: porId.get(l.contaBancariaId) }));
}

/** Os 4 meios configuráveis, com a conta configurada ou `contaBancariaId: null`. */
export async function listarContasMeioPagamentoPOS(ctx: Ctx): Promise<ContaMeioPagamentoPOSRow[]> {
  const config = new Map((await lerConfiguracoes(prisma, ctx)).map((c) => [c.metodo, c]));
  return METODOS_POS_CONFIGURAVEIS.map((metodo) => {
    const c = config.get(metodo);
    if (!c) return { metodo, contaBancariaId: null };
    return {
      metodo,
      contaBancariaId: c.contaBancariaId,
      contaCodigo: c.conta?.contaContabil?.codigo,
      contaBancariaDescricao: c.conta ? `${c.conta.banco} · ${c.conta.numeroConta}` : undefined,
      contaBancariaInativa: c.conta ? !c.conta.ativo : undefined,
    };
  });
}

/**
 * Método → código PGC a debitar, para os meios configurados. Os ausentes caem na
 * omissão de `construirLancamentoVendaPOS` (121; 111 para DINHEIRO, 411 para CREDITO).
 * Lê dentro da transacção da venda.
 */
export async function resolverContasPagamentoPOS(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
): Promise<Partial<Record<MetodoPagamentoTipo, string>>> {
  const contas: Partial<Record<MetodoPagamentoTipo, string>> = {};
  for (const c of await lerConfiguracoes(tx, ctx)) {
    const codigo = c.conta?.contaContabil?.codigo;
    if (!codigo) {
      // Inalcançável hoje (contaContabilId obrigatório com FK); recusar é melhor do
      // que debitar 121 em silêncio uma conta que o tenant configurou.
      throw new BusinessRuleError(
        'CONTA_CONTABIL_BANCARIA_EM_FALTA',
        `A conta bancária configurada para ${c.metodo} não tem conta contabilística associada.`,
      );
    }
    contas[c.metodo] = codigo;
  }
  return contas;
}
