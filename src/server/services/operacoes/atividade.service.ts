// Serviço de Atividade — WS F (Wave 3)
// Implementa IAtividadeService. Entidade central do módulo de transporte.
// Numeração: via proximoNumeroSerie(tx, 'ATIVIDADE', ctx) de WS D (ATI/YYYY/000001).

import 'server-only';
import { prisma, prismaBase } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { transitar } from './_helpers';
import { proximoNumeroSerie } from '@/server/services/financas';
import { TRANSICOES_ATIVIDADE } from './atividade.interface';
import { validarAlocacaoViatura, validarAlocacaoMotorista } from './alocacao.service';
import type { IAtividadeService, EstadoAtividade, AtividadeDetalhe, AtividadeResumo, EventoAtividadeRef } from './atividade.interface';
import type { Ctx, PaginatedResult } from '@/server/services/types';
import type { CriarAtividadeInput, AtualizarAtividadeInput, FiltrarAtividadesInput } from '@/lib/validations/transporte';

// ============================================================
// Helpers de select e mapeamento
// ============================================================

const ATIVIDADE_RESUMO_SELECT = {
  id: true, tenantId: true, codigo: true, titulo: true,
  tipoActividade: true, localActividade: true,
  dataInicioPrevista: true, dataConclusaoPrevista: true,
  dataInicioReal: true, dataConclusaoReal: true,
  prioridade: true, estado: true,
  motoristaResponsavelId: true, viaturaId: true,
  criadoPorId: true, createdAt: true, updatedAt: true,
} as const;

function mapHistorico(h: {
  id: string; tenantId: string; atividadeId: string; data: Date;
  estadoAnterior: string | null; estadoNovo: string; utilizadorId: string; descricao: string;
}): EventoAtividadeRef {
  return {
    id: h.id, tenantId: h.tenantId, atividadeId: h.atividadeId,
    data: h.data,
    estadoAnterior: h.estadoAnterior as EstadoAtividade | null,
    estadoNovo: h.estadoNovo as EstadoAtividade,
    utilizadorId: h.utilizadorId, descricao: h.descricao,
  };
}

async function obterDetalhe(id: string, ctx: Ctx): Promise<AtividadeDetalhe> {
  const a = await prisma.atividade.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      ...ATIVIDADE_RESUMO_SELECT,
      descricao: true, observacoes: true, anexos: true,
      historico: {
        select: { id: true, tenantId: true, atividadeId: true, data: true, estadoAnterior: true, estadoNovo: true, utilizadorId: true, descricao: true },
        orderBy: { data: 'asc' },
      },
    },
  });
  if (!a) throw new NotFoundError('Atividade não encontrada.');

  return {
    id: a.id, tenantId: a.tenantId, codigo: a.codigo, titulo: a.titulo,
    tipoActividade: a.tipoActividade, localActividade: a.localActividade,
    dataInicioPrevista: a.dataInicioPrevista, dataConclusaoPrevista: a.dataConclusaoPrevista,
    dataInicioReal: a.dataInicioReal, dataConclusaoReal: a.dataConclusaoReal,
    prioridade: a.prioridade, estado: a.estado as EstadoAtividade,
    motoristaResponsavelId: a.motoristaResponsavelId, viaturaId: a.viaturaId,
    criadoPorId: a.criadoPorId, createdAt: a.createdAt, updatedAt: a.updatedAt,
    descricao: a.descricao, observacoes: a.observacoes, anexos: a.anexos,
    historico: a.historico.map(mapHistorico),
  };
}

// ============================================================
// IAtividadeService
// ============================================================

