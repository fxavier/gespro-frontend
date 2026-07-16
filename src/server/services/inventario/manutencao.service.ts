// Serviço de Manutenção de Ativos (WS A — Wave 2)
import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';
import { NotFoundError } from '@/lib/errors';
import type {
  ManutencaoAtivoCreate,
  ManutencaoAtivoFilter,
  ManutencaoAtivoUpdate,
  TransicaoManutencaoAtivo,
} from '@/lib/validations/inventario-ativos';
import type { Ctx, PaginatedResult } from '@/server/services/types';
import {
  TRANSICOES_MANUTENCAO_ATIVO,
  type IManutencaoAtivoService,
  type ManutencaoAtivoDto,
} from './manutencao.interface';
import { TRANSICOES_ATIVO } from './ativos.interface';
import { transitar } from './state-machine';

// ─── Mapeador ─────────────────────────────────────────────────────────────────

const d = (v: { toString(): string } | null | undefined) => v?.toString() ?? null;

const MAN_SEL = {
  id: true, tenantId: true, ativoId: true, tipo: true, status: true, prioridade: true,
  dataAgendada: true, dataInicio: true, dataConclusao: true, titulo: true, descricao: true,
  procedimentos: true, tecnicoId: true, responsavelId: true, fornecedorId: true,
  custoEstimado: true, custoReal: true, custoMaoObra: true, custoPecas: true,
  proximaManutencao: true, intervaloProximaManutencaoDias: true,
  relatorio: true, fotos: true, anexos: true, observacoes: true, motivoCancelamento: true,
  criadoPor: true, createdAt: true, updatedAt: true,
  pecas: {
    select: { id: true, manutencaoId: true, produtoId: true, nome: true, quantidade: true, custoUnitario: true, custoTotal: true },
  },
} as const;

function mapMan(m: {
  id: string; tenantId: string; ativoId: string; tipo: string; status: string;
  prioridade: string | null; dataAgendada: Date; dataInicio: Date | null;
  dataConclusao: Date | null; titulo: string; descricao: string; procedimentos: string | null;
  tecnicoId: string | null; responsavelId: string | null; fornecedorId: string | null;
  custoEstimado: { toString(): string } | null; custoReal: { toString(): string } | null;
  custoMaoObra: { toString(): string } | null; custoPecas: { toString(): string } | null;
  proximaManutencao: Date | null; intervaloProximaManutencaoDias: number | null;
  relatorio: string | null; fotos: string[]; anexos: string[];
  observacoes: string | null; motivoCancelamento: string | null;
  criadoPor: string; createdAt: Date; updatedAt: Date;
  pecas: Array<{ id: string; manutencaoId: string; produtoId: string | null; nome: string; quantidade: { toString(): string }; custoUnitario: { toString(): string }; custoTotal: { toString(): string } }>;
}): ManutencaoAtivoDto {
  return {
    id: m.id, tenantId: m.tenantId, ativoId: m.ativoId, tipo: m.tipo, status: m.status,
    prioridade: m.prioridade, dataAgendada: m.dataAgendada, dataInicio: m.dataInicio,
    dataConclusao: m.dataConclusao, titulo: m.titulo, descricao: m.descricao,
    procedimentos: m.procedimentos, tecnicoId: m.tecnicoId, responsavelId: m.responsavelId,
    fornecedorId: m.fornecedorId, custoEstimado: d(m.custoEstimado), custoReal: d(m.custoReal),
    custoMaoObra: d(m.custoMaoObra), custoPecas: d(m.custoPecas),
    proximaManutencao: m.proximaManutencao,
    intervaloProximaManutencaoDias: m.intervaloProximaManutencaoDias,
    relatorio: m.relatorio, fotos: m.fotos, anexos: m.anexos, observacoes: m.observacoes,
    motivoCancelamento: m.motivoCancelamento, criadoPor: m.criadoPor,
    createdAt: m.createdAt, updatedAt: m.updatedAt,
    pecas: m.pecas.map((p) => ({
      id: p.id, manutencaoId: p.manutencaoId, produtoId: p.produtoId,
      nome: p.nome, quantidade: p.quantidade.toString(),
      custoUnitario: p.custoUnitario.toString(), custoTotal: p.custoTotal.toString(),
    })),
  };
}

