import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma, prismaBase } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { paginate } from '@/server/db/paginate';
import type { Ctx, TxClient } from '@/server/services/types';
import { proximoNumeroSerie } from '@/server/services/financas/faturacao.service';
import {
  TRANSICOES_ORDEM_PRODUCAO,
  TRANSICOES_OPERACAO_ORDEM,
  TRANSICOES_BOM,
  TRANSICOES_ROTEIRO,
  type StockContratoA,
  type ItemExplosaoBOM,
  type ResultadoCusteio,
} from './producao.interface';
import { transitar } from './rh.service';
import type {
  CreateCentroTrabalhoInput,
  CreateEstruturaProdutoInput,
  UpdateEstruturaProdutoInput,
  FilterEstruturaProdutoInput,
  CreateComponenteBOMInput,
  CreateRoteiroInput,
  UpdateRoteiroInput,
  FilterRoteiroInput,
  CreateOrdemProducaoInput,
  UpdateOrdemProducaoInput,
  FilterOrdemProducaoInput,
  RegistarConsumoInput,
  ExplodirBOMInput,
} from '@/lib/validations/producao';

// ─────────────────────────────────────────────────────────────────────────────
// Utilitários internos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve o ID de uma Localização do tipo ARMAZEM por código no tenant actual.
 * Convenção: 'MP' = Matérias-Primas, 'PA' = Produto Acabado.
 * Lança BusinessRuleError se a localização não existir ou estiver inactiva.
 */
