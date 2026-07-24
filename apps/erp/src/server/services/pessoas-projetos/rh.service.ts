import 'server-only';
import { prisma } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { paginate } from '@/server/db/paginate';
import type { Ctx } from '@/server/services/types';
import {
  TRANSICOES_COLABORADOR,
  TRANSICOES_SOLICITACAO_FERIAS,
  TRANSICOES_AUSENCIA,
  TRANSICOES_AVALIACAO,
  TRANSICOES_FORMACAO,
} from './rh.interface';
import type {
  CreateColaboradorInput,
  UpdateColaboradorInput,
  FilterColaboradorInput,
  CreateAusenciaInput,
  UpdateAusenciaInput,
  CreateFeriasInput,
  CreateSolicitacaoFeriasInput,
  AprovarSolicitacaoFeriasInput,
  CreateRegistoAssiduidadeInput,
  FilterAssiduidadeInput,
  CreateAvaliacaoInput,
  UpdateAvaliacaoInput,
  CreateFormacaoInput,
  UpdateFormacaoInput,
} from '@/lib/validations/rh';

// ─────────────────────────────────────────────────────────────────────────────
// Utilitário partilhado: validação de transição de estado
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valida a transição de estado e lança BusinessRuleError se inválida.
 * Exportado para testes e reutilização.
 */
export function transitar(
  mapa: Record<string, string[]>,
  estadoActual: string,
  novoEstado: string,
  codigo = 'TRANSICAO_INVALIDA',
  mensagem?: string,
): void {
  const permitidas = mapa[estadoActual] ?? [];
  if (!permitidas.includes(novoEstado)) {
    throw new BusinessRuleError(
      codigo,
      mensagem ?? `Transição de '${estadoActual}' para '${novoEstado}' não é permitida`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ColaboradorService
// ─────────────────────────────────────────────────────────────────────────────

export const ColaboradorService = {
  async criar(input: CreateColaboradorInput, ctx: Ctx): Promise<{ id: string }> {
    const colaborador = await prisma.colaborador.create({
      data: {
        tenantId: ctx.tenantId,
        codigo: input.codigo,
        nome: input.nome,
        dataNascimento: input.dataNascimento,
        genero: input.genero,
        estadoCivil: input.estadoCivil,
        nacionalidade: input.nacionalidade,
        naturalidadeProvincia: input.naturalidadeProvincia,
        naturalidadeDistrito: input.naturalidadeDistrito,
        bi: input.bi,
        nuit: input.nuit,
        niss: input.niss,
        email: input.email,
        telefone: input.telefone,
        telefoneAlternativo: input.telefoneAlternativo,
        enderecoRua: input.enderecoRua,
        enderecoNumero: input.enderecoNumero,
        enderecoBairro: input.enderecoBairro,
        enderecoCidade: input.enderecoCidade,
        enderecoProvincia: input.enderecoProvincia,
        enderecoCodigoPostal: input.enderecoCodigoPostal,
        emergenciaNome: input.emergenciaNome,
        emergenciaParentesco: input.emergenciaParentesco,
        emergenciaTelefone: input.emergenciaTelefone,
        fotoUrl: input.fotoUrl,
        departamentoId: input.departamentoId,
        cargoId: input.cargoId,
        supervisorId: input.supervisorId,
        dataAdmissao: input.dataAdmissao,
        status: input.status ?? 'PERIODO_EXPERIMENTAL',
        tipoContrato: input.tipoContrato,
        regimeTrabalho: input.regimeTrabalho,
        horarioTrabalho: input.horarioTrabalho,
        salarioBase: input.salarioBase,
        subsidioAlimentacao: input.subsidioAlimentacao,
        subsidioTransporte: input.subsidioTransporte,
        subsidioHabitacao: input.subsidioHabitacao,
        subsidiosOutros: input.subsidiosOutros,
        localizacao: input.localizacao,
        bancoBanco: input.bancoBanco,
        bancoNib: input.bancoNib,
        bancoTitular: input.bancoTitular,
        nivelAcesso: input.nivelAcesso ?? 'USUARIO',
        observacoes: input.observacoes,
      },
      select: { id: true },
    });
    return { id: colaborador.id };
  },

  async actualizar(id: string, input: UpdateColaboradorInput, ctx: Ctx): Promise<{ id: string }> {
    const existente = await prisma.colaborador.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!existente) throw new NotFoundError('Colaborador não encontrado');

    await prisma.colaborador.update({
      where: { id },
      data: {
        nome: input.nome,
        email: input.email,
        telefone: input.telefone,
        departamentoId: input.departamentoId,
        cargoId: input.cargoId,
        supervisorId: input.supervisorId,
        salarioBase: input.salarioBase,
        subsidioAlimentacao: input.subsidioAlimentacao,
        subsidioTransporte: input.subsidioTransporte,
        subsidioHabitacao: input.subsidioHabitacao,
        horarioTrabalho: input.horarioTrabalho,
        localizacao: input.localizacao,
        nivelAcesso: input.nivelAcesso,
        observacoes: input.observacoes,
        fotoUrl: input.fotoUrl,
      },
    });
    return { id };
  },

  async transitarStatus(id: string, novoStatus: string, ctx: Ctx): Promise<void> {
    const colaborador = await prisma.colaborador.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
      select: { status: true },
    });
    if (!colaborador) throw new NotFoundError('Colaborador não encontrado');

    transitar(TRANSICOES_COLABORADOR, colaborador.status, novoStatus);

    await prisma.colaborador.update({
      where: { id },
      data: {
        status: novoStatus as never,
        ...(novoStatus === 'INACTIVO' ? { dataDemissao: new Date() } : {}),
      },
    });
  },

  async arquivar(id: string, ctx: Ctx): Promise<void> {
    const existente = await prisma.colaborador.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!existente) throw new NotFoundError('Colaborador não encontrado');
    await prisma.colaborador.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  async listar(filter: FilterColaboradorInput, ctx: Ctx) {
    return paginate(
      (a) =>
        prisma.colaborador.findMany({
          ...a,
          where: {
            tenantId: ctx.tenantId,
            deletedAt: null,
            ...(filter.status ? { status: filter.status } : {}),
            ...(filter.departamentoId ? { departamentoId: filter.departamentoId } : {}),
            ...(filter.cargoId ? { cargoId: filter.cargoId } : {}),
            ...(filter.search
              ? { OR: [{ nome: { contains: filter.search, mode: 'insensitive' } }, { codigo: { contains: filter.search, mode: 'insensitive' } }] }
              : {}),
          },
          orderBy: { nome: 'asc' },
          select: { id: true, codigo: true, nome: true, status: true, departamentoId: true, cargoId: true, email: true },
        }),
      { cursor: filter.cursor, take: filter.take },
    );
  },

  async obter(id: string, ctx: Ctx) {
    const c = await prisma.colaborador.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
      include: {
        departamento: { select: { id: true, nome: true } },
        cargo: { select: { id: true, nome: true } },
        formacaoAcademica: true,
      },
    });
    if (!c) throw new NotFoundError('Colaborador não encontrado');
    return c;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// FeriasService — saldo gerido transaccionalmente
