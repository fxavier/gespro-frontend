/**
 * Implementação do serviço de Compras — WS B (Wave 3)
 * Fluxo: RequisicaoCompra → aprovação multi-nível → Cotacao (RFQ) → PedidoCompra
 *        → RecebimentoCompra (+ entradaStock WS A) → ContaPagar.
 */
import 'server-only';

import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { paginate } from '@/server/db/paginate';
import { entradaStock } from '@/server/services/inventario/stock.service';
import { proximoNumeroSerie } from '@/server/services/financas/faturacao.service';
import { lancarReconhecimentoDivida } from './conta-pagar.service';
import type {
  IComprasService,
  RequisicaoCompraDetalhe,
  RequisicaoCompraResumo,
  CotacaoDetalhe,
  CotacaoResumo,
  CotacaoAdjudicadaDto,
  PedidoCompraDetalhe,
  PedidoCompraResumo,
  RecebimentoCompraDto,
  ItemRecebimentoDto,
  StatusRequisicaoCompra,
  StatusCotacao,
  StatusPedidoCompra,
} from './compras.service.interface';
import {
  TRANSICOES_REQUISICAO,
  TRANSICOES_COTACAO,
  TRANSICOES_PEDIDO_COMPRA,
} from './compras.service.interface';
import type {
  CreateRequisicaoCompraInput,
  UpdateRequisicaoCompraInput,
  FilterRequisicaoCompraInput,
  AprovarDocumentoInput,
  CreateCotacaoInput,
  RegistarRespostaCotacaoInput,
  AdjudicarCotacaoInput,
  CreatePedidoCompraInput,
  UpdatePedidoCompraInput,
  FilterPedidoCompraInput,
  CreateRecebimentoCompraInput,
  CreateConfiguracaoWorkflowInput,
} from '@/lib/validations/compras';
import type { Ctx } from '@/server/services/types';
import { TAXA_IVA_NORMAL, lerTaxaIva } from '@/lib/iva';
import type { z } from 'zod';
import type { FilterCotacaoSchema } from '@/lib/validations/compras';

// Cast para PrismaClient: fornece tipagem completa de todos os modelos gerados.
// A extensão (tenant + audit) continua activa em runtime — só o tipo muda.
const db = prisma as unknown as PrismaClient;

// ---------------------------------------------------------------------------
// Contas PGC-NIRF usadas na contabilização das compras (códigos do seed
// plano-contas-pgc.json). Contas estáveis — parametrização por tenant é
// extensão futura (ConfiguracaoContabil), alinhado com PGC_PAYROLL.
// ---------------------------------------------------------------------------
export const PGC_COMPRAS = {
  /** 211 — Mercadorias (existências; débito no reconhecimento de recepção) */
  MERCADORIAS: '211',
  /** 421 — Fornecedores c/c (passivo; crédito no reconhecimento, débito na liquidação) */
  FORNECEDORES_CC: '421',
  /** 121 — Depósitos à ordem (activo; crédito na liquidação) */
  BANCO_DEPOSITOS_ORDEM: '121',
} as const;

// =====================================================================
// Funções puras — exportadas para testes (state machines + quórum)
// =====================================================================

/** Valida transição de estado; lança BusinessRuleError se inválida. */
export function transitar<S extends string>(
  mapa: Record<S, S[]>,
  /** Rótulo da entidade em português, tal como o utilizador o lê (ex.: «pedido de compra»). */
  nome: string,
  atual: S,
  alvo: S,
): void {
  const permitidos = mapa[atual] ?? [];
  if (!permitidos.includes(alvo)) {
    throw new BusinessRuleError(
      'TRANSICAO_INVALIDA',
      `Transição inválida de ${nome}: ${atual} → ${alvo}. Permitidos: [${permitidos.join(', ')}]`,
    );
  }
}

/** Verifica quórum de aprovação. Retorna true se o nível está concluído. */
export function verificarQuorum(
  aprovacoes: Array<{ status: 'PENDENTE' | 'APROVADO' | 'REJEITADO' }>,
  tipo: 'QUALQUER_UM' | 'TODOS' | 'MAIORIA',
): boolean {
  const aprovados = aprovacoes.filter((a) => a.status === 'APROVADO').length;
  const total = aprovacoes.length;
  switch (tipo) {
    case 'QUALQUER_UM': return aprovados >= 1;
    case 'TODOS': return aprovados === total;
    case 'MAIORIA': return aprovados >= Math.ceil(total / 2);
  }
}

/** Calcular totais do pedido de compra a partir dos itens. Dinheiro em Prisma.Decimal. */
export function calcularTotaisPedido(itens: Array<{
  quantidade: Prisma.Decimal | number;
  precoUnitario: Prisma.Decimal | number;
  desconto: Prisma.Decimal | number;
  taxaIva: Prisma.Decimal | number;
}>): { valorSubtotal: Prisma.Decimal; valorDesconto: Prisma.Decimal; valorIva: Prisma.Decimal; valorTotal: Prisma.Decimal } {
  let valorSubtotal = new Prisma.Decimal(0);
  let valorDesconto = new Prisma.Decimal(0);
  for (const item of itens) {
    const qty = new Prisma.Decimal(item.quantidade.toString());
    const price = new Prisma.Decimal(item.precoUnitario.toString());
    const disc = new Prisma.Decimal((item.desconto ?? 0).toString());
    valorSubtotal = valorSubtotal.add(qty.mul(price));
    valorDesconto = valorDesconto.add(disc);
  }
  const liquido = valorSubtotal.sub(valorDesconto);
  let valorIva = new Prisma.Decimal(0);
  for (const item of itens) {
    const qty = new Prisma.Decimal(item.quantidade.toString());
    const price = new Prisma.Decimal(item.precoUnitario.toString());
    const disc = new Prisma.Decimal((item.desconto ?? 0).toString());
    const iva = new Prisma.Decimal((item.taxaIva ?? 0.16).toString());
    valorIva = valorIva.add(qty.mul(price).sub(disc).mul(iva));
  }
  return {
    valorSubtotal: valorSubtotal.toDecimalPlaces(2),
    valorDesconto: valorDesconto.toDecimalPlaces(2),
    valorIva: valorIva.toDecimalPlaces(2),
    valorTotal: liquido.add(valorIva).toDecimalPlaces(2),
  };
}

// =====================================================================
// Mappers BD → DTO
// =====================================================================

function toRequisicaoResumo(r: any): RequisicaoCompraResumo {
  const aprovacoes = r.aprovacoes ?? [];
  const nivelActual = aprovacoes.filter((a: any) => a.status === 'APROVADO')
    .reduce((max: number, a: any) => Math.max(max, a.nivel), 0);
  const totalNiveis = aprovacoes.length > 0 ? Math.max(...aprovacoes.map((a: any) => a.nivel)) : 0;
  return {
    id: r.id, numero: r.numero, data: r.data,
    solicitanteId: r.solicitanteId, solicitanteNome: r.solicitanteNome,
    departamento: r.departamento, prioridade: r.prioridade,
    status: r.status, valorTotal: Number(r.valorTotal ?? 0),
    nivelAprovacaoActual: nivelActual, totalNiveis, createdAt: r.createdAt,
  };
}

function toRequisicaoDetalhe(r: any): RequisicaoCompraDetalhe {
  return {
    ...toRequisicaoResumo(r),
    justificativa: r.justificativa, observacoes: r.observacoes ?? null,
    dataEntregaDesejada: r.dataEntregaDesejada ?? null, centroCustoId: r.centroCustoId ?? null,
    itens: (r.itens ?? []).map((i: any) => ({
      id: i.id, produtoId: i.produtoId ?? null, descricao: i.descricao,
      quantidade: Number(i.quantidade), unidadeMedida: i.unidadeMedida,
      precoEstimado: Number(i.precoEstimado), subtotal: Number(i.subtotal),
    })),
    aprovacoes: (r.aprovacoes ?? []).map((a: any) => ({
      id: a.id, nivel: a.nivel, aprovadorId: a.aprovadorId,
      aprovadorNome: a.aprovadorNome, status: a.status,
      data: a.data ?? null, observacoes: a.observacoes ?? null,
    })),
  };
}

function toPedidoResumo(p: any): PedidoCompraResumo {
  return {
    id: p.id, numero: p.numero, data: p.data,
    fornecedorId: p.fornecedorId, fornecedorNome: p.fornecedor?.nome ?? p.fornecedorId,
    status: p.status, valorTotal: Number(p.valorTotal ?? 0),
    dataEntregaPrevista: p.dataEntregaPrevista, dataEntregaReal: p.dataEntregaReal ?? null,
    createdAt: p.createdAt,
  };
}

