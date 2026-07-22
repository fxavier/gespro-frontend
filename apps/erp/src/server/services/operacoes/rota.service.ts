// Serviço de Rota — WS F (Wave 2)
// Implementa IRotaService. Gestão de rotas de transporte com máquina de estado.

import 'server-only';
import { prisma } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { transitar } from './_helpers';
import { TRANSICOES_ROTA } from './rota.interface';
import { validarAlocacaoViatura, validarAlocacaoMotorista } from './alocacao.service';
import type { IRotaService, EstadoRota, RotaDetalhe, RotaResumo, PontoEntregaRef } from './rota.interface';
import type { Ctx, PaginatedResult } from '@/server/services/types';
import type { CriarRotaInput, AtualizarRotaInput, FiltrarRotasInput } from '@/lib/validations/transporte';

// ============================================================
// Helpers
// ============================================================

function mapPonto(p: {
  id: string; tenantId: string; ordem: number; tipo: string;
  clienteId: string | null; clienteNome: string | null;
  endereco: string; cidade: string;
  horaEstimada: Date | null; horaChegada: Date | null; horaSaida: Date | null;
  estado: string; entregaId: string | null;
}): PontoEntregaRef {
  return {
    id: p.id, tenantId: p.tenantId, ordem: p.ordem, tipo: p.tipo,
    clienteId: p.clienteId, clienteNome: p.clienteNome,
    endereco: p.endereco, cidade: p.cidade,
    horaEstimada: p.horaEstimada, horaChegada: p.horaChegada, horaSaida: p.horaSaida,
    estado: p.estado, entregaId: p.entregaId,
  };
}

const ROTA_RESUMO_SELECT = {
  id: true, tenantId: true, codigo: true, nome: true,
  origem: true, destino: true, viaturaId: true, motoristaId: true,
  dataInicio: true, dataFim: true, estado: true,
  custoEstimado: true, custoReal: true,
  createdAt: true, updatedAt: true,
} as const;

const PONTOS_SELECT = {
  id: true, tenantId: true, ordem: true, tipo: true,
  clienteId: true, clienteNome: true, endereco: true, cidade: true,
  horaEstimada: true, horaChegada: true, horaSaida: true,
  estado: true, entregaId: true,
} as const;

async function obterDetalhe(id: string, ctx: Ctx): Promise<RotaDetalhe> {
  const r = await prisma.rota.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      ...ROTA_RESUMO_SELECT,
      descricao: true, distanciaTotal: true,
      tempoEstimadoMin: true, tempoRealMin: true, observacoes: true,
      pontos: { select: PONTOS_SELECT, orderBy: { ordem: 'asc' } },
    },
  });
  if (!r) throw new NotFoundError('Rota não encontrada.');

  return {
    id: r.id, tenantId: r.tenantId, codigo: r.codigo, nome: r.nome,
    origem: r.origem, destino: r.destino,
    viaturaId: r.viaturaId, motoristaId: r.motoristaId,
    dataInicio: r.dataInicio, dataFim: r.dataFim,
    estado: r.estado as EstadoRota,
    custoEstimado: r.custoEstimado ? r.custoEstimado.toString() : null,
    custoReal: r.custoReal ? r.custoReal.toString() : null,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
    descricao: r.descricao,
    distanciaTotal: r.distanciaTotal ? r.distanciaTotal.toString() : null,
    tempoEstimadoMin: r.tempoEstimadoMin,
    tempoRealMin: r.tempoRealMin,
    observacoes: r.observacoes,
    pontos: r.pontos.map(mapPonto),
  };
}

// ============================================================
// IRotaService
// ============================================================