async function transitarAtividade(
  atividadeId: string,
  estadoAlvo: EstadoAtividade,
  descricao: string,
  ctx: Ctx,
): Promise<AtividadeDetalhe> {
  const atividade = await prisma.atividade.findFirst({
    where: { id: atividadeId, tenantId: ctx.tenantId },
    select: {
      id: true, tenantId: true, estado: true,
      dataInicioPrevista: true, dataConclusaoPrevista: true,
      viaturaId: true, motoristaResponsavelId: true,
    },
  });
  if (!atividade) throw new NotFoundError('Atividade não encontrada.');

  const estadoActual = atividade.estado as EstadoAtividade;
  transitar(TRANSICOES_ATIVIDADE, estadoActual, estadoAlvo);

  // Regra: PLANEADA → EM_CURSO requer viatura e motorista com documentos válidos
  if (estadoActual === 'PLANEADA' && estadoAlvo === 'EM_CURSO') {
    if (!atividade.viaturaId || !atividade.motoristaResponsavelId) {
      throw new BusinessRuleError(
        'ATIVIDADE_SEM_RECURSOS',
        'A atividade requer viatura e motorista alocados antes de ser iniciada.',
      );
    }

    // Validar viatura
    const viatura = await prisma.viatura.findFirst({
      where: { id: atividade.viaturaId, tenantId: ctx.tenantId },
      select: {
        id: true, matricula: true, marca: true, modelo: true,
        documentos: { select: { id: true, dataValidade: true, prazoAlertaDias: true, estado: true } },
        checklists: {
          orderBy: { dataInspeccao: 'desc' },
          take: 1,
          select: { dataInspeccao: true, itens: { select: { nome: true, estado: true } } },
        },
      },
    });

    if (viatura) {
      const resultViatura = validarAlocacaoViatura(
        {
          id: viatura.id,
          matricula: viatura.matricula,
          marca: viatura.marca,
          modelo: viatura.modelo,
          documentos: viatura.documentos.map((d) => ({
            id: d.id,
            dataValidade: d.dataValidade,
            prazoAlertaDias: d.prazoAlertaDias,
            estado: d.estado as 'VALIDO' | 'PROXIMO_EXPIRAR' | 'EXPIRADO',
          })),
          checklist: viatura.checklists[0]
            ? {
                dataInspeccao: viatura.checklists[0].dataInspeccao,
                itens: viatura.checklists[0].itens.map((i) => ({
                  nome: i.nome,
                  estado: i.estado as 'OK' | 'AVARIA' | 'FALTA',
                })),
              }
            : null,
        },
        atividade.dataInicioPrevista,
        atividade.dataConclusaoPrevista ?? undefined,
      );

      if (!resultViatura.isValid) {
        throw new BusinessRuleError(
          'VIATURA_COM_DOCUMENTOS_EXPIRADOS',
          resultViatura.errors.join(' '),
          { errors: resultViatura.errors },
        );
      }
    }

    // Validar motorista
    const motorista = await prisma.motorista.findFirst({
      where: { id: atividade.motoristaResponsavelId, tenantId: ctx.tenantId },
      select: {
        id: true, nomeCompleto: true, validadeCarta: true,
        disponibilidade: { select: { disponivel: true, motivo: true } },
      },
    });

    if (motorista) {
      const resultMotorista = validarAlocacaoMotorista(
        {
          id: motorista.id,
          nomeCompleto: motorista.nomeCompleto,
          validadeCarta: motorista.validadeCarta,
          disponibilidade: motorista.disponibilidade
            ? { disponivel: motorista.disponibilidade.disponivel, motivo: motorista.disponibilidade.motivo ?? null }
            : null,
        },
        atividade.dataInicioPrevista,
        atividade.dataConclusaoPrevista ?? undefined,
      );

      if (!resultMotorista.isValid) {
        throw new BusinessRuleError(
          'MOTORISTA_INDISPONIVEL',
          resultMotorista.errors.join(' '),
          { errors: resultMotorista.errors },
        );
      }
    }
  }

  // Datas de início/conclusão reais
  const dataUpdate: Record<string, unknown> = { estado: estadoAlvo };
  if (estadoAlvo === 'EM_CURSO' && estadoActual === 'PLANEADA') {
    dataUpdate.dataInicioReal = new Date();
  }
  if (estadoAlvo === 'CONCLUIDA' || estadoAlvo === 'CANCELADA') {
    dataUpdate.dataConclusaoReal = new Date();
  }

  await prisma.$transaction(async (tx) => {
    await tx.atividade.update({ where: { id: atividadeId }, data: dataUpdate });
    await tx.eventoAtividade.create({
      data: {
        tenantId: ctx.tenantId,
        atividadeId,
        estadoAnterior: estadoActual,
        estadoNovo: estadoAlvo,
        utilizadorId: ctx.userId,
        descricao,
      },
    });
  });

  return obterDetalhe(atividadeId, ctx);
}