function toPedidoDetalhe(p: any): PedidoCompraDetalhe {
  return {
    ...toPedidoResumo(p),
    requisicaoCompraId: p.requisicaoCompraId ?? null,
    cotacaoId: p.cotacaoId ?? null,
    valorSubtotal: Number(p.valorSubtotal ?? 0),
    valorDesconto: Number(p.valorDesconto ?? 0),
    valorIva: Number(p.valorIva ?? 0),
    taxaIva: Number(p.taxaIva ?? 0.16),
    condicoesPagamento: p.condicoesPagamento,
    prazoEntregaDias: p.prazoEntregaDias,
    enderecoEntrega: p.enderecoEntrega,
    centroCustoId: p.centroCustoId ?? null,
    observacoes: p.observacoes ?? null,
    itens: (p.itens ?? []).map((i: any) => ({
      id: i.id, produtoId: i.produtoId ?? null, descricao: i.descricao,
      quantidade: Number(i.quantidade), quantidadeRecebida: Number(i.quantidadeRecebida ?? 0),
      unidadeMedida: i.unidadeMedida, precoUnitario: Number(i.precoUnitario),
      desconto: Number(i.desconto ?? 0), taxaIva: Number(i.taxaIva ?? 0.16),
      subtotal: Number(i.subtotal),
    })),
    aprovacoes: (p.aprovacoes ?? []).map((a: any) => ({
      id: a.id, nivel: a.nivel, aprovadorId: a.aprovadorId,
      aprovadorNome: a.aprovadorNome, status: a.status,
      data: a.data ?? null, observacoes: a.observacoes ?? null,
    })),
    recebimentos: (p.recebimentos ?? []).map(toRecebimentoDto),
  };
}

function toRecebimentoDto(r: any): RecebimentoCompraDto {
  return {
    id: r.id, data: r.data, status: r.status,
    responsavelNome: r.responsavelNome,
    itens: (r.itens ?? []).map((i: any): ItemRecebimentoDto => ({
      itemPedidoCompraId: i.itemPedidoCompraId,
      quantidadeRecebida: Number(i.quantidadeRecebida),
      quantidadeAceita: Number(i.quantidadeAceita),
      quantidadeRejeitada: Number(i.quantidadeRejeitada),
      motivoRejeicao: i.motivoRejeicao ?? null,
    })),
  };
}

// =====================================================================
// Lógica de workflow de aprovação (pura, extraída para testabilidade)
// =====================================================================

/**
 * Encontra o ConfiguracaoWorkflow aplicável para o tipo e valor dados.
 *
 * Segurança W5: se o valor exceder todas as bandas configuradas (ex.: 10M com
 * bandas até 1M), usa o nível mais alto em vez de auto-aprovar.
 * Só auto-aprova quando não existe NENHUM workflow activo para o tipo.
 */
async function encontrarWorkflow(tipo: 'REQUISICAO_COMPRA' | 'PEDIDO_COMPRA', valor: number, ctx: Ctx) {
  // Buscar workflow com TODOS os níveis (sem filtro de valor)
  const workflow = await db.configuracaoWorkflow.findFirst({
    where: { tenantId: ctx.tenantId, tipo, ativo: true },
    include: {
      niveis: { include: { aprovadores: true }, orderBy: { nivel: 'asc' } },
    },
  });

  if (!workflow) return null; // Sem workflow → pode auto-aprovar

  // Filtrar níveis que cobrem o valor
  const niveisParaValor = workflow.niveis.filter(
    (n: { valorMinimo: Prisma.Decimal | number | null; valorMaximo: Prisma.Decimal | number | null }) =>
      (n.valorMinimo == null || Number(n.valorMinimo) <= valor) &&
      (n.valorMaximo == null || Number(n.valorMaximo) >= valor),
  );

  if (niveisParaValor.length > 0) {
    return { ...workflow, niveis: niveisParaValor };
  }

  // Valor fora de todas as bandas → usar o nível mais alto (segurança máxima; nunca auto-aprovar)
  if (workflow.niveis.length > 0) {
    const nivelMaisAlto = workflow.niveis[workflow.niveis.length - 1];
    return { ...workflow, niveis: [nivelMaisAlto] };
  }

  return null; // Workflow existe mas sem níveis configurados
}

// =====================================================================
// Circuitos de aprovação — escrita (#108, #445)
// =====================================================================

function dadosNiveis(input: CreateConfiguracaoWorkflowInput, ctx: Ctx) {
  return input.niveis.map((nivel) => ({
    tenantId: ctx.tenantId,
    nivel: nivel.nivel, nome: nivel.nome,
    valorMinimo: nivel.valorMinimo, valorMaximo: nivel.valorMaximo,
    tipoAprovacao: nivel.tipoAprovacao ?? 'QUALQUER_UM',
    aprovadores: {
      create: nivel.aprovadores.map((ap) => ({
        tenantId: ctx.tenantId,
        usuarioId: ap.usuarioId, email: ap.email,
      })),
    },
  }));
}

/**
 * Núcleo partilhado de criar e editar um circuito: numa transacção, verifica o nome e
 * «um activo por tipo» e só então escreve. Com `id`, o circuito tem de ser do tenant e não
 * colide consigo mesmo.
 *
 * Um só circuito activo por tipo: `encontrarWorkflow` faz `findFirst` e, com dois, escolheria
 * um deles ao acaso (#108). A verificação é feita sob uma tranca consultiva da transacção por
 * (tenant, tipo): sem ela, duas escritas simultâneas liam ambas «nenhum activo» e gravavam
 * as duas (#445).
 */
async function guardarCircuito<T>(
  input: CreateConfiguracaoWorkflowInput,
  ctx: Ctx,
  id: string | null,
  escrever: (tx: PrismaClient) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaClient;
      if (id) {
        const actual = await tx.configuracaoWorkflow.findFirst({
          where: { id, tenantId: ctx.tenantId },
          select: { id: true },
        });
        if (!actual) throw new NotFoundError('Circuito de aprovação não encontrado');
      }

      const homonimo = await tx.configuracaoWorkflow.findFirst({
        where: { tenantId: ctx.tenantId, nome: input.nome, ...(id ? { id: { not: id } } : {}) },
        select: { id: true },
      });
      if (homonimo) throw new BusinessRuleError('WORKFLOW_DUPLICADO', `Workflow "${input.nome}" já existe`);

      if (input.ativo ?? true) {
        const chave = `compras:workflow:${ctx.tenantId}:${input.tipo}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chave}::text))`;
        const activo = await tx.configuracaoWorkflow.findFirst({
          where: { tenantId: ctx.tenantId, tipo: input.tipo, ativo: true, ...(id ? { id: { not: id } } : {}) },
          select: { nome: true },
        });
        if (activo) {
          throw new BusinessRuleError(
            'WORKFLOW_ACTIVO_DUPLICADO',
            `Já existe um circuito activo para este tipo de documento ("${activo.nome}"). Desactive-o antes de activar outro.`,
          );
        }
      }

      return escrever(tx);
    });
  } catch (e) {
    // Dois nomes iguais em simultâneo: o segundo cai no @@unique([tenantId, nome]).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new BusinessRuleError('WORKFLOW_DUPLICADO', `Workflow "${input.nome}" já existe`);
    }
    throw e;
  }
}

/**
 * Nome real do utilizador da sessão (#116) — solicitante da requisição e responsável da
 * recepção. A sessão não traz o nome; lê-se o `User` pelo `ctx.userId`, no tenant.
 */
async function nomeDoUtilizador(
  cliente: { user: Pick<PrismaClient['user'], 'findFirst'> },
  ctx: Ctx,
): Promise<string> {
  const utilizador = await cliente.user.findFirst({
    where: { id: ctx.userId, tenantId: ctx.tenantId },
    select: { nome: true },
  });
  if (!utilizador) throw new NotFoundError('Utilizador da sessão não encontrado');
  return utilizador.nome;
}

// =====================================================================
// Implementação do serviço
// =====================================================================