async function transitarRota(
  rotaId: string,
  estadoAlvo: EstadoRota,
  ctx: Ctx,
  motivo?: string,
): Promise<RotaDetalhe> {
  const rota = await prisma.rota.findFirst({
    where: { id: rotaId, tenantId: ctx.tenantId },
    select: {
      id: true, tenantId: true, estado: true,
      viaturaId: true, motoristaId: true,
      dataInicio: true, dataFim: true,
      pontos: { select: { id: true, estado: true } },
    },
  });
  if (!rota) throw new NotFoundError('Rota não encontrada.');

  const estadoActual = rota.estado as EstadoRota;
  transitar(TRANSICOES_ROTA, estadoActual, estadoAlvo);

  // Regra: PLANEADA → ATIVA requer viatura e motorista com documentos válidos
  if (estadoActual === 'PLANEADA' && estadoAlvo === 'ATIVA') {
    if (!rota.viaturaId || !rota.motoristaId) {
      throw new BusinessRuleError(
        'ROTA_SEM_VIATURA',
        'A rota requer viatura e motorista atribuídos antes de ser iniciada.',
      );
    }

    const viatura = await prisma.viatura.findFirst({
      where: { id: rota.viaturaId, tenantId: ctx.tenantId },
      select: {
        id: true, matricula: true, marca: true, modelo: true,
        documentos: { select: { id: true, dataValidade: true, prazoAlertaDias: true, estado: true } },
        checklists: {
          orderBy: { dataInspeccao: 'desc' }, take: 1,
          select: { dataInspeccao: true, itens: { select: { nome: true, estado: true } } },
        },
      },
    });

    if (viatura) {
      const result = validarAlocacaoViatura(
        {
          id: viatura.id, matricula: viatura.matricula, marca: viatura.marca, modelo: viatura.modelo,
          documentos: viatura.documentos.map((d) => ({
            id: d.id, dataValidade: d.dataValidade, prazoAlertaDias: d.prazoAlertaDias,
            estado: d.estado as 'VALIDO' | 'PROXIMO_EXPIRAR' | 'EXPIRADO',
          })),
          checklist: viatura.checklists[0]
            ? { dataInspeccao: viatura.checklists[0].dataInspeccao, itens: viatura.checklists[0].itens.map((i) => ({ nome: i.nome, estado: i.estado as 'OK' | 'AVARIA' | 'FALTA' })) }
            : null,
        },
        rota.dataInicio,
        rota.dataFim ?? undefined,
      );
      if (!result.isValid) {
        throw new BusinessRuleError('VIATURA_COM_DOCUMENTOS_EXPIRADOS', result.errors.join(' '), { errors: result.errors });
      }
    }

    const motorista = await prisma.motorista.findFirst({
      where: { id: rota.motoristaId, tenantId: ctx.tenantId },
      select: { id: true, nomeCompleto: true, validadeCarta: true, disponibilidade: { select: { disponivel: true, motivo: true } } },
    });

    if (motorista) {
      const result = validarAlocacaoMotorista(
        { id: motorista.id, nomeCompleto: motorista.nomeCompleto, validadeCarta: motorista.validadeCarta, disponibilidade: motorista.disponibilidade ? { disponivel: motorista.disponibilidade.disponivel, motivo: motorista.disponibilidade.motivo ?? null } : null },
        rota.dataInicio,
        rota.dataFim ?? undefined,
      );
      if (!result.isValid) {
        throw new BusinessRuleError('MOTORISTA_INDISPONIVEL', result.errors.join(' '), { errors: result.errors });
      }
    }
  }

  // Regra: ATIVA → CONCLUIDA com pontos abertos (PENDENTE | EM_TRANSITO) é proibido
  if (estadoAlvo === 'CONCLUIDA') {
    const pontosAbertos = rota.pontos.filter(
      (p) => p.estado === 'PENDENTE' || p.estado === 'EM_TRANSITO',
    );
    if (pontosAbertos.length > 0) {
      throw new BusinessRuleError(
        'PONTOS_ABERTOS',
        `A rota tem ${pontosAbertos.length} ponto(s) de entrega por fechar.`,
        { pontosAbertos: pontosAbertos.map((p) => p.id) },
      );
    }
  }

  const dataUpdate: Record<string, unknown> = { estado: estadoAlvo };
  if (estadoAlvo === 'CONCLUIDA' || estadoAlvo === 'CANCELADA') {
    dataUpdate.dataFim = new Date();
  }

  await prisma.rota.update({ where: { id: rotaId }, data: dataUpdate });

  return obterDetalhe(rotaId, ctx);
}

async function criarRota(input: CriarRotaInput, ctx: Ctx): Promise<RotaDetalhe> {
  const ano = new Date().getFullYear();
  // Número simples da rota — sequencial por tenant (sem SerieDocumento, rotas não são documentos)
  const count = await prisma.rota.count({ where: { tenantId: ctx.tenantId } });
  const codigo = `RT/${ano}/${String(count + 1).padStart(5, '0')}`;

  const rota = await prisma.rota.create({
    data: {
      tenantId: ctx.tenantId,
      codigo,
      nome: input.nome,
      descricao: input.descricao ?? null,
      origem: input.origem,
      destino: input.destino,
      viaturaId: input.viaturaId ?? null,
      motoristaId: input.motoristaId ?? null,
      dataInicio: input.dataInicio,
      dataFim: input.dataFim ?? null,
      distanciaTotal: input.distanciaTotal ?? null,
      tempoEstimadoMin: input.tempoEstimadoMin ?? null,
      custoEstimado: input.custoEstimado ?? null,
      observacoes: input.observacoes ?? null,
    },
    select: { id: true },
  });

  return obterDetalhe(rota.id, ctx);
}