// ─── Implementação ────────────────────────────────────────────────────────────

async function listarManutencoes(filter: ManutencaoAtivoFilter, ctx: Ctx): Promise<PaginatedResult<ManutencaoAtivoDto>> {
  const page = await paginate(
    (args) => prisma.manutencaoAtivo.findMany({
      ...args,
      where: {
        tenantId: ctx.tenantId,
        ...(filter.ativoId ? { ativoId: filter.ativoId } : {}),
        ...(filter.tipo ? { tipo: filter.tipo as never } : {}),
        ...(filter.status ? { status: filter.status as never } : {}),
        ...(filter.prioridade ? { prioridade: filter.prioridade as never } : {}),
        ...(filter.tecnicoId ? { tecnicoId: filter.tecnicoId } : {}),
        ...(filter.dataInicio || filter.dataFim ? {
          dataAgendada: {
            ...(filter.dataInicio ? { gte: filter.dataInicio } : {}),
            ...(filter.dataFim ? { lte: filter.dataFim } : {}),
          },
        } : {}),
      },
      select: MAN_SEL, orderBy: { dataAgendada: 'desc' },
    }),
    { cursor: filter.cursor, take: filter.take },
  );
  return { items: page.items.map(mapMan), nextCursor: page.nextCursor };
}

async function obterManutencao(id: string, ctx: Ctx): Promise<ManutencaoAtivoDto> {
  const m = await prisma.manutencaoAtivo.findFirst({ where: { id, tenantId: ctx.tenantId }, select: MAN_SEL });
  if (!m) throw new NotFoundError('Manutenção não encontrada');
  return mapMan(m);
}

async function criarManutencao(data: ManutencaoAtivoCreate, ctx: Ctx): Promise<ManutencaoAtivoDto> {
  const { pecas, ...rest } = data;
  const m = await prisma.manutencaoAtivo.create({
    data: {
      tenantId: ctx.tenantId,
      ativoId: rest.ativoId,
      tipo: rest.tipo as never,
      prioridade: (rest.prioridade ?? null) as never,
      dataAgendada: rest.dataAgendada,
      titulo: rest.titulo,
      descricao: rest.descricao,
      procedimentos: rest.procedimentos ?? null,
      tecnicoId: rest.tecnicoId ?? null,
      responsavelId: rest.responsavelId ?? null,
      fornecedorId: rest.fornecedorId ?? null,
      custoEstimado: rest.custoEstimado != null ? new Prisma.Decimal(rest.custoEstimado) : null,
      proximaManutencao: rest.proximaManutencao ?? null,
      intervaloProximaManutencaoDias: rest.intervaloProximaManutencaoDias ?? null,
      observacoes: rest.observacoes ?? null,
      criadoPor: ctx.userId,
      pecas: pecas?.length ? {
        create: pecas.map((p) => ({
          tenantId: ctx.tenantId,
          produtoId: p.produtoId ?? null,
          nome: p.nome,
          quantidade: new Prisma.Decimal(p.quantidade),
          custoUnitario: new Prisma.Decimal(p.custoUnitario),
          custoTotal: new Prisma.Decimal(p.custoTotal),
        })),
      } : undefined,
    },
    select: MAN_SEL,
  });
  return mapMan(m);
}