export const comprasService: IComprasService = {
  // ---- Configuração de Workflow ----

  async criarConfiguracaoWorkflow(
    input: CreateConfiguracaoWorkflowInput,
    ctx: Ctx,
  ) {
    const workflow = await guardarCircuito(input, ctx, null, (tx) =>
      tx.configuracaoWorkflow.create({
        data: {
          tenantId: ctx.tenantId,
          nome: input.nome, tipo: input.tipo, ativo: input.ativo ?? true,
          niveis: { create: dadosNiveis(input, ctx) },
        },
      }),
    );
    return { id: workflow.id, nome: workflow.nome };
  },

  async actualizarConfiguracaoWorkflow(id: string, input: CreateConfiguracaoWorkflowInput, ctx: Ctx) {
    const workflow = await guardarCircuito(input, ctx, id, (tx) =>
      tx.configuracaoWorkflow.update({
        where: { id },
        data: {
          nome: input.nome, tipo: input.tipo, ativo: input.ativo ?? true,
          // Substitui os níveis (os aprovadores vão em cascata). As decisões já registadas
          // (`AprovacaoCompra`) guardam o número do nível, não o id — não ficam órfãs.
          niveis: { deleteMany: {}, create: dadosNiveis(input, ctx) },
        },
      }),
    );
    return { id: workflow.id, nome: workflow.nome };
  },

  async desactivarConfiguracaoWorkflow(id: string, ctx: Ctx) {
    const w = await db.configuracaoWorkflow.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
    if (!w) throw new NotFoundError('Circuito de aprovação não encontrado');
    await db.configuracaoWorkflow.update({ where: { id: w.id }, data: { ativo: false } });
  },

  async listarConfiguracoesWorkflow(ctx: Ctx) {
    const workflows = await db.configuracaoWorkflow.findMany({
      where: { tenantId: ctx.tenantId },
      include: {
        niveis: {
          orderBy: { nivel: 'asc' },
          include: { aprovadores: { orderBy: { email: 'asc' } } },
        },
      },
      orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
    });
    return workflows.map((w) => ({
      id: w.id,
      nome: w.nome,
      tipo: w.tipo,
      ativo: w.ativo,
      niveis: w.niveis.map((n) => ({
        id: n.id,
        nivel: n.nivel,
        nome: n.nome,
        tipoAprovacao: n.tipoAprovacao,
        valorMinimo: n.valorMinimo.toString(),
        valorMaximo: n.valorMaximo.toString(),
        aprovadores: n.aprovadores.map((a) => ({ usuarioId: a.usuarioId, email: a.email })),
      })),
    }));
  },

  async procurarAprovadores(termo: string, ctx: Ctx) {
    const q = termo.trim();
    return db.user.findMany({
      where: {
        tenantId: ctx.tenantId,
        ativo: true,
        deletedAt: null,
        ...(q
          ? { OR: [{ nome: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] }
          : {}),
      },
      select: { id: true, nome: true, email: true },
      orderBy: { nome: 'asc' },
      take: 50,
    });
  },

  // ---- Requisição de Compra ----

  async criarRequisicao(input: CreateRequisicaoCompraInput, ctx: Ctx) {
    const subtotal = (i: any) => i.quantidade * i.precoEstimado;
    const valorTotal = input.itens.reduce((s, i) => s + subtotal(i), 0);

    const numero = await prisma.$transaction(async (tx) =>
      proximoNumeroSerie(tx as unknown as Prisma.TransactionClient, 'REQUISICAO_COMPRA', ctx, input.data ?? new Date()),
    );

    const requisicao = await db.requisicaoCompra.create({
      data: {
        tenantId: ctx.tenantId,
        numero, data: input.data ?? new Date(),
        solicitanteId: ctx.userId, solicitanteNome: await nomeDoUtilizador(db, ctx),
        departamento: input.departamento, prioridade: input.prioridade ?? 'MEDIA',
        justificativa: input.justificativa, observacoes: input.observacoes,
        dataEntregaDesejada: input.dataEntregaDesejada, centroCustoId: input.centroCustoId,
        valorTotal,
        itens: {
          create: input.itens.map((i) => ({
            tenantId: ctx.tenantId,
            produtoId: i.produtoId, descricao: i.descricao,
            quantidade: i.quantidade, unidadeMedida: i.unidadeMedida,
            precoEstimado: i.precoEstimado,
            subtotal: subtotal(i),
            observacoes: i.observacoes,
          })),
        },
      },
      include: { itens: true, aprovacoes: true },
    });
    return toRequisicaoDetalhe(requisicao);
  },

  async actualizarRequisicao(id: string, input: UpdateRequisicaoCompraInput, ctx: Ctx) {
    const req = await db.requisicaoCompra.findUnique({ where: { id } });
    if (!req || req.tenantId !== ctx.tenantId) throw new NotFoundError('Requisição não encontrada');
    if (req.status !== 'RASCUNHO') throw new BusinessRuleError('ESTADO_INVALIDO', 'Apenas requisições em rascunho podem ser actualizadas');

    const updated = await db.requisicaoCompra.update({
      where: { id }, data: input,
      include: { itens: true, aprovacoes: true },
    });
    return toRequisicaoDetalhe(updated);
  },

  async submeterRequisicao(id: string, ctx: Ctx) {
    const req = await db.requisicaoCompra.findUnique({
      where: { id }, include: { itens: true },
    });
    if (!req || req.tenantId !== ctx.tenantId) throw new NotFoundError('Requisição não encontrada');

    transitar(TRANSICOES_REQUISICAO, 'requisição de compra', req.status as StatusRequisicaoCompra, 'PENDENTE');

    const workflow = await encontrarWorkflow('REQUISICAO_COMPRA', Number(req.valorTotal), ctx);

    if (!workflow || workflow.niveis.length === 0) {
      // Sem workflow configurado → aprovar automaticamente
      const aprovada = await db.requisicaoCompra.update({
        where: { id },
        data: { status: 'APROVADA' },
        include: { itens: true, aprovacoes: true },
      });
      return toRequisicaoDetalhe(aprovada);
    }

    const primeiroNivel = workflow.niveis[0];

    // Criar registos de aprovação para o nível 1
    const aprovacoes = await prisma.$transaction(async (tx) => {
      await (tx as unknown as PrismaClient).requisicaoCompra.update({ where: { id }, data: { status: 'EM_APROVACAO' } });
      return (tx as unknown as PrismaClient).aprovacaoCompra.createMany({
        data: primeiroNivel.aprovadores.map((ap: { usuarioId: string; email: string }) => ({
          tenantId: ctx.tenantId,
          requisicaoCompraId: id,
          nivel: primeiroNivel.nivel,
          aprovadorId: ap.usuarioId,
          aprovadorNome: ap.email,
          status: 'PENDENTE',
        })),
      });
    });
    void aprovacoes;

    return toRequisicaoDetalhe(await db.requisicaoCompra.findUnique({
      where: { id }, include: { itens: true, aprovacoes: true },
    }));
  },

  async cancelarRequisicao(id: string, motivo: string, ctx: Ctx) {
    const req = await db.requisicaoCompra.findUnique({ where: { id } });
    if (!req || req.tenantId !== ctx.tenantId) throw new NotFoundError('Requisição não encontrada');
    transitar(TRANSICOES_REQUISICAO, 'requisição de compra', req.status as StatusRequisicaoCompra, 'CANCELADA');
    await db.requisicaoCompra.update({ where: { id }, data: { status: 'CANCELADA', observacoes: motivo } });
  },

  async obterRequisicao(id: string, ctx: Ctx) {
    const req = await db.requisicaoCompra.findUnique({
      where: { id }, include: { itens: true, aprovacoes: true },
    });
    if (!req || req.tenantId !== ctx.tenantId) throw new NotFoundError('Requisição não encontrada');
    return toRequisicaoDetalhe(req);
  },

  async listarRequisicoes(filtros: FilterRequisicaoCompraInput, ctx: Ctx) {
    const { status, prioridade, q, departamento, cursor, take = 25, orderBy = 'createdAt', orderDir = 'desc' } = filtros;
    const where: any = {
      tenantId: ctx.tenantId,
      ...(status ? { status } : {}),
      ...(prioridade ? { prioridade } : {}),
      ...(departamento ? { departamento: { contains: departamento, mode: 'insensitive' } } : {}),
      ...(q ? {
        OR: [
          { numero: { contains: q, mode: 'insensitive' } },
          { solicitanteNome: { contains: q, mode: 'insensitive' } },
          { departamento: { contains: q, mode: 'insensitive' } },
        ],
      } : {}),
    };
    return paginate(
      (a) => db.requisicaoCompra.findMany({
        ...a, where, include: { aprovacoes: true },
        orderBy: { [orderBy]: orderDir },
      }),
      { cursor, take },
    ).then((p: any) => ({ items: p.items.map(toRequisicaoResumo), nextCursor: p.nextCursor }));
  },

  async contarRequisicoesPorStatus(ctx: Ctx) {
    const base = { tenantId: ctx.tenantId };
    const [total, pendentes, emAprovacao, aprovadas, valorAgg] = await Promise.all([
      db.requisicaoCompra.count({ where: base }),
      db.requisicaoCompra.count({ where: { ...base, status: 'PENDENTE' } }),
      db.requisicaoCompra.count({ where: { ...base, status: 'EM_APROVACAO' } }),
      db.requisicaoCompra.count({ where: { ...base, status: 'APROVADA' } }),
      db.requisicaoCompra.aggregate({ where: base, _sum: { valorTotal: true } }),
    ]);
    return {
      total,
      pendentes: pendentes + emAprovacao,
      aprovadas,
      valorTotalProcesso: Number(valorAgg._sum.valorTotal ?? 0),
    };
  },

  // ---- Aprovação Multi-nível ----

  async decidirAprovacao(input: AprovarDocumentoInput, ctx: Ctx) {
    const { documentoId, nivel, status } = input;
    const observacoes = input.observacoes?.trim() || undefined;
    // Rejeitar exige motivo (#108): fica na decisão e é o que o solicitante lê.
    if (status === 'REJEITADO' && !observacoes) {
      throw new BusinessRuleError('MOTIVO_OBRIGATORIO', 'Indique o motivo da rejeição.');
    }

    // Encontrar o registo de aprovação para este aprovador + nível
    const aprovacao = await db.aprovacaoCompra.findFirst({
      where: {
        tenantId: ctx.tenantId,
        OR: [{ requisicaoCompraId: documentoId }, { pedidoCompraId: documentoId }],
        nivel,
        aprovadorId: ctx.userId,
        status: 'PENDENTE',
      },
    });
    if (!aprovacao) throw new NotFoundError('Aprovação não encontrada ou já decidida');

    await prisma.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaClient;

      // 0. A requisição tem de continuar EM_APROVACAO, lida sob tranca: com QUALQUER_UM, o
      //    registo PENDENTE de um segundo aprovador sobrevive à decisão do primeiro e não pode
      //    reabrir um estado terminal (#108). A tranca serializa decisões concorrentes.
      if (aprovacao.requisicaoCompraId) {
        const [req] = await tx.$queryRaw<Array<{ status: string }>>`
          SELECT status::text AS status FROM "RequisicaoCompra"
           WHERE id = ${aprovacao.requisicaoCompraId} AND "tenantId" = ${ctx.tenantId}
           FOR UPDATE`;
        if (!req) throw new NotFoundError('Requisição não encontrada');
        if (req.status !== 'EM_APROVACAO') {
          throw new BusinessRuleError(
            'APROVACAO_ENCERRADA',
            'A requisição já não está em aprovação; a decisão já não conta.',
          );
        }
      } else if (aprovacao.pedidoCompraId) {
        // Idem para o pedido (#445): a decisão só conta enquanto ENVIADO — o único estado do
        // qual as duas saídas (CONFIRMADO e CANCELADO) são transições válidas.
        const [ped] = await tx.$queryRaw<Array<{ status: string }>>`
          SELECT status::text AS status FROM "PedidoCompra"
           WHERE id = ${aprovacao.pedidoCompraId} AND "tenantId" = ${ctx.tenantId}
           FOR UPDATE`;
        if (!ped) throw new NotFoundError('Pedido de compra não encontrado');
        if (ped.status !== 'ENVIADO') {
          throw new BusinessRuleError(
            'APROVACAO_ENCERRADA',
            'O pedido de compra já não está em aprovação; a decisão já não conta.',
          );
        }
      }
      const aindaPendente = await tx.aprovacaoCompra.findFirst({
        where: { id: aprovacao.id, tenantId: ctx.tenantId, status: 'PENDENTE' },
        select: { id: true },
      });
      if (!aindaPendente) throw new NotFoundError('Aprovação não encontrada ou já decidida');

      // 1. Registar decisão
      await tx.aprovacaoCompra.update({
        where: { id: aprovacao.id },
        data: { status, observacoes, data: new Date() },
      });

      const isRequisicao = !!aprovacao.requisicaoCompraId;
      const docId = aprovacao.requisicaoCompraId ?? aprovacao.pedidoCompraId;

      const atualizarDocStatus = async (novoStatus: string) => {
        if (isRequisicao) {
          await tx.requisicaoCompra.update({ where: { id: docId! }, data: { status: novoStatus as 'REJEITADA' } });
        } else {
          await tx.pedidoCompra.update({ where: { id: docId! }, data: { status: novoStatus as 'CANCELADO' } });
        }
      };

      if (status === 'REJEITADO') {
        await atualizarDocStatus(isRequisicao ? 'REJEITADA' : 'CANCELADO');
        return;
      }

      // 2. Verificar quórum neste nível
      const todasAprovacoes = await tx.aprovacaoCompra.findMany({
        where: {
          tenantId: ctx.tenantId,
          OR: [{ requisicaoCompraId: docId }, { pedidoCompraId: docId }],
          nivel,
        },
      });

      // Determinar tipoAprovacao do nível (precisa do workflow)
      const doc = isRequisicao
        ? await tx.requisicaoCompra.findUnique({ where: { id: docId! } })
        : await tx.pedidoCompra.findUnique({ where: { id: docId! } });
      if (!doc) return;

      const workflow = await encontrarWorkflow(
        isRequisicao ? 'REQUISICAO_COMPRA' : 'PEDIDO_COMPRA',
        Number((doc as { valorTotal: unknown }).valorTotal ?? 0),
        ctx,
      );

      const nivelConfig = workflow?.niveis?.find((n: { nivel: number }) => n.nivel === nivel);
      const tipoAprovacao = (nivelConfig as { tipoAprovacao?: string } | undefined)?.tipoAprovacao ?? 'QUALQUER_UM';

      // Actualizar a lista com a nova decisão
      const aprovacoesCom = todasAprovacoes.map((a) =>
        a.id === aprovacao.id ? { ...a, status } : a,
      );

      // Verificar rejeição por qualquer um
      if (aprovacoesCom.some((a) => a.status === 'REJEITADO')) {
        await atualizarDocStatus(isRequisicao ? 'REJEITADA' : 'CANCELADO');
        return;
      }

      const quorumAtingido = verificarQuorum(
        aprovacoesCom as Array<{ status: 'PENDENTE' | 'APROVADO' | 'REJEITADO' }>,
        tipoAprovacao as 'QUALQUER_UM' | 'TODOS' | 'MAIORIA',
      );
      if (!quorumAtingido) return;

      // 3. Quórum atingido → avançar para próximo nível ou APROVADO
      const proximoNivel = workflow?.niveis?.find((n: { nivel: number }) => n.nivel === nivel + 1);

      if (!proximoNivel) {
        await atualizarDocStatus(isRequisicao ? 'APROVADA' : 'CONFIRMADO');
        return;
      }

      // Criar registos de aprovação para o próximo nível (NUNCA salta níveis)
      await tx.aprovacaoCompra.createMany({
        data: (proximoNivel as { aprovadores: Array<{ usuarioId: string; email: string }>; nivel: number }).aprovadores.map((ap) => ({
          tenantId: ctx.tenantId,
          ...(isRequisicao ? { requisicaoCompraId: docId! } : { pedidoCompraId: docId! }),
          nivel: (proximoNivel as { nivel: number }).nivel,
          aprovadorId: ap.usuarioId,
          aprovadorNome: ap.email,
          status: 'PENDENTE',
        })),
      });
    });
  },

  // ---- Cotação (RFQ) ----

  async criarCotacao(input: CreateCotacaoInput, ctx: Ctx) {
    const numero = await prisma.$transaction(async (tx) =>
      proximoNumeroSerie(tx as unknown as Prisma.TransactionClient, 'COTACAO_RFQ', ctx, new Date()),
    );

    const cotacao = await db.cotacao.create({
      data: {
        tenantId: ctx.tenantId,
        numero, data: new Date(),
        requisicaoCompraId: input.requisicaoCompraId,
        dataValidade: input.dataValidade,
        observacoes: input.observacoes,
        itens: {
          create: input.itens.map((i) => ({
            tenantId: ctx.tenantId,
            produtoId: i.produtoId, descricao: i.descricao,
            quantidade: i.quantidade, unidadeMedida: i.unidadeMedida,
            especificacoes: i.especificacoes,
          })),
        },
        fornecedores: input.fornecedoresIds?.length
          ? {
              create: input.fornecedoresIds.map((fId) => ({
                tenantId: ctx.tenantId,
                fornecedorId: fId, dataEnvio: new Date(), status: 'PENDENTE',
              })),
            }
          : undefined,
      },
      include: { itens: { include: { respostas: true } }, fornecedores: true },
    });
    return toCotacaoDetalhe(cotacao);
  },

  async enviarCotacao(cotacaoId: string, ctx: Ctx) {
    const cot = await db.cotacao.findUnique({
      where: { id: cotacaoId },
      include: { _count: { select: { fornecedores: true } } },
    });
    if (!cot || cot.tenantId !== ctx.tenantId) throw new NotFoundError('Cotação não encontrada');
    transitar(TRANSICOES_COTACAO, 'cotação', cot.status as StatusCotacao, 'ENVIADA');
    // #109: sem convidados ninguém a pode responder, e não há forma de convidar depois.
    if (cot._count.fornecedores === 0) {
      throw new BusinessRuleError('COTACAO_SEM_FORNECEDORES', 'Convide pelo menos um fornecedor antes de enviar a cotação');
    }
    await db.cotacao.update({ where: { id: cotacaoId }, data: { status: 'ENVIADA' } });
  },

  async registarResposta(input: RegistarRespostaCotacaoInput, ctx: Ctx) {
    const cot = await db.cotacao.findUnique({ where: { id: input.cotacaoId } });
    if (!cot || cot.tenantId !== ctx.tenantId) throw new NotFoundError('Cotação não encontrada');
    if (cot.status !== 'ENVIADA' && cot.status !== 'RESPONDIDA') {
      throw new BusinessRuleError('ESTADO_INVALIDO', 'Cotação não está em estado de resposta');
    }

    await prisma.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaClient;
      const cf = await tx.cotacaoFornecedor.findFirst({
        where: { tenantId: ctx.tenantId, cotacaoId: input.cotacaoId, fornecedorId: input.fornecedorId },
      });
      if (!cf) throw new BusinessRuleError('FORNECEDOR_NAO_CONVIDADO', 'O fornecedor não foi convidado para esta cotação');

      // #109: só itens DESTA cotação, cada um uma vez.
      const idsItens = input.respostas.map((r) => r.itemCotacaoId);
      const itens = await tx.itemCotacao.findMany({
        where: { tenantId: ctx.tenantId, cotacaoId: input.cotacaoId, id: { in: idsItens } },
      });
      if (new Set(idsItens).size !== idsItens.length || itens.length !== idsItens.length) {
        throw new BusinessRuleError('ITEM_FORA_DA_COTACAO', 'A resposta inclui itens que não pertencem a esta cotação');
      }
      const quantidadePorItem = new Map(itens.map((i) => [i.id, i.quantidade]));

      // A nova resposta substitui a anterior: itens que já não vêm são retirados.
      await tx.respostaItemCotacao.deleteMany({
        where: { tenantId: ctx.tenantId, cotacaoFornecedorId: cf.id, itemCotacaoId: { notIn: idsItens } },
      });

      let valorTotal = new Prisma.Decimal(0);
      for (const r of input.respostas) {
        const subtotal = new Prisma.Decimal(quantidadePorItem.get(r.itemCotacaoId)!)
          .mul(r.precoUnitario)
          .toDecimalPlaces(2);
        valorTotal = valorTotal.add(subtotal);

        await tx.respostaItemCotacao.upsert({
          where: { itemCotacaoId_cotacaoFornecedorId: { itemCotacaoId: r.itemCotacaoId, cotacaoFornecedorId: cf.id } },
          create: {
            tenantId: ctx.tenantId,
            itemCotacaoId: r.itemCotacaoId, cotacaoFornecedorId: cf.id,
            precoUnitario: r.precoUnitario, subtotal,
            prazoEntregaDias: r.prazoEntregaDias, marca: r.marca,
            observacoes: r.observacoes,
          },
          update: {
            precoUnitario: r.precoUnitario, subtotal,
            prazoEntregaDias: r.prazoEntregaDias, marca: r.marca,
          },
        });
      }

      await tx.cotacaoFornecedor.update({
        where: { id: cf.id },
        data: {
          status: 'RESPONDIDA', dataResposta: new Date(),
          valorTotal,
          prazoEntregaDias: input.prazoEntregaDias,
          condicoesPagamento: input.condicoesPagamento,
          observacoes: input.observacoes,
        },
      });

      // Avançar cotação para RESPONDIDA se ainda ENVIADA
      if (cot.status === 'ENVIADA') {
        await tx.cotacao.update({ where: { id: input.cotacaoId }, data: { status: 'RESPONDIDA' } });
      }
    });
  },

  async adjudicarCotacao(input: AdjudicarCotacaoInput, ctx: Ctx) {
    const cot = await db.cotacao.findUnique({ where: { id: input.cotacaoId }, include: { fornecedores: true } });
    if (!cot || cot.tenantId !== ctx.tenantId) throw new NotFoundError('Cotação não encontrada');
    transitar(TRANSICOES_COTACAO, 'cotação', cot.status as StatusCotacao, 'ADJUDICADA');
    // #109: só ganha um convidado desta cotação que respondeu.
    const respondeu = cot.fornecedores.some(
      (f) => f.fornecedorId === input.fornecedorVencedorId && f.status === 'RESPONDIDA',
    );
    if (!respondeu) {
      throw new BusinessRuleError('VENCEDOR_SEM_RESPOSTA', 'Só pode adjudicar a um fornecedor convidado que respondeu à cotação');
    }
    await db.cotacao.update({
      where: { id: input.cotacaoId },
      data: { status: 'ADJUDICADA', vencedorFornecedorId: input.fornecedorVencedorId },
    });
  },

  async cancelarCotacao(cotacaoId: string, motivo: string, ctx: Ctx) {
    const cot = await db.cotacao.findUnique({ where: { id: cotacaoId } });
    if (!cot || cot.tenantId !== ctx.tenantId) throw new NotFoundError('Cotação não encontrada');
    transitar(TRANSICOES_COTACAO, 'cotação', cot.status as StatusCotacao, 'CANCELADA');
    // O motivo junta-se às observações em vez de as apagar.
    const observacoes = [cot.observacoes, `Cancelada: ${motivo}`].filter(Boolean).join('\n');
    await db.cotacao.update({ where: { id: cotacaoId }, data: { status: 'CANCELADA', observacoes } });
  },

  async expirarCotacoesVencidas(ctx: Ctx) {
    const agora = new Date();
    const result = await db.cotacao.updateMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ['ENVIADA', 'RESPONDIDA'] },
        dataValidade: { lt: agora },
      },
      data: { status: 'VENCIDA' },
    });
    return result.count;
  },

  async obterCotacao(id: string, ctx: Ctx) {
    const cot = await db.cotacao.findUnique({
      where: { id },
      include: {
        itens: { include: { respostas: { include: { cotacaoFornecedor: { select: { fornecedorId: true } } } } } },
        fornecedores: { include: { fornecedor: { select: { nome: true } } } },
      },
    });
    if (!cot || cot.tenantId !== ctx.tenantId) throw new NotFoundError('Cotação não encontrada');
    return toCotacaoDetalhe(cot);
  },

  async listarCotacoes(filtros: z.infer<typeof FilterCotacaoSchema>, ctx: Ctx) {
    const { status, q, cursor, take = 25, orderBy = 'createdAt', orderDir = 'desc' } = filtros;
    const where: any = {
      tenantId: ctx.tenantId,
      ...(status ? { status } : {}),
      ...(q ? { numero: { contains: q, mode: 'insensitive' } } : {}),
    };
    return paginate(
      (a) => db.cotacao.findMany({
        ...a, where, orderBy: { [orderBy]: orderDir },
        include: { fornecedores: { select: { status: true } } },
      }),
      { cursor, take },
    ).then((p: any) => ({
      items: p.items.map((c: any): CotacaoResumo => ({
        id: c.id, numero: c.numero, data: c.data, status: c.status,
        dataValidade: c.dataValidade,
        totalFornecedores: c.fornecedores.length,
        totalRespostas: c.fornecedores.filter((f: any) => f.status === 'RESPONDIDA').length,
        vencedorFornecedorId: c.vencedorFornecedorId ?? null, createdAt: c.createdAt,
      })),
      nextCursor: p.nextCursor,
    }));
  },

  /** #110: as cotações ADJUDICADAS desta requisição (nunca as de outra) para a conversão. */
  async listarCotacoesAdjudicadasDaRequisicao(requisicaoId: string, ctx: Ctx) {
    const cotacoes = await db.cotacao.findMany({
      where: { tenantId: ctx.tenantId, requisicaoCompraId: requisicaoId, status: 'ADJUDICADA', vencedorFornecedorId: { not: null } },
      include: { fornecedores: { include: { fornecedor: { select: { nome: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return cotacoes.map((c): CotacaoAdjudicadaDto => {
      const vencedor = c.fornecedores.find((f) => f.fornecedorId === c.vencedorFornecedorId);
      return {
        id: c.id,
        numero: c.numero,
        vencedorFornecedorId: c.vencedorFornecedorId!,
        vencedorNome: vencedor?.fornecedor.nome ?? c.vencedorFornecedorId!,
        valorTotal: vencedor?.valorTotal?.toString() ?? null,
        prazoEntregaDias: vencedor?.prazoEntregaDias ?? null,
      };
    });
  },

  // ---- Pedido de Compra ----

  async criarPedido(input: CreatePedidoCompraInput, ctx: Ctx) {
    const totais = calcularTotaisPedido(input.itens.map((i) => ({
      quantidade: i.quantidade, precoUnitario: i.precoUnitario,
      desconto: i.desconto ?? 0, taxaIva: i.taxaIva ?? 0.16,
    })));

    const numero = await prisma.$transaction(async (tx) =>
      proximoNumeroSerie(tx as unknown as Prisma.TransactionClient, 'PEDIDO_COMPRA', ctx, input.data ?? new Date()),
    );

    const pedido = await db.pedidoCompra.create({
      data: {
        tenantId: ctx.tenantId,
        numero, data: input.data ?? new Date(),
        fornecedorId: input.fornecedorId,
        requisicaoCompraId: input.requisicaoCompraId,
        cotacaoId: input.cotacaoId,
        condicoesPagamento: input.condicoesPagamento,
        prazoEntregaDias: input.prazoEntregaDias,
        dataEntregaPrevista: input.dataEntregaPrevista,
        enderecoEntrega: input.enderecoEntrega,
        centroCustoId: input.centroCustoId,
        observacoes: input.observacoes,
        ...totais,
        itens: {
          create: input.itens.map((i) => ({
            tenantId: ctx.tenantId,
            produtoId: i.produtoId, descricao: i.descricao,
            quantidade: i.quantidade, unidadeMedida: i.unidadeMedida,
            precoUnitario: i.precoUnitario,
            desconto: i.desconto ?? 0, taxaIva: i.taxaIva ?? 0.16,
            subtotal: i.quantidade * i.precoUnitario * (1 - (i.desconto ?? 0) / (i.quantidade * i.precoUnitario || 1)) * (1 + (i.taxaIva ?? 0.16)),
            observacoes: i.observacoes,
          })),
        },
      },
      include: {
        itens: true, aprovacoes: true, recebimentos: { include: { itens: true } },
        fornecedor: { select: { nome: true } },
      },
    });
    return toPedidoDetalhe(pedido);
  },

  async converterRequisicaoEmPedido(requisicaoId: string, cotacaoId: string, ctx: Ctx) {
    const req = await db.requisicaoCompra.findUnique({
      where: { id: requisicaoId }, include: { itens: true },
    });
    if (!req || req.tenantId !== ctx.tenantId) throw new NotFoundError('Requisição não encontrada');
    if (req.status !== 'APROVADA') throw new BusinessRuleError('ESTADO_INVALIDO', 'Requisição não está aprovada');

    const cotacao = await db.cotacao.findUnique({
      where: { id: cotacaoId }, include: { fornecedores: true, itens: { include: { respostas: true } } },
    });
    if (!cotacao || cotacao.tenantId !== ctx.tenantId) throw new NotFoundError('Cotação não encontrada');
    const vencedorFornecedorId = cotacao.vencedorFornecedorId;
    if (cotacao.status !== 'ADJUDICADA' || !vencedorFornecedorId) {
      throw new BusinessRuleError('ESTADO_INVALIDO', 'Cotação não foi adjudicada');
    }
    if (cotacao.requisicaoCompraId && cotacao.requisicaoCompraId !== requisicaoId) {
      throw new BusinessRuleError('COTACAO_DE_OUTRA_REQUISICAO', 'A cotação pertence a outra requisição');
    }

    const fornecedorVencedor = cotacao.fornecedores.find((f: any) => f.fornecedorId === vencedorFornecedorId);

    // Carrega a taxa de IVA dos produtos com tenantId explícito (ADR issue #77).
    const produtoIds: string[] = req.itens
      .map((i) => i.produtoId)
      .filter((id): id is string => id != null);
    const produtos = produtoIds.length > 0
      ? await db.produto.findMany({
          where: { id: { in: produtoIds }, tenantId: ctx.tenantId },
          select: { id: true, taxaIva: true },
        })
      : [];
    const taxaPorProduto = new Map(
      produtos.map((p) => {
        let taxa;
        try {
          taxa = lerTaxaIva(p.taxaIva.toString());
        } catch {
          throw new BusinessRuleError(
            'TAXA_IVA_PRODUTO_INVALIDA',
            `Produto ${p.id} tem taxa de IVA inválida: ${String(p.taxaIva)}`,
          );
        }
        return [p.id, taxa] as const;
      }),
    );

    const itensPedido = req.itens.map((item: any) => ({
      produtoId: item.produtoId,
      descricao: item.descricao,
      quantidade: Number(item.quantidade),
      unidadeMedida: item.unidadeMedida,
      precoUnitario: Number(item.precoEstimado),
      desconto: 0,
      taxaIva: item.produtoId != null
        ? (taxaPorProduto.get(item.produtoId) ?? TAXA_IVA_NORMAL)
        : TAXA_IVA_NORMAL,
    }));

    const totais = calcularTotaisPedido(itensPedido);

    // Número, pedido e requisição CONVERTIDA na MESMA tx: uma recusa não queima número.
    // A numeração tranca a série (FOR UPDATE); só depois se relê o estado da requisição —
    // uma segunda conversão concorrente (duplo clique) espera pela primeira, vê CONVERTIDA
    // e é recusada, com a série reposta pelo rollback.
    return prisma.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaClient;
      const numero = await proximoNumeroSerie(rawTx as unknown as Prisma.TransactionClient, 'PEDIDO_COMPRA', ctx, new Date());
      const trancada = await tx.requisicaoCompra.findUnique({ where: { id: requisicaoId } });
      if (!trancada || trancada.tenantId !== ctx.tenantId) throw new NotFoundError('Requisição não encontrada');
      if (trancada.status !== 'APROVADA') {
        throw new BusinessRuleError('ESTADO_INVALIDO', 'Requisição não está aprovada (já foi convertida?)');
      }
      const pedido = await tx.pedidoCompra.create({
        data: {
          tenantId: ctx.tenantId, numero, data: new Date(),
          fornecedorId: vencedorFornecedorId,
          requisicaoCompraId: requisicaoId, cotacaoId,
          condicoesPagamento: fornecedorVencedor?.condicoesPagamento ?? '30 dias',
          prazoEntregaDias: fornecedorVencedor?.prazoEntregaDias ?? 30,
          dataEntregaPrevista: new Date(Date.now() + (fornecedorVencedor?.prazoEntregaDias ?? 30) * 86400000),
          enderecoEntrega: 'A definir', // Wave 3: buscar endereço do tenant
          ...totais,
          itens: { create: itensPedido.map((i: any) => ({ ...i, tenantId: ctx.tenantId, subtotal: i.quantidade * i.precoUnitario * (1 + i.taxaIva) })) },
        },
        include: {
          itens: true, aprovacoes: true, recebimentos: { include: { itens: true } },
          fornecedor: { select: { nome: true } },
        },
      });
      await tx.requisicaoCompra.update({ where: { id: requisicaoId }, data: { status: 'CONVERTIDA' } });
      return toPedidoDetalhe(pedido);
    }) as Promise<PedidoCompraDetalhe>;
  },

  async actualizarPedido(id: string, input: UpdatePedidoCompraInput, ctx: Ctx) {
    const p = await db.pedidoCompra.findUnique({ where: { id } });
    if (!p || p.tenantId !== ctx.tenantId) throw new NotFoundError('Pedido não encontrado');
    if (p.status !== 'RASCUNHO') throw new BusinessRuleError('ESTADO_INVALIDO', 'Apenas pedidos em rascunho podem ser actualizados');

    const updated = await db.pedidoCompra.update({
      where: { id }, data: input,
      include: { itens: true, aprovacoes: true, recebimentos: { include: { itens: true } }, fornecedor: { select: { nome: true } } },
    });
    return toPedidoDetalhe(updated);
  },

  async enviarPedido(id: string, ctx: Ctx) {
    const p = await db.pedidoCompra.findUnique({ where: { id } });
    if (!p || p.tenantId !== ctx.tenantId) throw new NotFoundError('Pedido não encontrado');
    transitar(TRANSICOES_PEDIDO_COMPRA, 'pedido de compra', p.status as StatusPedidoCompra, 'ENVIADO');
    await db.pedidoCompra.update({ where: { id }, data: { status: 'ENVIADO' } });
  },

  /** #110: o fornecedor confirmou o pedido (ENVIADO → CONFIRMADO). */
  async confirmarPedido(id: string, ctx: Ctx) {
    const p = await db.pedidoCompra.findUnique({ where: { id } });
    if (!p || p.tenantId !== ctx.tenantId) throw new NotFoundError('Pedido não encontrado');
    transitar(TRANSICOES_PEDIDO_COMPRA, 'pedido de compra', p.status as StatusPedidoCompra, 'CONFIRMADO');
    await db.pedidoCompra.update({ where: { id }, data: { status: 'CONFIRMADO' } });
  },

  /** #110: o fornecedor expediu a mercadoria (CONFIRMADO → EM_TRANSITO); a recepção fica possível. */
  async marcarPedidoEmTransito(id: string, ctx: Ctx) {
    const p = await db.pedidoCompra.findUnique({ where: { id } });
    if (!p || p.tenantId !== ctx.tenantId) throw new NotFoundError('Pedido não encontrado');
    transitar(TRANSICOES_PEDIDO_COMPRA, 'pedido de compra', p.status as StatusPedidoCompra, 'EM_TRANSITO');
    await db.pedidoCompra.update({ where: { id }, data: { status: 'EM_TRANSITO' } });
  },

  async cancelarPedido(id: string, motivo: string, ctx: Ctx) {
    const p = await db.pedidoCompra.findUnique({ where: { id } });
    if (!p || p.tenantId !== ctx.tenantId) throw new NotFoundError('Pedido não encontrado');
    transitar(TRANSICOES_PEDIDO_COMPRA, 'pedido de compra', p.status as StatusPedidoCompra, 'CANCELADO');
    // O motivo junta-se às observações em vez de as apagar.
    const observacoes = [p.observacoes, `Cancelado: ${motivo}`].filter(Boolean).join('\n');
    await db.pedidoCompra.update({ where: { id }, data: { status: 'CANCELADO', observacoes } });
  },

  async obterPedido(id: string, ctx: Ctx) {
    const p = await db.pedidoCompra.findUnique({
      where: { id },
      include: { itens: true, aprovacoes: true, recebimentos: { include: { itens: true } }, fornecedor: { select: { nome: true } } },
    });
    if (!p || p.tenantId !== ctx.tenantId) throw new NotFoundError('Pedido não encontrado');
    return toPedidoDetalhe(p);
  },

  async listarPedidos(filtros: FilterPedidoCompraInput, ctx: Ctx) {
    const { status, fornecedorId, cursor, take = 25, orderBy = 'createdAt', orderDir = 'desc' } = filtros;
    const where: any = {
      tenantId: ctx.tenantId,
      ...(status ? { status } : {}),
      ...(fornecedorId ? { fornecedorId } : {}),
    };
    return paginate(
      (a) => db.pedidoCompra.findMany({
        ...a, where,
        include: { fornecedor: { select: { nome: true } } },
        orderBy: { [orderBy]: orderDir },
      }),
      { cursor, take },
    ).then((p: any) => ({ items: p.items.map(toPedidoResumo), nextCursor: p.nextCursor }));
  },

  // ---- Recebimento de Mercadoria ----

  /**
   * ADR-0003 A8: entradaStock chamado para cada recebimento (parcial OU total).
   * Wave 3: integração real com WS A (entradaStock).
   */
  async registarRecebimento(input: CreateRecebimentoCompraInput, ctx: Ctx) {
    return prisma.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaClient;
      // Tranca o pedido ANTES de ler o já recebido: duas recepções concorrentes (duplo clique)
      // serializam aqui e a segunda lê o estado deixado pela primeira (#111).
      await tx.$queryRaw`SELECT id FROM "PedidoCompra" WHERE id = ${input.pedidoCompraId} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
      const pedido = await tx.pedidoCompra.findUnique({
        where: { id: input.pedidoCompraId },
        include: { itens: true },
      });
      if (!pedido || pedido.tenantId !== ctx.tenantId) throw new NotFoundError('Pedido não encontrado');

      const statusValidos: StatusPedidoCompra[] = ['EM_TRANSITO', 'RECEBIDO_PARCIAL'];
      if (!statusValidos.includes(pedido.status as StatusPedidoCompra)) {
        throw new BusinessRuleError('ESTADO_INVALIDO', 'Pedido não está em trânsito');
      }

      // Validar que Σ(recebida) ≤ Σ(pedida) para cada item — o mesmo item em várias linhas
      // conta pela soma (#111).
      const recebidaPorItem = new Map<string, number>();
      for (const itemInput of input.itens) {
        recebidaPorItem.set(
          itemInput.itemPedidoCompraId,
          (recebidaPorItem.get(itemInput.itemPedidoCompraId) ?? 0) + itemInput.quantidadeRecebida,
        );
      }
      for (const [itemId, recebida] of recebidaPorItem) {
        const itemPedido = pedido.itens.find((i: any) => i.id === itemId);
        if (!itemPedido) throw new NotFoundError(`Item ${itemId} não encontrado no pedido`);

        const jaRecebida = Number(itemPedido.quantidadeRecebida ?? 0);
        const total = jaRecebida + recebida;
        if (total > Number(itemPedido.quantidade) + 0.0001) {
          throw new BusinessRuleError(
            'QUANTIDADE_EXCEDIDA',
            `Item "${itemPedido.descricao}": quantidade recebida total (${total}) excede quantidade pedida (${itemPedido.quantidade})`,
          );
        }
      }

      // A localização que vai receber stock tem de ser do tenant e estar activa (#111).
      // Item sem produto não mexe em stock, logo não lê a localização.
      const locIds = [
        ...new Set(
          input.itens
            .filter((i) => i.quantidadeAceita > 0 && pedido.itens.find((p: any) => p.id === i.itemPedidoCompraId)?.produtoId)
            .map((i) => i.localizacaoDestinoId),
        ),
      ];
      if (locIds.length > 0) {
        const locs = await tx.localizacao.findMany({
          where: { id: { in: locIds }, tenantId: ctx.tenantId, deletedAt: null },
          select: { id: true, ativa: true },
        });
        for (const id of locIds) {
          const l = locs.find((x: any) => x.id === id);
          if (!l) throw new NotFoundError('Localização não encontrada');
          if (!l.ativa) throw new BusinessRuleError('LOCALIZACAO_INATIVA', 'A localização de destino está inactiva');
        }
      }

      // Determinar status do recebimento
      const totalItens = pedido.itens.length;
      const temDivergencia = input.itens.some((i) => i.quantidadeRejeitada > 0);
      const statusRecebimento = temDivergencia ? 'COM_DIVERGENCIA' : 'COMPLETO';

      // Criar RecebimentoCompra
      const recebimento = await tx.recebimentoCompra.create({
        data: {
          tenantId: ctx.tenantId,
          pedidoCompraId: input.pedidoCompraId,
          data: input.data ?? new Date(),
          numeroDocumento: input.numeroDocumento,
          responsavelId: ctx.userId,
          responsavelNome: await nomeDoUtilizador(tx, ctx),
          status: statusRecebimento,
          observacoes: input.observacoes,
          itens: {
            create: input.itens.map((i) => ({
              tenantId: ctx.tenantId,
              itemPedidoCompraId: i.itemPedidoCompraId,
              quantidadeRecebida: i.quantidadeRecebida,
              quantidadeAceita: i.quantidadeAceita,
              quantidadeRejeitada: i.quantidadeRejeitada,
              motivoRejeicao: i.motivoRejeicao,
              observacoes: i.observacoes,
            })),
          },
        },
        include: { itens: true },
      });

      // Actualizar quantidadeRecebida em cada ItemPedidoCompra
      for (const itemInput of input.itens) {
        const itemPedido = pedido.itens.find((i: any) => i.id === itemInput.itemPedidoCompraId);
        await tx.itemPedidoCompra.update({
          where: { id: itemInput.itemPedidoCompraId },
          data: { quantidadeRecebida: { increment: itemInput.quantidadeAceita } },
        });

        // ADR-0003 A8: entradaStock para CADA item aceite (parcial OU total)
        if (itemInput.quantidadeAceita > 0 && itemPedido?.produtoId) {
          await entradaStock(
            tx as unknown as Prisma.TransactionClient,
            {
              produtoId: itemPedido.produtoId,
              localizacaoDestinoId: itemInput.localizacaoDestinoId,
              quantidade: itemInput.quantidadeAceita,
              documentoReferenciaId: recebimento.id,
              documentoReferenciaTipo: 'RecebimentoCompra',
            },
            ctx,
          );
        }
      }

      // Verificar se todos os itens foram recebidos na totalidade
      const itensActualizados = await tx.itemPedidoCompra.findMany({
        where: { tenantId: ctx.tenantId, pedidoCompraId: input.pedidoCompraId },
      });
      const todosRecebidos = itensActualizados.every(
        (i: any) => Number(i.quantidadeRecebida) >= Number(i.quantidade) - 0.0001,
      );
      const algumRecebido = itensActualizados.some((i: any) => Number(i.quantidadeRecebida) > 0);

      let novoStatus: StatusPedidoCompra = pedido.status as StatusPedidoCompra;
      if (todosRecebidos) novoStatus = 'RECEBIDO_TOTAL';
      else if (algumRecebido) novoStatus = 'RECEBIDO_PARCIAL';

      await tx.pedidoCompra.update({ where: { id: input.pedidoCompraId }, data: { status: novoStatus } });

      // Se RECEBIDO_TOTAL → criar ContaPagar + lançamento de reconhecimento (ADR-0034 §1)
      if (novoStatus === 'RECEBIDO_TOTAL') {
        const dataEmissaoCP = new Date();
        const numCP = await proximoNumeroSerie(tx as unknown as Prisma.TransactionClient, 'CONTA_PAGAR', ctx, dataEmissaoCP);
        const descricaoCP = `Compra via pedido ${pedido.numero}`;

        // Carregar fornecedor para copiar o NUIT no momento do registo (ADR-0034 §1)
        const fornecedorCP = await tx.fornecedor.findUnique({
          where: { id: pedido.fornecedorId },
          select: { nuit: true },
        });

        // O PedidoCompra tem valorSubtotal, valorIva e taxaIva — preenchemos o bloco fiscal
        // para que fique disponível ao apuramento. tipoAquisicao fica null: sem o número da
        // factura do fornecedor (que costuma chegar depois da mercadoria) a dedução não pode
        // ser registada (ver ADR-0034 §1 e a guarda DOCUMENTO_FORNECEDOR_INCOMPLETO).
        //
        // LACUNA DECLARADA: não existe hoje um caminho para completar o bloco fiscal
        // (preencher tipoAquisicao, numeroDocumento) quando a factura chega e registar
        // retroactivamente o D 4432x. O ADR-0034 §1 antecipa que um modelo FaturaFornecedor
        // separado "seria o desenho de domínio correcto" e foi adiado por proporção.
        // Até esse caminho existir, as compras via recebimento não geram IVA dedutível.
        const contaCriada = await tx.contaPagar.create({
          data: {
            tenantId: ctx.tenantId,
            numero: numCP,
            fornecedorId: pedido.fornecedorId,
            pedidoCompraId: input.pedidoCompraId,
            descricao: descricaoCP,
            valorOriginal: pedido.valorTotal,
            valorPago: 0,
            valorRestante: pedido.valorTotal,
            dataEmissao: dataEmissaoCP,
            dataVencimento: new Date(Date.now() + pedido.prazoEntregaDias * 86_400_000),
            status: 'ABERTA',
            nuitFornecedor: fornecedorCP?.nuit ?? null,
            baseIva:   pedido.valorSubtotal,
            taxaIva:   pedido.taxaIva,
            valorIva:  pedido.valorIva,
            tipoAquisicao: null,  // sem factura do fornecedor não há dedução
            numeroDocumento: null,
            dataDocumento:   null,
          },
        });

        // Lançamento de reconhecimento: D 211 Mercadorias / C 421 Fornecedores c/c
        // Conta de débito: PGC_COMPRAS.MERCADORIAS ('211') — padrão do produto
        // para recepção de mercadoria, sem configuração de tenant (ver PGC_PAYROLL).
        //
        // Sem IVA dedutível: a factura do fornecedor costuma chegar depois da
        // mercadoria; sem `numeroDocumento` não há direito à dedução (ADR-0034 §1).
        //
        // LACUNA DECLARADA: não existe um caminho para completar o bloco fiscal
        // (preencher tipoAquisicao, numeroDocumento e reclassificar o IVA para 4432x)
        // quando a factura chegar. O ADR-0034 §1 antecipa que um modelo FaturaFornecedor
        // separado seria o desenho correcto e foi adiado por proporção. Até lá,
        // o bloco fiscal (nuitFornecedor, baseIva, valorIva, taxaIva) está gravado
        // na ContaPagar, mas o direito à dedução não é registado neste fluxo.
        await lancarReconhecimentoDivida(
          tx as unknown as Prisma.TransactionClient,
          {
            contaPagarId:    contaCriada.id,
            numero:          numCP,
            descricao:       descricaoCP,
            contaCodigo:     PGC_COMPRAS.MERCADORIAS,
            valorOriginal:   pedido.valorTotal,
            tipoAquisicao:   null,
            baseIva:         null,
            valorIva:        null,
            dataLancamento:  dataEmissaoCP,
          },
          ctx,
        );
      }

      return toRecebimentoDto(recebimento);
    }) as Promise<RecebimentoCompraDto>;
  },

  async listarRecebimentos(pedidoId: string, ctx: Ctx) {
    const pedido = await db.pedidoCompra.findUnique({ where: { id: pedidoId } });
    if (!pedido || pedido.tenantId !== ctx.tenantId) throw new NotFoundError('Pedido não encontrado');

    const recebimentos = await db.recebimentoCompra.findMany({
      where: { tenantId: ctx.tenantId, pedidoCompraId: pedidoId },
      include: { itens: true },
      orderBy: { createdAt: 'desc' },
    });
    return recebimentos.map(toRecebimentoDto);
  },
};

// =====================================================================
// Mappers auxiliares para Cotação
// =====================================================================

function toCotacaoDetalhe(c: any): CotacaoDetalhe {
  return {
    id: c.id, numero: c.numero, data: c.data, status: c.status,
    dataValidade: c.dataValidade,
    totalFornecedores: (c.fornecedores ?? []).length,
    totalRespostas: (c.fornecedores ?? []).filter((f: any) => f.status === 'RESPONDIDA').length,
    vencedorFornecedorId: c.vencedorFornecedorId ?? null,
    createdAt: c.createdAt,
    requisicaoCompraId: c.requisicaoCompraId ?? null,
    observacoes: c.observacoes ?? null,
    fornecedores: (c.fornecedores ?? []).map((f: any) => ({
      id: f.id, fornecedorId: f.fornecedorId, fornecedorNome: f.fornecedor?.nome ?? f.fornecedorId,
      status: f.status, dataEnvio: f.dataEnvio ?? null, dataResposta: f.dataResposta ?? null,
      valorTotal: f.valorTotal ? Number(f.valorTotal) : null,
      prazoEntregaDias: f.prazoEntregaDias ?? null, condicoesPagamento: f.condicoesPagamento ?? null,
    })),
    itens: (c.itens ?? []).map((i: any) => ({
      id: i.id, produtoId: i.produtoId ?? null, descricao: i.descricao,
      quantidade: Number(i.quantidade), unidadeMedida: i.unidadeMedida,
      respostas: (i.respostas ?? []).map((r: any) => ({
        cotacaoFornecedorId: r.cotacaoFornecedorId,
        fornecedorId: r.cotacaoFornecedor?.fornecedorId ?? '',
        precoUnitario: Number(r.precoUnitario), subtotal: Number(r.subtotal),
        prazoEntregaDias: r.prazoEntregaDias, marca: r.marca ?? null,
      })),
    })),
  };
}