async function criarAtividade(input: CriarAtividadeInput, ctx: Ctx): Promise<AtividadeDetalhe> {
  const atividade = await prismaBase.$transaction(async (tx) => {
    const codigo = await proximoNumeroSerie(tx, 'ATIVIDADE', ctx);

    const created = await tx.atividade.create({
      data: {
        tenantId: ctx.tenantId,
        codigo,
        titulo: input.titulo,
        descricao: input.descricao ?? null,
        tipoActividade: input.tipoActividade,
        localActividade: input.localActividade,
        dataInicioPrevista: input.dataInicioPrevista,
        dataConclusaoPrevista: input.dataConclusaoPrevista ?? null,
        motoristaResponsavelId: input.motoristaResponsavelId ?? null,
        viaturaId: input.viaturaId ?? null,
        prioridade: input.prioridade,
        observacoes: input.observacoes ?? null,
        anexos: input.anexos ?? [],
        criadoPorId: ctx.userId,
      },
      select: { id: true },
    });

    // Registo inicial no histórico
    await tx.eventoAtividade.create({
      data: {
        tenantId: ctx.tenantId,
        atividadeId: created.id,
        estadoNovo: 'PLANEADA',
        utilizadorId: ctx.userId,
        descricao: 'Atividade criada.',
      },
    });

    return created;
  });

  return obterDetalhe(atividade.id, ctx);
}

async function obterAtividade(id: string, ctx: Ctx): Promise<AtividadeDetalhe> {
  return obterDetalhe(id, ctx);
}

async function listarAtividades(
  filtros: FiltrarAtividadesInput,
  ctx: Ctx,
): Promise<PaginatedResult<AtividadeResumo>> {
  const where = {
    tenantId: ctx.tenantId,
    ...(filtros.estado ? { estado: filtros.estado } : {}),
    ...(filtros.tipoActividade ? { tipoActividade: filtros.tipoActividade } : {}),
    ...(filtros.prioridade ? { prioridade: filtros.prioridade } : {}),
    ...(filtros.motoristaResponsavelId ? { motoristaResponsavelId: filtros.motoristaResponsavelId } : {}),
    ...(filtros.viaturaId ? { viaturaId: filtros.viaturaId } : {}),
    ...(filtros.dataInicio || filtros.dataFim
      ? {
          dataInicioPrevista: {
            ...(filtros.dataInicio ? { gte: filtros.dataInicio } : {}),
            ...(filtros.dataFim ? { lte: filtros.dataFim } : {}),
          },
        }
      : {}),
  };

  const page = await paginate(
    (args) =>
      prisma.atividade.findMany({
        where,
        orderBy: { [filtros.orderBy]: filtros.order },
        select: ATIVIDADE_RESUMO_SELECT,
        ...args,
      }),
    { cursor: filtros.cursor, take: filtros.take },
  );

  return {
    items: page.items.map((a) => ({
      id: a.id, tenantId: a.tenantId, codigo: a.codigo, titulo: a.titulo,
      tipoActividade: a.tipoActividade, localActividade: a.localActividade,
      dataInicioPrevista: a.dataInicioPrevista, dataConclusaoPrevista: a.dataConclusaoPrevista,
      dataInicioReal: a.dataInicioReal, dataConclusaoReal: a.dataConclusaoReal,
      prioridade: a.prioridade, estado: a.estado as EstadoAtividade,
      motoristaResponsavelId: a.motoristaResponsavelId, viaturaId: a.viaturaId,
      criadoPorId: a.criadoPorId, createdAt: a.createdAt, updatedAt: a.updatedAt,
    })),
    nextCursor: page.nextCursor,
  };
}

async function atualizarAtividade(
  id: string,
  input: AtualizarAtividadeInput,
  ctx: Ctx,
): Promise<AtividadeDetalhe> {
  const existente = await prisma.atividade.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!existente) throw new NotFoundError('Atividade não encontrada.');

  await prisma.atividade.update({
    where: { id },
    data: {
      ...(input.titulo ? { titulo: input.titulo } : {}),
      ...(input.descricao !== undefined ? { descricao: input.descricao ?? null } : {}),
      ...(input.tipoActividade ? { tipoActividade: input.tipoActividade } : {}),
      ...(input.localActividade ? { localActividade: input.localActividade } : {}),
      ...(input.dataInicioPrevista ? { dataInicioPrevista: input.dataInicioPrevista } : {}),
      ...(input.dataConclusaoPrevista !== undefined ? { dataConclusaoPrevista: input.dataConclusaoPrevista ?? null } : {}),
      ...(input.motoristaResponsavelId !== undefined ? { motoristaResponsavelId: input.motoristaResponsavelId ?? null } : {}),
      ...(input.viaturaId !== undefined ? { viaturaId: input.viaturaId ?? null } : {}),
      ...(input.prioridade ? { prioridade: input.prioridade } : {}),
      ...(input.observacoes !== undefined ? { observacoes: input.observacoes ?? null } : {}),
      ...(input.anexos ? { anexos: input.anexos } : {}),
    },
  });

  return obterDetalhe(id, ctx);
}

export const atividadeService: IAtividadeService = {
  transitarAtividade,
  criarAtividade,
  obterAtividade,
  listarAtividades,
  atualizarAtividade,
};