async function resolverArmazem(
  tx: TxClient,
  ctx: Ctx,
  codigo: 'MP' | 'PA',
): Promise<string> {
  const descricao = codigo === 'MP' ? 'armazém de matérias-primas' : 'armazém de produto acabado';
  const loc = await tx.localizacao.findFirst({
    where: {
      tenantId: ctx.tenantId,
      tipo: 'ARMAZEM' as never,
      codigo,
      ativa: true,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!loc) {
    throw new BusinessRuleError(
      'LOCALIZACAO_NAO_CONFIGURADA',
      `Localização "${codigo}" (${descricao}) não configurada para este tenant. Crie uma Localização com código "${codigo}" e tipo ARMAZEM.`,
    );
  }
  return loc.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detecção de ciclo na BOM (DFS pelo componentePaiId)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lança BusinessRuleError('CICLO_BOM') se adicionar componenteProdutoId como filho de
 * componentePaiId criaria um ciclo (o componenteProdutoId já está na cadeia de ancestrais).
 */
async function assertSemCicloBOM(
  tx: TxClient,
  estruturaProdutoId: string,
  componenteProdutoId: string,
  componentePaiId: string | null | undefined,
  tenantId: string,
): Promise<void> {
  if (!componentePaiId) return; // nó raiz → sem ciclo possível

  const todos = await tx.componenteBOM.findMany({
    where: { estruturaProdutoId, tenantId },
    select: { id: true, componenteProdutoId: true, componentePaiId: true },
  });

  // Mapa: componenteId → { produtoId, paiId }
  const mapa = new Map(todos.map((c) => [c.id, { produtoId: c.componenteProdutoId, paiId: c.componentePaiId }]));

  // Subir pela cadeia componentePaiId → root; se produtoId aparecer → ciclo
  let atual: string | null | undefined = componentePaiId;
  const visitados = new Set<string>();
  while (atual) {
    if (visitados.has(atual)) break; // ciclo estrutural inesperado — parar com segurança
    visitados.add(atual);
    const node = mapa.get(atual);
    if (!node) break;
    if (node.produtoId === componenteProdutoId) {
      throw new BusinessRuleError('CICLO_BOM', 'Adicionar este componente criaria um ciclo na BOM');
    }
    atual = node.paiId;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Explosão de BOM
// ─────────────────────────────────────────────────────────────────────────────

async function _explodir(
  tx: TxClient,
  estruturaProdutoId: string,
  quantidade: number,
  explosaoTotal: boolean,
  tenantId: string,
): Promise<ItemExplosaoBOM[]> {
  const componentes = await tx.componenteBOM.findMany({
    where: { estruturaProdutoId, tenantId, ativo: true },
    select: {
      id: true,
      componenteProdutoId: true,
      codigoComponente: true,
      nomeComponente: true,
      categoria: true,
      quantidade: true,
      unidadeMedida: true,
      custoUnitario: true,
      perdaPrevista: true,
      tempoLead: true,
      componentePaiId: true,
    },
  });

  // Detectar ciclos antes da explosão (DFS com coloração)
  const filhosMap = new Map<string | null, typeof componentes>();
  for (const c of componentes) {
    const chave = c.componentePaiId ?? null;
    if (!filhosMap.has(chave)) filhosMap.set(chave, []);
    filhosMap.get(chave)!.push(c);
  }

  const visitados = new Set<string>();
  const emCaminho = new Set<string>();

  function verificarCiclos(id: string): void {
    if (emCaminho.has(id)) {
      throw new BusinessRuleError('CICLO_BOM', 'Ciclo detectado na BOM durante explosão');
    }
    if (visitados.has(id)) return;
    emCaminho.add(id);
    for (const filho of filhosMap.get(id) ?? []) {
      verificarCiclos(filho.id);
    }
    emCaminho.delete(id);
    visitados.add(id);
  }
  for (const raiz of filhosMap.get(null) ?? []) {
    verificarCiclos(raiz.id);
  }

  // DFS de explosão
  const resultado: ItemExplosaoBOM[] = [];

  function visitar(paiId: string | null, fator: number, nivel: number): void {
    for (const c of filhosMap.get(paiId) ?? []) {
      const perda = Number(c.perdaPrevista);
      const fatorAjustado = perda < 1 ? fator / (1 - perda) : fator;
      const qtdTotal = Number(c.quantidade) * fatorAjustado;
      const custo = Number(c.custoUnitario);

      resultado.push({
        nivel,
        componenteProdutoId: c.componenteProdutoId,
        codigoComponente: c.codigoComponente,
        nomeComponente: c.nomeComponente,
        categoria: c.categoria,
        quantidadeTotal: qtdTotal,
        unidadeMedida: c.unidadeMedida,
        custoUnitario: custo,
        custoTotal: qtdTotal * custo,
        tempoLead: c.tempoLead,
      });

      if (explosaoTotal) visitar(c.id, qtdTotal, nivel + 1);
    }
  }

  visitar(null, quantidade, 1);
  return resultado;
}

// ─────────────────────────────────────────────────────────────────────────────
// CentroTrabalhoService
// ─────────────────────────────────────────────────────────────────────────────

export const CentroTrabalhoService = {
  async criar(input: CreateCentroTrabalhoInput, ctx: Ctx): Promise<{ id: string }> {
    const ct = await prisma.centroTrabalho.create({
      data: {
        tenantId: ctx.tenantId,
        codigo: input.codigo,
        nome: input.nome,
        tipo: input.tipo,
        descricao: input.descricao,
        capacidadeHorasDia: input.capacidadeHorasDia,
        custoHora: input.custoHora,
        ativo: input.ativo ?? true,
      },
      select: { id: true },
    });
    return { id: ct.id };
  },

  async actualizar(id: string, input: Partial<CreateCentroTrabalhoInput>, ctx: Ctx): Promise<void> {
    const existente = await prisma.centroTrabalho.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!existente) throw new NotFoundError('Centro de trabalho não encontrado');
    await prisma.centroTrabalho.update({ where: { id }, data: input as Record<string, unknown> });
  },

  async listar(
    filter: { tipo?: string; ativo?: boolean; cursor?: string; take?: number },
    ctx: Ctx,
  ) {
    return paginate(
      (a) =>
        prisma.centroTrabalho.findMany({
          ...a,
          where: {
            tenantId: ctx.tenantId,
            ...(filter.tipo ? { tipo: filter.tipo as never } : {}),
            ...(filter.ativo !== undefined ? { ativo: filter.ativo } : {}),
          },
          orderBy: { codigo: 'asc' },
        }),
      { cursor: filter.cursor, take: filter.take },
    );
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// EstruturaProdutoService (BOM)
// ─────────────────────────────────────────────────────────────────────────────

export const EstruturaProdutoService = {
  async criar(input: CreateEstruturaProdutoInput, ctx: Ctx): Promise<{ id: string }> {
    const ep = await prismaBase.$transaction(async (tx) => {
      const e = await tx.estruturaProduto.create({
        data: {
          tenantId: ctx.tenantId,
          produtoId: input.produtoId,
          codigo: input.codigo,
          nome: input.nome,
          versao: input.versao,
          status: input.status ?? 'RASCUNHO',
          categoria: input.categoria,
          unidadeProducao: input.unidadeProducao,
          tempoProducao: input.tempoProducao,
          nivelComplexidade: input.nivelComplexidade,
          responsavelId: input.responsavelId,
          observacoes: input.observacoes,
        },
        select: { id: true },
      });

      if (input.componentes?.length) {
        for (const comp of input.componentes) {
          await assertSemCicloBOM(tx, e.id, comp.componenteProdutoId, comp.componentePaiId, ctx.tenantId);
          await tx.componenteBOM.create({
            data: {
              tenantId: ctx.tenantId,
              estruturaProdutoId: e.id,
              componenteProdutoId: comp.componenteProdutoId,
              codigoComponente: comp.codigoComponente,
              nomeComponente: comp.nomeComponente,
              categoria: comp.categoria,
              quantidade: comp.quantidade,
              unidadeMedida: comp.unidadeMedida,
              custoUnitario: comp.custoUnitario,
              perdaPrevista: comp.perdaPrevista,
              tempoLead: comp.tempoLead,
              fornecedorPrincipalId: comp.fornecedorPrincipalId,
              componentePaiId: comp.componentePaiId,
              ativo: comp.ativo ?? true,
              observacoes: comp.observacoes,
            },
          });
        }
      }

      return e;
    });

    return { id: ep.id };
  },

  async actualizar(id: string, input: UpdateEstruturaProdutoInput, ctx: Ctx): Promise<void> {
    const existente = await prisma.estruturaProduto.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { status: true },
    });
    if (!existente) throw new NotFoundError('Estrutura de produto não encontrada');
    if (existente.status === 'SUBSTITUIDO') {
      throw new BusinessRuleError('BOM_SUBSTITUIDA', 'Não é possível editar uma BOM substituída');
    }

    await prisma.estruturaProduto.update({
      where: { id },
      data: {
        nome: input.nome,
        versao: input.versao,
        categoria: input.categoria,
        unidadeProducao: input.unidadeProducao,
        tempoProducao: input.tempoProducao,
        nivelComplexidade: input.nivelComplexidade,
        responsavelId: input.responsavelId,
        observacoes: input.observacoes,
      },
    });
  },

  async adicionarComponente(
    estruturaId: string,
    input: CreateComponenteBOMInput,
    ctx: Ctx,
  ): Promise<{ id: string }> {
    const estrutura = await prisma.estruturaProduto.findFirst({
      where: { id: estruturaId, tenantId: ctx.tenantId },
      select: { status: true },
    });
    if (!estrutura) throw new NotFoundError('Estrutura de produto não encontrada');

    const comp = await prismaBase.$transaction(async (tx) => {
      await assertSemCicloBOM(tx, estruturaId, input.componenteProdutoId, input.componentePaiId, ctx.tenantId);

      return tx.componenteBOM.create({
        data: {
          tenantId: ctx.tenantId,
          estruturaProdutoId: estruturaId,
          componenteProdutoId: input.componenteProdutoId,
          codigoComponente: input.codigoComponente,
          nomeComponente: input.nomeComponente,
          categoria: input.categoria,
          quantidade: input.quantidade,
          unidadeMedida: input.unidadeMedida,
          custoUnitario: input.custoUnitario,
          perdaPrevista: input.perdaPrevista,
          tempoLead: input.tempoLead,
          fornecedorPrincipalId: input.fornecedorPrincipalId,
          componentePaiId: input.componentePaiId,
          ativo: input.ativo ?? true,
          observacoes: input.observacoes,
        },
        select: { id: true },
      });
    });

    return { id: comp.id };
  },

  async removerComponente(componenteId: string, ctx: Ctx): Promise<void> {
    const c = await prisma.componenteBOM.findFirst({
      where: { id: componenteId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!c) throw new NotFoundError('Componente não encontrado');
    await prisma.componenteBOM.delete({ where: { id: componenteId } });
  },

  async explodir(input: ExplodirBOMInput, ctx: Ctx): Promise<ItemExplosaoBOM[]> {
    const estrutura = await prisma.estruturaProduto.findFirst({
      where: { id: input.estruturaProdutoId, tenantId: ctx.tenantId },
      select: { id: true, status: true },
    });
    if (!estrutura) throw new NotFoundError('Estrutura de produto não encontrada');

    return prismaBase.$transaction((tx) =>
      _explodir(tx, input.estruturaProdutoId, input.quantidade, input.explosaoTotal ?? false, ctx.tenantId),
    );
  },

  async transitarStatus(id: string, novoStatus: string, ctx: Ctx): Promise<void> {
    const ep = await prisma.estruturaProduto.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { status: true },
    });
    if (!ep) throw new NotFoundError('Estrutura de produto não encontrada');

    transitar(TRANSICOES_BOM, ep.status, novoStatus);
    await prisma.estruturaProduto.update({ where: { id }, data: { status: novoStatus as never } });
  },

  async listar(filter: FilterEstruturaProdutoInput, ctx: Ctx) {
    return paginate(
      (a) =>
        prisma.estruturaProduto.findMany({
          ...a,
          where: {
            tenantId: ctx.tenantId,
            ...(filter.status ? { status: filter.status } : {}),
            ...(filter.produtoId ? { produtoId: filter.produtoId } : {}),
            ...(filter.nivelComplexidade ? { nivelComplexidade: filter.nivelComplexidade } : {}),
            ...(filter.search
              ? { OR: [{ nome: { contains: filter.search, mode: 'insensitive' } }, { codigo: { contains: filter.search, mode: 'insensitive' } }] }
              : {}),
          },
          orderBy: { createdAt: 'desc' },
        }),
      { cursor: filter.cursor, take: filter.take },
    );
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// RoteiroService
// ─────────────────────────────────────────────────────────────────────────────

export const RoteiroService = {
  async criar(input: CreateRoteiroInput, ctx: Ctx): Promise<{ id: string }> {
    const roteiro = await prismaBase.$transaction(async (tx) => {
      const r = await tx.roteiro.create({
        data: {
          tenantId: ctx.tenantId,
          codigo: input.codigo,
          nome: input.nome,
          estruturaProdutoId: input.estruturaProdutoId,
          versao: input.versao,
          status: input.status ?? 'RASCUNHO',
          categoria: input.categoria,
          responsavelId: input.responsavelId,
          observacoes: input.observacoes,
        },
        select: { id: true },
      });

      if (input.operacoes?.length) {
        await tx.operacaoRoteiro.createMany({
          data: input.operacoes.map((op) => ({
            tenantId: ctx.tenantId,
            roteiroId: r.id,
            sequencia: op.sequencia,
            nome: op.nome,
            descricao: op.descricao,
            centroTrabalhoId: op.centroTrabalhoId,
            maquina: op.maquina,
            tempoPreparacao: op.tempoPreparacao,
            tempoOperacao: op.tempoOperacao,
            tempoLimpeza: op.tempoLimpeza,
            custoHora: op.custoHora,
            eficienciaEsperada: op.eficienciaEsperada,
            dependencias: op.dependencias ?? [],
            paralela: op.paralela ?? false,
            obrigatoria: op.obrigatoria ?? true,
            instrucoes: op.instrucoes,
            ferramentasNecessarias: op.ferramentasNecessarias ?? [],
            qualificacoesRequeridas: op.qualificacoesRequeridas ?? [],
            status: op.status ?? 'ATIVO',
          })),
        });
      }

      return r;
    });

    return { id: roteiro.id };
  },

  async actualizar(id: string, input: UpdateRoteiroInput, ctx: Ctx): Promise<void> {
    const r = await prisma.roteiro.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { status: true },
    });
    if (!r) throw new NotFoundError('Roteiro não encontrado');
    if (r.status === 'SUBSTITUIDO') {
      throw new BusinessRuleError('ROTEIRO_SUBSTITUIDO', 'Não é possível editar um roteiro substituído');
    }

    await prisma.roteiro.update({
      where: { id },
      data: {
        nome: input.nome,
        versao: input.versao,
        categoria: input.categoria,
        responsavelId: input.responsavelId,
        observacoes: input.observacoes,
      },
    });
  },

  async transitarStatus(id: string, novoStatus: string, ctx: Ctx): Promise<void> {
    const r = await prisma.roteiro.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { status: true },
    });
    if (!r) throw new NotFoundError('Roteiro não encontrado');

    transitar(TRANSICOES_ROTEIRO, r.status, novoStatus);
    await prisma.roteiro.update({ where: { id }, data: { status: novoStatus as never } });
  },

  async calcularCusto(roteiroId: string, ctx: Ctx): Promise<{ custoTotal: number }> {
    const ops = await prisma.operacaoRoteiro.findMany({
      where: { roteiroId, tenantId: ctx.tenantId },
      select: { tempoPreparacao: true, tempoOperacao: true, tempoLimpeza: true, custoHora: true, eficienciaEsperada: true },
    });

    const total = ops.reduce((sum, op) => {
      const minutos = op.tempoPreparacao + op.tempoOperacao + op.tempoLimpeza;
      const horas = minutos / 60;
      const eficiencia = Number(op.eficienciaEsperada);
      const custo = horas * Number(op.custoHora) * (eficiencia > 0 ? 1 / eficiencia : 1);
      return sum + custo;
    }, 0);

    return { custoTotal: total };
  },

  async listar(filter: FilterRoteiroInput, ctx: Ctx) {
    return paginate(
      (a) =>
        prisma.roteiro.findMany({
          ...a,
          where: {
            tenantId: ctx.tenantId,
            ...(filter.status ? { status: filter.status } : {}),
            ...(filter.estruturaProdutoId ? { estruturaProdutoId: filter.estruturaProdutoId } : {}),
            ...(filter.search
              ? { OR: [{ nome: { contains: filter.search, mode: 'insensitive' } }, { codigo: { contains: filter.search, mode: 'insensitive' } }] }
              : {}),
          },
          orderBy: { createdAt: 'desc' },
        }),
      { cursor: filter.cursor, take: filter.take },
    );
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// OrdemProducaoService
// ─────────────────────────────────────────────────────────────────────────────

export const OrdemProducaoService = {
  async criar(
    tx: TxClient,
    input: CreateOrdemProducaoInput,
    ctx: Ctx,
  ): Promise<{ id: string; numero: string }> {
    const numero = await proximoNumeroSerie(tx, 'ORDEM_PRODUCAO', ctx);

    const ordem = await tx.ordemProducao.create({
      data: {
        tenantId: ctx.tenantId,
        numero,
        produtoId: input.produtoId,
        codigoProduto: input.codigoProduto,
        nomeProduto: input.nomeProduto,
        quantidade: input.quantidade,
        unidadeMedida: input.unidadeMedida,
        status: 'PLANEADA',
        prioridade: input.prioridade ?? 'MEDIA',
        roteiroId: input.roteiroId,
        lote: input.lote,
        numeroSerie: input.numeroSerie,
        responsavelId: input.responsavelId,
        dataPrevisaoInicio: input.dataPrevisaoInicio,
        dataPrevisaoFim: input.dataPrevisaoFim,
        custoEstimado: input.custoEstimado ?? 0,
        pedidoVendaId: input.pedidoVendaId,
        clienteId: input.clienteId,
        criadoPorId: ctx.userId,
        observacoes: input.observacoes,
      },
      select: { id: true, numero: true },
    });

    return { id: ordem.id, numero: ordem.numero };
  },

  async actualizar(id: string, input: UpdateOrdemProducaoInput, ctx: Ctx): Promise<void> {
    const ordem = await prisma.ordemProducao.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { status: true },
    });
    if (!ordem) throw new NotFoundError('Ordem de produção não encontrada');
    if (['CONCLUIDA', 'CANCELADA'].includes(ordem.status)) {
      throw new BusinessRuleError('ORDEM_TERMINAL', 'Não é possível editar uma ordem concluída ou cancelada');
    }

    await prisma.ordemProducao.update({
      where: { id },
      data: {
        prioridade: input.prioridade,
        lote: input.lote,
        numeroSerie: input.numeroSerie,
        responsavelId: input.responsavelId,
        dataPrevisaoInicio: input.dataPrevisaoInicio,
        dataPrevisaoFim: input.dataPrevisaoFim,
        observacoes: input.observacoes,
      },
    });
  },

  /**
   * Transita o status da OrdemProducao com integração de stock (WS A).
   * Todos os movimentos de stock ocorrem dentro do mesmo tx (atomicidade).
   */
  async transitarStatus(
    tx: TxClient,
    id: string,
    novoStatus: string,
    stockService: StockContratoA,
    ctx: Ctx,
  ): Promise<void> {
    const ordem = await tx.ordemProducao.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        status: true,
        produtoId: true,
        quantidade: true,
        roteiroId: true,
        qualidadeAprovada: true,
        operacoes: { select: { status: true } },
        consumos: { select: { id: true, reservaId: true } },
      },
    });
    if (!ordem) throw new NotFoundError('Ordem de produção não encontrada');

    transitar(TRANSICOES_ORDEM_PRODUCAO, ordem.status, novoStatus);

    // ── PLANEADA → LIBERADA: reservar stock para cada material da BOM ─────────
    if (ordem.status === 'PLANEADA' && novoStatus === 'LIBERADA') {
      // Encontrar a BOM activa para o produto
      const bom = await tx.estruturaProduto.findFirst({
        where: { produtoId: ordem.produtoId, tenantId: ctx.tenantId, status: 'ATIVO' },
        select: { id: true },
      });

      if (bom) {
        const materiais = await _explodir(tx, bom.id, Number(ordem.quantidade), true, ctx.tenantId);

        const localizacaoMpId = await resolverArmazem(tx, ctx, 'MP');
        for (const mat of materiais) {
          const { reservaId } = await stockService.reservarStock(
            tx,
            {
              produtoId: mat.componenteProdutoId,
              localizacaoId: localizacaoMpId,
              quantidade: mat.quantidadeTotal,
              documentoReferenciaId: id,
              documentoReferenciaTipo: 'OrdemProducao',
            },
            ctx,
          );

          // Registo de consumo planeado com reservaId (append-only)
          await tx.consumoProducao.create({
            data: {
              tenantId: ctx.tenantId,
              ordemProducaoId: id,
              produtoId: mat.componenteProdutoId,
              codigoProduto: mat.codigoComponente,
              nomeProduto: mat.nomeComponente,
              quantidadePrevista: mat.quantidadeTotal,
              quantidadeReal: mat.quantidadeTotal,
              unidadeMedida: mat.unidadeMedida,
              custoUnitario: mat.custoUnitario,
              custoTotal: mat.custoTotal,
              reservaId,
            },
          });
        }
      }
    }

    // ── EM_PRODUCAO → CONCLUIDA: confirmar consumos + entrada produto acabado ──
    if (novoStatus === 'CONCLUIDA') {
      // Validar que todas as operações estão concluídas
      const opsNaoConcluidas = (ordem.operacoes ?? []).filter((op) => op.status !== 'CONCLUIDA' && op.status !== 'CANCELADA');
      if (opsNaoConcluidas.length > 0) {
        throw new BusinessRuleError('OPERACOES_PENDENTES', 'Existem operações não concluídas');
      }

      // Validar aprovação de qualidade
      if (!ordem.qualidadeAprovada) {
        throw new BusinessRuleError('QUALIDADE_NAO_APROVADA', 'Qualidade não foi aprovada para esta ordem');
      }

      // Confirmar todos os consumos com reservaId
      for (const consumo of (ordem.consumos ?? [])) {
        if (consumo.reservaId) {
          const mov = await stockService.confirmarConsumoStock(tx, consumo.reservaId, ctx);
          // Registar o movimentoStockId no consumo
          await tx.consumoProducao.update({
            where: { id: consumo.id },
            data: { movimentoStockId: mov.id },
          });
        }
      }

      // Entrada do produto acabado em stock
      const localizacaoPaId = await resolverArmazem(tx, ctx, 'PA');
      await stockService.entradaStock(
        tx,
        {
          produtoId: ordem.produtoId,
          localizacaoDestinoId: localizacaoPaId,
          quantidade: Number(ordem.quantidade),
          documentoReferenciaId: id,
          documentoReferenciaTipo: 'ProducaoOutput',
        },
        ctx,
      );

      await tx.ordemProducao.update({
        where: { id },
        data: { status: 'CONCLUIDA', dataFimReal: new Date(), progresso: 100 },
      });
      return;
    }

    // ── → CANCELADA: libertar todas as reservas activas ───────────────────────
    if (novoStatus === 'CANCELADA') {
      if (['LIBERADA', 'EM_PRODUCAO', 'PAUSADA'].includes(ordem.status)) {
        for (const consumo of (ordem.consumos ?? [])) {
          if (consumo.reservaId) {
            await stockService.libertarStock(tx, consumo.reservaId, ctx);
          }
        }
      }
    }

    // ── LIBERADA → EM_PRODUCAO: registar dataInicioReal ─────────────────────
    const extraData: Record<string, unknown> = { status: novoStatus };
    if (ordem.status === 'LIBERADA' && novoStatus === 'EM_PRODUCAO') {
      extraData.dataInicioReal = new Date();
    }

    await tx.ordemProducao.update({
      where: { id },
      data: extraData as never,
    });
  },

  /** Registo de consumo real (append-only — sem DELETE nem UPDATE). */
  async registarConsumo(input: RegistarConsumoInput, ctx: Ctx): Promise<{ id: string }> {
    const ordem = await prisma.ordemProducao.findFirst({
      where: { id: input.ordemProducaoId, tenantId: ctx.tenantId },
      select: { status: true },
    });
    if (!ordem) throw new NotFoundError('Ordem de produção não encontrada');
    if (!['LIBERADA', 'EM_PRODUCAO'].includes(ordem.status)) {
      throw new BusinessRuleError('STATUS_INVALIDO', 'Só é possível registar consumo em ordens liberadas ou em produção');
    }

    // Aritmética em Decimal para evitar erros de precisão IEEE-754 em valores financeiros.
    const unitario = new Prisma.Decimal(String(input.custoUnitario));
    const qtdReal = new Prisma.Decimal(String(input.quantidadeReal));
    const custo = unitario.mul(qtdReal);

    const consumo = await prisma.consumoProducao.create({
      data: {
        tenantId: ctx.tenantId,
        ordemProducaoId: input.ordemProducaoId,
        produtoId: input.produtoId,
        codigoProduto: input.codigoProduto,
        nomeProduto: input.nomeProduto,
        quantidadePrevista: new Prisma.Decimal(String(input.quantidadePrevista)),
        quantidadeReal: qtdReal,
        unidadeMedida: input.unidadeMedida,
        custoUnitario: unitario,
        custoTotal: custo,
        // reservaId: null (consumo ad-hoc, não planeado com reserva)
      },
      select: { id: true },
    });

    return { id: consumo.id };
  },

  async transitarOperacao(
    operacaoId: string,
    novoStatus: string,
    tempoRealizado: number,
    ctx: Ctx,
  ): Promise<void> {
    const op = await prisma.operacaoOrdem.findFirst({
      where: { id: operacaoId, tenantId: ctx.tenantId },
      select: { status: true, ordemProducaoId: true },
    });
    if (!op) throw new NotFoundError('Operação não encontrada');

    transitar(TRANSICOES_OPERACAO_ORDEM, op.status, novoStatus);

    await prismaBase.$transaction(async (tx) => {
      await tx.operacaoOrdem.update({
        where: { id: operacaoId },
        data: {
          status: novoStatus as never,
          tempoRealizado,
          ...(novoStatus === 'EM_ANDAMENTO' ? { dataInicio: new Date() } : {}),
          ...(novoStatus === 'CONCLUIDA' ? { dataFim: new Date() } : {}),
        },
      });

      // Actualizar progresso da ordem: % operações concluídas
      const todasOps = await tx.operacaoOrdem.findMany({
        where: { ordemProducaoId: op.ordemProducaoId, tenantId: ctx.tenantId },
        select: { status: true },
      });
      const total = todasOps.length;
      const concluidas = todasOps.filter((o) => o.status === 'CONCLUIDA').length;
      const progresso = total > 0 ? Math.round((concluidas / total) * 100) : 0;

      await tx.ordemProducao.update({
        where: { id: op.ordemProducaoId },
        data: { progresso },
      });
    });
  },

  async apurarCusto(id: string, ctx: Ctx): Promise<ResultadoCusteio> {
    const ordem = await prisma.ordemProducao.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { custoEstimado: true },
    });
    if (!ordem) throw new NotFoundError('Ordem de produção não encontrada');

    // Custo real de materiais
    const consumoAgg = await prisma.consumoProducao.aggregate({
      where: { ordemProducaoId: id, tenantId: ctx.tenantId },
      _sum: { custoTotal: true },
    });
    const custoMateriais = Number(consumoAgg._sum.custoTotal ?? 0);

    // Custo de mão-de-obra: operações realizadas
    const ops = await prisma.operacaoOrdem.findMany({
      where: { ordemProducaoId: id, tenantId: ctx.tenantId, status: 'CONCLUIDA' },
      select: { tempoRealizado: true, centroTrabalhoId: true },
    });

    let custoMaoObra = 0;
    let custoCentroTrabalho = 0;

    for (const op of ops) {
      const horas = op.tempoRealizado / 60;
      if (op.centroTrabalhoId) {
        const ct = await prisma.centroTrabalho.findFirst({
          where: { id: op.centroTrabalhoId },
          select: { custoHora: true },
        });
        if (ct) {
          // custo = horas × taxa do CentroTrabalho
          custoCentroTrabalho += horas * Number(ct.custoHora);
        }
      } else {
        // Sem centro de trabalho: taxa de mão-de-obra directa indisponível nesta wave.
        // TODO Wave 3: obter custoHora do Colaborador (tabela de taxas horárias a configurar).
        // Por ora a contribuição é nula para não distorcer o custeio com uma unidade errada.
        custoMaoObra += horas * 0;
      }
    }

    const custoTotal = custoMateriais + custoMaoObra + custoCentroTrabalho;
    const custoEstimado = Number(ordem.custoEstimado);

    return {
      custoMateriais,
      custoMaoObra,
      custoCentroTrabalho,
      custoTotal,
      variacaoMateriais: custoMateriais - custoEstimado, // simplificado para Wave 2
      variacaoMaoObra: 0,
      variacaoTotal: custoTotal - custoEstimado,
    };
  },

  async listar(filter: FilterOrdemProducaoInput, ctx: Ctx) {
    return paginate(
      (a) =>
        prisma.ordemProducao.findMany({
          ...a,
          where: {
            tenantId: ctx.tenantId,
            ...(filter.status ? { status: filter.status } : {}),
            ...(filter.prioridade ? { prioridade: filter.prioridade } : {}),
            ...(filter.produtoId ? { produtoId: filter.produtoId } : {}),
            ...(filter.roteiroId ? { roteiroId: filter.roteiroId } : {}),
            ...(filter.responsavelId ? { responsavelId: filter.responsavelId } : {}),
            ...(filter.clienteId ? { clienteId: filter.clienteId } : {}),
            ...(filter.dataInicio ? { dataPrevisaoInicio: { gte: filter.dataInicio } } : {}),
            ...(filter.dataFim ? { dataPrevisaoFim: { lte: filter.dataFim } } : {}),
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, numero: true, nomeProduto: true, status: true, prioridade: true, progresso: true, dataPrevisaoFim: true },
        }),
      { cursor: filter.cursor, take: filter.take },
    );
  },

  async obter(id: string, ctx: Ctx) {
    const ordem = await prisma.ordemProducao.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        operacoes: { orderBy: { sequencia: 'asc' } },
        consumos: { orderBy: { createdAt: 'asc' } },
        roteiro: { select: { id: true, nome: true, codigo: true } },
      },
    });
    if (!ordem) throw new NotFoundError('Ordem de produção não encontrada');
    return ordem;
  },
};