// ─────────────────────────────────────────────────────────────────────────────

export const FeriasService = {
  async iniciarPeriodo(input: CreateFeriasInput, ctx: Ctx): Promise<{ id: string }> {
    const ferias = await prisma.ferias.create({
      data: {
        tenantId: ctx.tenantId,
        colaboradorId: input.colaboradorId,
        periodoAquisitivoInicio: input.periodoAquisitivoInicio,
        periodoAquisitivoFim: input.periodoAquisitivoFim,
        diasDisponiveis: input.diasDisponiveis,
        diasUsados: 0,
      },
      select: { id: true },
    });
    return { id: ferias.id };
  },

  async solicitar(input: CreateSolicitacaoFeriasInput, ctx: Ctx): Promise<{ id: string }> {
    const ferias = await prisma.ferias.findFirst({
      where: { id: input.feriasId, tenantId: ctx.tenantId },
      select: { diasDisponiveis: true, diasUsados: true },
    });
    if (!ferias) throw new NotFoundError('Período de férias não encontrado');

    const diasPendentes = await prisma.solicitacaoFerias.aggregate({
      where: { feriasId: input.feriasId, status: 'PENDENTE', tenantId: ctx.tenantId },
      _sum: { diasSolicitados: true },
    });

    const diasDisponiveis =
      ferias.diasDisponiveis -
      ferias.diasUsados -
      (diasPendentes._sum.diasSolicitados ?? 0);

    if (input.diasSolicitados > diasDisponiveis) {
      throw new BusinessRuleError(
        'SALDO_FERIAS_INSUFICIENTE',
        `Saldo disponível (${diasDisponiveis} dias) insuficiente para ${input.diasSolicitados} dias solicitados`,
      );
    }

    const sol = await prisma.solicitacaoFerias.create({
      data: {
        tenantId: ctx.tenantId,
        feriasId: input.feriasId,
        dataInicio: input.dataInicio,
        dataFim: input.dataFim,
        diasSolicitados: input.diasSolicitados,
        tipo: input.tipo,
        status: 'PENDENTE',
        observacoes: input.observacoes,
      },
      select: { id: true },
    });
    return { id: sol.id };
  },

  async aprovar(input: AprovarSolicitacaoFeriasInput, ctx: Ctx): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const sol = await tx.solicitacaoFerias.findFirst({
        where: { id: input.solicitacaoId, tenantId: ctx.tenantId },
        select: { status: true, feriasId: true, diasSolicitados: true },
      });
      if (!sol) throw new NotFoundError('Solicitação não encontrada');

      transitar(TRANSICOES_SOLICITACAO_FERIAS, sol.status, input.status);

      await tx.solicitacaoFerias.update({
        where: { id: input.solicitacaoId },
        data: {
          status: input.status,
          aprovadoPorId: ctx.userId,
          dataAprovacao: new Date(),
          motivoRejeicao: input.motivoRejeicao,
        },
      });

      // Descontar do saldo apenas ao APROVAR
      if (input.status === 'APROVADA') {
        await tx.ferias.update({
          where: { id: sol.feriasId },
          data: { diasUsados: { increment: sol.diasSolicitados } },
        });
      }
    });
  },

  async cancelarSolicitacao(solicitacaoId: string, ctx: Ctx): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const sol = await tx.solicitacaoFerias.findFirst({
        where: { id: solicitacaoId, tenantId: ctx.tenantId },
        select: { status: true, feriasId: true, diasSolicitados: true },
      });
      if (!sol) throw new NotFoundError('Solicitação não encontrada');

      transitar(TRANSICOES_SOLICITACAO_FERIAS, sol.status, 'CANCELADA');

      await tx.solicitacaoFerias.update({
        where: { id: solicitacaoId },
        data: { status: 'CANCELADA' },
      });

      // Restituir dias se estava APROVADA
      if (sol.status === 'APROVADA') {
        await tx.ferias.update({
          where: { id: sol.feriasId },
          data: { diasUsados: { decrement: sol.diasSolicitados } },
        });
      }
    });
  },

  async obterSaldo(
    colaboradorId: string,
    ctx: Ctx,
  ): Promise<{ diasDisponiveis: number; diasUsados: number; diasPendentes: number }> {
    const ferias = await prisma.ferias.findFirst({
      where: { colaboradorId, tenantId: ctx.tenantId },
      orderBy: { periodoAquisitivoInicio: 'desc' },
      select: { diasDisponiveis: true, diasUsados: true, id: true },
    });
    if (!ferias) return { diasDisponiveis: 0, diasUsados: 0, diasPendentes: 0 };

    const pendentes = await prisma.solicitacaoFerias.aggregate({
      where: { feriasId: ferias.id, status: 'PENDENTE', tenantId: ctx.tenantId },
      _sum: { diasSolicitados: true },
    });

    return {
      diasDisponiveis: ferias.diasDisponiveis,
      diasUsados: ferias.diasUsados,
      diasPendentes: pendentes._sum.diasSolicitados ?? 0,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// AusenciaService
// ─────────────────────────────────────────────────────────────────────────────

export const AusenciaService = {
  async registar(input: CreateAusenciaInput, ctx: Ctx): Promise<{ id: string }> {
    const dias = Math.ceil(
      (input.dataFim.getTime() - input.dataInicio.getTime()) / (1000 * 60 * 60 * 24),
    ) + 1;

    const ausencia = await prisma.ausencia.create({
      data: {
        tenantId: ctx.tenantId,
        colaboradorId: input.colaboradorId,
        tipo: input.tipo,
        dataInicio: input.dataInicio,
        dataFim: input.dataFim,
        diasAusencia: dias,
        justificada: input.justificada ?? false,
        justificativa: input.justificativa,
        status: 'PENDENTE',
        observacoes: input.observacoes,
      },
      select: { id: true },
    });
    return { id: ausencia.id };
  },

  async aprovar(id: string, input: UpdateAusenciaInput, ctx: Ctx): Promise<void> {
    const ausencia = await prisma.ausencia.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { status: true },
    });
    if (!ausencia) throw new NotFoundError('Ausência não encontrada');

    transitar(TRANSICOES_AUSENCIA, ausencia.status, input.status);

    await prisma.ausencia.update({
      where: { id },
      data: {
        status: input.status,
        aprovadoPorId: ctx.userId,
        dataAprovacao: new Date(),
        observacoes: input.observacoes,
      },
    });
  },

  async listar(
    filter: {
      colaboradorId?: string;
      status?: string;
      dataInicio?: Date;
      dataFim?: Date;
      cursor?: string;
      take?: number;
    },
    ctx: Ctx,
  ) {
    return paginate(
      (a) =>
        prisma.ausencia.findMany({
          ...a,
          where: {
            tenantId: ctx.tenantId,
            ...(filter.colaboradorId ? { colaboradorId: filter.colaboradorId } : {}),
            ...(filter.status ? { status: filter.status as never } : {}),
            ...(filter.dataInicio ? { dataInicio: { gte: filter.dataInicio } } : {}),
            ...(filter.dataFim ? { dataFim: { lte: filter.dataFim } } : {}),
          },
          orderBy: { dataInicio: 'desc' },
          select: { id: true, colaboradorId: true, tipo: true, status: true, dataInicio: true, dataFim: true, diasAusencia: true },
        }),
      { cursor: filter.cursor, take: filter.take ?? 25 },
    );
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// AssiduidadeService
// ─────────────────────────────────────────────────────────────────────────────

export const AssiduidadeService = {
  async registar(input: CreateRegistoAssiduidadeInput, ctx: Ctx): Promise<{ id: string }> {
    // Unicidade: um registo por colaborador+data (schema: @@unique([tenantId, colaboradorId, data]))
    const existente = await prisma.registoAssiduidade.findUnique({
      where: {
        tenantId_colaboradorId_data: {
          tenantId: ctx.tenantId,
          colaboradorId: input.colaboradorId,
          data: input.data,
        },
      },
      select: { id: true },
    });
    if (existente) {
      throw new BusinessRuleError(
        'REGISTO_DUPLICADO',
        'Já existe um registo de assiduidade para este colaborador nesta data',
      );
    }

    const horasTrabalhadas =
      (input.saida.getTime() - input.entrada.getTime()) / (1000 * 60 * 60);
    const horasExtras = Math.max(0, horasTrabalhadas - 8);

    const registo = await prisma.registoAssiduidade.create({
      data: {
        tenantId: ctx.tenantId,
        colaboradorId: input.colaboradorId,
        data: input.data,
        entrada: input.entrada,
        saidaAlmoco: input.saidaAlmoco,
        retornoAlmoco: input.retornoAlmoco,
        saida: input.saida,
        horasTrabalhadas,
        horasExtras,
        atrasos: 0, // DB default; schema não expõe atrasos no input
        tipo: input.tipo,
        observacoes: input.observacoes,
      },
      select: { id: true },
    });
    return { id: registo.id };
  },

  async listar(filter: FilterAssiduidadeInput, ctx: Ctx) {
    return paginate(
      (a) =>
        prisma.registoAssiduidade.findMany({
          ...a,
          where: {
            tenantId: ctx.tenantId,
            ...(filter.colaboradorId ? { colaboradorId: filter.colaboradorId } : {}),
            ...(filter.tipo ? { tipo: filter.tipo } : {}),
            ...(filter.dataInicio ? { data: { gte: filter.dataInicio } } : {}),
            ...(filter.dataFim ? { data: { lte: filter.dataFim } } : {}),
          },
          include: { colaborador: { select: { nome: true } } },
          orderBy: { data: 'desc' },
        }),
      { cursor: filter.cursor, take: filter.take },
    );
  },

  async obter(id: string, ctx: Ctx) {
    const r = await prisma.registoAssiduidade.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { colaborador: { select: { id: true, nome: true, codigo: true } } },
    });
    if (!r) throw new NotFoundError('Registo de assiduidade não encontrado');
    return r;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// AvaliacaoService
// ─────────────────────────────────────────────────────────────────────────────

export const AvaliacaoService = {
  async criar(input: CreateAvaliacaoInput, ctx: Ctx): Promise<{ id: string }> {
    const avaliacao = await prisma.$transaction(async (tx) => {
      const av = await tx.avaliacao.create({
        data: {
          tenantId: ctx.tenantId,
          colaboradorId: input.colaboradorId,
          avaliadorId: input.avaliadorId,
          periodo: input.periodo,
          tipo: input.tipo,
          status: 'PENDENTE',
          dataInicio: input.dataInicio,
          pontosFortes: input.pontosFortes ?? [],
          pontosDesenvolvimento: input.pontosDesenvolvimento ?? [],
          planoAcao: input.planoAcao ?? [],
          comentarios: input.comentarios,
        },
        select: { id: true },
      });

      // Criar critérios
      if (input.criterios?.length) {
        await tx.criterioAvaliacao.createMany({
          data: input.criterios.map((c) => ({
            tenantId: ctx.tenantId,
            avaliacaoId: av.id,
            nome: c.nome,
            descricao: c.descricao,
            peso: c.peso,
            nota: c.nota,
            comentario: c.comentario,
          })),
        });
      }
      return av;
    });
    return { id: avaliacao.id };
  },

  async actualizar(id: string, input: UpdateAvaliacaoInput, ctx: Ctx): Promise<void> {
    const existente = await prisma.avaliacao.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { status: true },
    });
    if (!existente) throw new NotFoundError('Avaliação não encontrada');

    await prisma.avaliacao.update({
      where: { id },
      data: {
        criterios: input.criterios
          ? {
              deleteMany: {},
              createMany: {
                data: input.criterios.map((c) => ({
                  tenantId: ctx.tenantId,
                  avaliacaoId: id,
                  nome: c.nome,
                  descricao: c.descricao,
                  peso: c.peso,
                  nota: c.nota,
                  comentario: c.comentario,
                })),
              },
            }
          : undefined,
        pontosFortes: input.pontosFortes,
        pontosDesenvolvimento: input.pontosDesenvolvimento,
        planoAcao: input.planoAcao,
        comentarios: input.comentarios,
        dataConclusao: input.dataConclusao,
      },
    });
  },

  async listar(
    filter: {
      status?: string;
      tipo?: string;
      colaboradorId?: string;
      periodo?: string;
      cursor?: string;
      take?: number;
    },
    ctx: Ctx,
  ) {
    return paginate(
      (a) =>
        prisma.avaliacao.findMany({
          ...a,
          where: {
            tenantId: ctx.tenantId,
            ...(filter.status ? { status: filter.status as never } : {}),
            ...(filter.tipo ? { tipo: filter.tipo as never } : {}),
            ...(filter.colaboradorId ? { colaboradorId: filter.colaboradorId } : {}),
            ...(filter.periodo ? { periodo: filter.periodo } : {}),
          },
          include: {
            colaborador: { select: { nome: true } },
            avaliador: { select: { nome: true } },
          },
          orderBy: { dataInicio: 'desc' },
        }),
      { cursor: filter.cursor, take: filter.take ?? 25 },
    );
  },

  async obter(id: string, ctx: Ctx) {
    const av = await prisma.avaliacao.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        colaborador: { select: { id: true, nome: true, codigo: true } },
        avaliador: { select: { id: true, nome: true, codigo: true } },
        criterios: true,
      },
    });
    if (!av) throw new NotFoundError('Avaliação não encontrada');
    return av;
  },

  async transitarStatus(id: string, novoStatus: string, ctx: Ctx): Promise<void> {
    const avaliacao = await prisma.avaliacao.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { status: true, criterios: { select: { nota: true, peso: true } } },
    });
    if (!avaliacao) throw new NotFoundError('Avaliação não encontrada');

    transitar(TRANSICOES_AVALIACAO, avaliacao.status, novoStatus);

    let notaFinal: number | undefined;
    if (novoStatus === 'CONCLUIDA' && avaliacao.criterios.length > 0) {
      const pesoTotal = avaliacao.criterios.reduce((s, c) => s + Number(c.peso), 0);
      notaFinal =
        avaliacao.criterios.reduce((s, c) => s + Number(c.nota) * Number(c.peso), 0) /
        (pesoTotal || 1);
    }

    await prisma.avaliacao.update({
      where: { id },
      data: {
        status: novoStatus as never,
        ...(notaFinal !== undefined ? { notaFinal } : {}),
        ...(novoStatus === 'CONCLUIDA' ? { dataConclusao: new Date() } : {}),
      },
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// FormacaoService
// ─────────────────────────────────────────────────────────────────────────────

export const FormacaoService = {
  async criar(input: CreateFormacaoInput, ctx: Ctx): Promise<{ id: string }> {
    const formacao = await prisma.formacao.create({
      data: {
        tenantId: ctx.tenantId,
        titulo: input.titulo,
        descricao: input.descricao,
        categoria: input.categoria,
        instrutor: input.instrutor,
        cargaHoraria: input.cargaHoraria,
        dataInicio: input.dataInicio,
        dataFim: input.dataFim,
        local: input.local,
        modalidade: input.modalidade,
        vagasDisponiveis: input.vagasDisponiveis,
        status: 'PLANEADA',
        custoTotal: input.custoTotal,
        observacoes: input.observacoes,
      },
      select: { id: true },
    });
    return { id: formacao.id };
  },

  async actualizar(id: string, input: UpdateFormacaoInput, ctx: Ctx): Promise<void> {
    const existente = await prisma.formacao.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { status: true },
    });
    if (!existente) throw new NotFoundError('Formação não encontrada');
    if (existente.status === 'CONCLUIDA' || existente.status === 'CANCELADA') {
      throw new BusinessRuleError('FORMACAO_FECHADA', 'Não é possível editar uma formação concluída ou cancelada');
    }

    await prisma.formacao.update({
      where: { id },
      data: {
        titulo: input.titulo,
        descricao: input.descricao,
        dataInicio: input.dataInicio,
        dataFim: input.dataFim,
        local: input.local,
        vagasDisponiveis: input.vagasDisponiveis,
        custoTotal: input.custoTotal,
        observacoes: input.observacoes,
      },
    });
  },

  async transitarStatus(id: string, novoStatus: string, ctx: Ctx): Promise<void> {
    const formacao = await prisma.formacao.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { status: true },
    });
    if (!formacao) throw new NotFoundError('Formação não encontrada');

    transitar(TRANSICOES_FORMACAO, formacao.status, novoStatus);

    await prisma.formacao.update({
      where: { id },
      data: { status: novoStatus as never },
    });
  },

  async inscreverColaborador(
    formacaoId: string,
    colaboradorId: string,
    ctx: Ctx,
  ): Promise<{ id: string }> {
    const formacao = await prisma.formacao.findFirst({
      where: { id: formacaoId, tenantId: ctx.tenantId },
      select: { status: true, vagasDisponiveis: true, _count: { select: { participantes: true } } },
    });
    if (!formacao) throw new NotFoundError('Formação não encontrada');
    if (formacao.status !== 'PLANEADA' && formacao.status !== 'EM_ANDAMENTO') {
      throw new BusinessRuleError('FORMACAO_FECHADA', 'Formação não aceita inscrições');
    }
    if (formacao._count.participantes >= formacao.vagasDisponiveis) {
      throw new BusinessRuleError('VAGAS_ESGOTADAS', 'Não há vagas disponíveis nesta formação');
    }

    const participante = await prisma.participanteFormacao.create({
      data: {
        tenantId: ctx.tenantId,
        formacaoId,
        colaboradorId,
        status: 'INSCRITO',
      },
      select: { id: true },
    });
    return { id: participante.id };
  },

  async listar(filter: { search?: string; status?: string; cursor?: string; take?: number }, ctx: Ctx) {
    return paginate(
      (a) =>
        prisma.formacao.findMany({
          ...a,
          where: {
            tenantId: ctx.tenantId,
            ...(filter.status ? { status: filter.status as never } : {}),
            ...(filter.search ? { titulo: { contains: filter.search, mode: 'insensitive' } } : {}),
          },
          orderBy: { dataInicio: 'asc' },
          select: { id: true, titulo: true, status: true, dataInicio: true, dataFim: true, vagasDisponiveis: true, _count: { select: { participantes: true } } },
        }),
      { cursor: filter.cursor, take: filter.take ?? 25 },
    );
  },

  async obter(id: string, ctx: Ctx) {
    const formacao = await prisma.formacao.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        participantes: {
          include: {
            colaborador: { select: { id: true, nome: true, codigo: true } },
          },
          orderBy: { dataInscricao: 'asc' },
        },
      },
    });
    if (!formacao) throw new NotFoundError('Formação não encontrada');
    return formacao;
  },
};