async function obterRota(id: string, ctx: Ctx): Promise<RotaDetalhe> {
  return obterDetalhe(id, ctx);
}

async function listarRotas(
  filtros: FiltrarRotasInput,
  ctx: Ctx,
): Promise<PaginatedResult<RotaResumo>> {
  const where = {
    tenantId: ctx.tenantId,
    ...(filtros.estado ? { estado: filtros.estado } : {}),
    ...(filtros.viaturaId ? { viaturaId: filtros.viaturaId } : {}),
    ...(filtros.motoristaId ? { motoristaId: filtros.motoristaId } : {}),
    ...(filtros.dataInicio || filtros.dataFim
      ? { dataInicio: { ...(filtros.dataInicio ? { gte: filtros.dataInicio } : {}), ...(filtros.dataFim ? { lte: filtros.dataFim } : {}) } }
      : {}),
  };

  const page = await paginate(
    (args) => prisma.rota.findMany({ where, orderBy: { [filtros.orderBy]: filtros.order }, select: ROTA_RESUMO_SELECT, ...args }),
    { cursor: filtros.cursor, take: filtros.take },
  );

  return {
    items: page.items.map((r) => ({
      id: r.id, tenantId: r.tenantId, codigo: r.codigo, nome: r.nome,
      origem: r.origem, destino: r.destino, viaturaId: r.viaturaId, motoristaId: r.motoristaId,
      dataInicio: r.dataInicio, dataFim: r.dataFim, estado: r.estado as EstadoRota,
      custoEstimado: r.custoEstimado ? r.custoEstimado.toString() : null,
      custoReal: r.custoReal ? r.custoReal.toString() : null,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
    })),
    nextCursor: page.nextCursor,
  };
}

async function atualizarRota(id: string, input: AtualizarRotaInput, ctx: Ctx): Promise<RotaDetalhe> {
  const existente = await prisma.rota.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!existente) throw new NotFoundError('Rota não encontrada.');

  await prisma.rota.update({
    where: { id },
    data: {
      ...(input.nome ? { nome: input.nome } : {}),
      ...(input.descricao !== undefined ? { descricao: input.descricao ?? null } : {}),
      ...(input.origem ? { origem: input.origem } : {}),
      ...(input.destino ? { destino: input.destino } : {}),
      ...(input.viaturaId !== undefined ? { viaturaId: input.viaturaId ?? null } : {}),
      ...(input.motoristaId !== undefined ? { motoristaId: input.motoristaId ?? null } : {}),
      ...(input.dataInicio ? { dataInicio: input.dataInicio } : {}),
      ...(input.dataFim !== undefined ? { dataFim: input.dataFim ?? null } : {}),
      ...(input.distanciaTotal !== undefined ? { distanciaTotal: input.distanciaTotal ?? null } : {}),
      ...(input.tempoEstimadoMin !== undefined ? { tempoEstimadoMin: input.tempoEstimadoMin ?? null } : {}),
      ...(input.custoEstimado !== undefined ? { custoEstimado: input.custoEstimado ?? null } : {}),
      ...(input.observacoes !== undefined ? { observacoes: input.observacoes ?? null } : {}),
    },
  });

  return obterDetalhe(id, ctx);
}

async function atribuirRecursos(
  rotaId: string,
  viaturaId: string | null,
  motoristaId: string | null,
  ctx: Ctx,
): Promise<RotaDetalhe> {
  const rota = await prisma.rota.findFirst({
    where: { id: rotaId, tenantId: ctx.tenantId },
    select: { id: true, estado: true },
  });
  if (!rota) throw new NotFoundError('Rota não encontrada.');

  if (rota.estado !== 'PLANEADA' && rota.estado !== 'PAUSADA') {
    throw new BusinessRuleError(
      'TRANSICAO_INVALIDA',
      'Só é possível atribuir recursos a rotas PLANEADA ou PAUSADA.',
    );
  }

  await prisma.rota.update({
    where: { id: rotaId },
    data: {
      ...(viaturaId !== null ? { viaturaId } : {}),
      ...(motoristaId !== null ? { motoristaId } : {}),
    },
  });

  return obterDetalhe(rotaId, ctx);
}

export const rotaService: IRotaService = {
  transitarRota,
  criarRota,
  obterRota,
  listarRotas,
  atualizarRota,
  atribuirRecursos,
};