async function actualizarManutencao(id: string, data: ManutencaoAtivoUpdate, ctx: Ctx): Promise<ManutencaoAtivoDto> {
  await obterManutencao(id, ctx);
  const m = await prisma.manutencaoAtivo.update({
    where: { id },
    data: {
      ...data,
      atualizadoPor: ctx.userId,
      ...(data.prioridade ? { prioridade: data.prioridade as never } : {}),
      ...(data.custoEstimado != null ? { custoEstimado: new Prisma.Decimal(data.custoEstimado) } : {}),
      ...(data.custoReal != null ? { custoReal: new Prisma.Decimal(data.custoReal) } : {}),
      ...(data.custoMaoObra != null ? { custoMaoObra: new Prisma.Decimal(data.custoMaoObra) } : {}),
      ...(data.custoPecas != null ? { custoPecas: new Prisma.Decimal(data.custoPecas) } : {}),
    },
    select: MAN_SEL,
  });
  return mapMan(m);
}

async function transitarStatus(input: TransicaoManutencaoAtivo, ctx: Ctx): Promise<ManutencaoAtivoDto> {
  const man = await obterManutencao(input.manutencaoId, ctx);
  transitar(TRANSICOES_MANUTENCAO_ATIVO as never, man.status as never, input.novoStatus as never, 'ManutencaoAtivo');

  const agora = new Date();
  const update: Record<string, unknown> = {
    status: input.novoStatus as never,
    atualizadoPor: ctx.userId,
    ...(input.observacoes ? { observacoes: input.observacoes } : {}),
    ...(input.motivoCancelamento ? { motivoCancelamento: input.motivoCancelamento } : {}),
  };

  if (input.novoStatus === 'EM_ANDAMENTO' && !man.dataInicio) {
    update.dataInicio = agora;
    // Muda estado do ativo para EM_MANUTENCAO se ainda não estiver
    const ativo = await prisma.ativo.findUnique({ where: { id: man.ativoId }, select: { estado: true } });
    if (ativo && ativo.estado !== 'EM_MANUTENCAO') {
      try {
        transitar(TRANSICOES_ATIVO as never, ativo.estado as never, 'EM_MANUTENCAO' as never, 'Ativo');
        await prisma.ativo.update({ where: { id: man.ativoId }, data: { estado: 'EM_MANUTENCAO' as never } });
      } catch { /* ignora se transição inválida — ativo pode já estar em outro estado */ }
    }
  }

  if (input.novoStatus === 'CONCLUIDA') {
    update.dataConclusao = agora;
    // Volta o ativo para EM_USO
    const ativo = await prisma.ativo.findUnique({ where: { id: man.ativoId }, select: { estado: true } });
    if (ativo && ativo.estado === 'EM_MANUTENCAO') {
      await prisma.ativo.update({ where: { id: man.ativoId }, data: { estado: 'EM_USO' as never } });
    }
  }

  const m = await prisma.manutencaoAtivo.update({ where: { id: input.manutencaoId }, data: update as never, select: MAN_SEL });
  return mapMan(m);
}

async function obterManutencoesPendentes(ctx: Ctx): Promise<ManutencaoAtivoDto[]> {
  const ms = await prisma.manutencaoAtivo.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: 'AGENDADA',
      dataAgendada: { lt: new Date() },
    },
    select: MAN_SEL,
    orderBy: { dataAgendada: 'asc' },
  });
  return ms.map(mapMan);
}

async function obterProximasManutencoes(diasAntecedencia: number, ctx: Ctx): Promise<ManutencaoAtivoDto[]> {
  const limite = new Date();
  limite.setDate(limite.getDate() + diasAntecedencia);
  const ms = await prisma.manutencaoAtivo.findMany({
    where: {
      tenantId: ctx.tenantId,
      proximaManutencao: { lte: limite, gte: new Date() },
    },
    select: MAN_SEL,
    orderBy: { proximaManutencao: 'asc' },
  });
  return ms.map(mapMan);
}

export const manutencaoService: IManutencaoAtivoService = {
  listarManutencoes, obterManutencao, criarManutencao, actualizarManutencao,
  transitarStatus, obterManutencoesPendentes, obterProximasManutencoes,
};
