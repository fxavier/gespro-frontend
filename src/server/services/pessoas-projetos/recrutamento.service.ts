import 'server-only';
import { prisma } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { transitar } from './rh.service';
import { TRANSICOES_VAGA, TRANSICOES_CANDIDATURA, calcularMidpoint } from '@/lib/state-machines';
import type { Ctx } from '@/server/services/types';
import type {
  VagaInput,
  UpdateVagaInput,
  FilterVagaInput,
  CandidatoInput,
  UpdateCandidatoInput,
  FilterCandidatoInput,
  CandidaturaInput,
  MoverEtapaInput,
  MoverPosicaoKanbanInput,
  EntrevistaInput,
  AdmitirInput,
  TransitarStatusVagaInput,
} from '@/lib/validations/recrutamento';
import { Prisma } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Utilitário: geração de código sequencial simples (prefixo + timestamp)
// ─────────────────────────────────────────────────────────────────────────────

function gerarCodigoVaga(): string {
  return `VAG-${Date.now().toString(36).toUpperCase()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// VagaService
// ─────────────────────────────────────────────────────────────────────────────

export const VagaService = {
  async criar(input: VagaInput, ctx: Ctx): Promise<{ id: string; codigo: string }> {
    let codigo = gerarCodigoVaga();
    // Garante unicidade no tenant (loop defensivo)
    let tentativas = 0;
    while (tentativas < 3) {
      const existe = await prisma.vaga.findUnique({
        where: { tenantId_codigo: { tenantId: ctx.tenantId, codigo } },
        select: { id: true },
      });
      if (!existe) break;
      codigo = gerarCodigoVaga();
      tentativas++;
    }

    const vaga = await prisma.vaga.create({
      data: {
        tenantId: ctx.tenantId,
        codigo,
        titulo: input.titulo,
        descricao: input.descricao,
        departamentoId: input.departamentoId ?? null,
        cargoId: input.cargoId ?? null,
        numeroPosicoes: input.numeroPosicoes ?? 1,
        salarioMin: input.salarioMin != null ? new Prisma.Decimal(input.salarioMin) : null,
        salarioMax: input.salarioMax != null ? new Prisma.Decimal(input.salarioMax) : null,
        regimeTrabalho: input.regimeTrabalho,
        tipoContrato: input.tipoContrato,
        localizacao: input.localizacao ?? null,
        requisitos: input.requisitos ?? [],
        dataAbertura: input.dataAbertura ?? null,
        dataFecho: input.dataFecho ?? null,
        responsavelId: input.responsavelId ?? null,
        status: 'RASCUNHO',
      },
      select: { id: true, codigo: true },
    });

    return vaga;
  },

  async actualizar(id: string, input: UpdateVagaInput, ctx: Ctx): Promise<void> {
    const vaga = await prisma.vaga.findUnique({
      where: { id },
      select: { id: true, tenantId: true, status: true },
    });
    if (!vaga || vaga.tenantId !== ctx.tenantId) throw new NotFoundError('Vaga não encontrada');
    if (vaga.status === 'FECHADA' || vaga.status === 'CANCELADA') {
      throw new BusinessRuleError('VAGA_TERMINAL', 'Não é possível editar uma vaga fechada ou cancelada');
    }

    await prisma.vaga.update({
      where: { id },
      data: {
        titulo: input.titulo,
        descricao: input.descricao,
        departamentoId: input.departamentoId ?? undefined,
        cargoId: input.cargoId ?? undefined,
        numeroPosicoes: input.numeroPosicoes,
        salarioMin: input.salarioMin != null ? new Prisma.Decimal(input.salarioMin) : undefined,
        salarioMax: input.salarioMax != null ? new Prisma.Decimal(input.salarioMax) : undefined,
        regimeTrabalho: input.regimeTrabalho,
        tipoContrato: input.tipoContrato,
        localizacao: input.localizacao ?? undefined,
        requisitos: input.requisitos,
        dataAbertura: input.dataAbertura ?? undefined,
        dataFecho: input.dataFecho ?? undefined,
        responsavelId: input.responsavelId ?? undefined,
      },
    });
  },

  async transitarStatus(input: TransitarStatusVagaInput, ctx: Ctx): Promise<void> {
    const vaga = await prisma.vaga.findUnique({
      where: { id: input.vagaId },
      select: { id: true, tenantId: true, status: true },
    });
    if (!vaga || vaga.tenantId !== ctx.tenantId) throw new NotFoundError('Vaga não encontrada');

    transitar(TRANSICOES_VAGA, vaga.status, input.novoStatus, 'TRANSICAO_VAGA_INVALIDA');

    await prisma.vaga.update({
      where: { id: input.vagaId },
      data: {
        status: input.novoStatus,
        dataAbertura: input.novoStatus === 'ABERTA' ? new Date() : undefined,
        dataFecho: (input.novoStatus === 'FECHADA' || input.novoStatus === 'CANCELADA') ? new Date() : undefined,
      },
    });
  },

  async listar(filter: FilterVagaInput, ctx: Ctx) {
    const { q, status, take, cursor, orderBy, orderDir } = filter;

    const where: Prisma.VagaWhereInput = {
      tenantId: ctx.tenantId,
      ...(status ? { status } : {}),
      ...(q ? {
        OR: [
          { titulo: { contains: q, mode: 'insensitive' } },
          { codigo: { contains: q, mode: 'insensitive' } },
          { localizacao: { contains: q, mode: 'insensitive' } },
        ],
      } : {}),
    };

    const items = await prisma.vaga.findMany({
      where,
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { [orderBy]: orderDir },
      select: {
        id: true,
        codigo: true,
        titulo: true,
        status: true,
        numeroPosicoes: true,
        posicoesPreenchidas: true,
        localizacao: true,
        regimeTrabalho: true,
        tipoContrato: true,
        dataAbertura: true,
        createdAt: true,
        _count: { select: { candidaturas: true } },
      },
    });

    const hasMore = items.length > take;
    if (hasMore) items.pop();

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    };
  },

  async obter(id: string, ctx: Ctx) {
    const vaga = await prisma.vaga.findUnique({
      where: { id },
      include: {
        candidaturas: {
          include: {
            candidato: { select: { id: true, nome: true, email: true } },
            entrevistas: { orderBy: { dataHora: 'desc' }, take: 1, select: { id: true, tipo: true, dataHora: true, avaliacao: true, recomendaAvancar: true } },
          },
          orderBy: [{ etapa: 'asc' }, { posicao: 'asc' }],
        },
      },
    });
    if (!vaga || vaga.tenantId !== ctx.tenantId) throw new NotFoundError('Vaga não encontrada');
    return vaga;
  },

  async contarPorStatus(ctx: Ctx) {
    const counts = await prisma.vaga.groupBy({
      by: ['status'],
      where: { tenantId: ctx.tenantId },
      _count: { _all: true },
    });
    const map = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
    return {
      total: counts.reduce((sum, c) => sum + c._count._all, 0),
      rascunho: map['RASCUNHO'] ?? 0,
      abertas: map['ABERTA'] ?? 0,
      emTriagem: map['EM_TRIAGEM'] ?? 0,
      fechadas: map['FECHADA'] ?? 0,
      canceladas: map['CANCELADA'] ?? 0,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// CandidatoService
// ─────────────────────────────────────────────────────────────────────────────

export const CandidatoService = {
  async criar(input: CandidatoInput, ctx: Ctx): Promise<{ id: string }> {
    // Unicidade: email por tenant
    const existe = await prisma.candidato.findFirst({
      where: { tenantId: ctx.tenantId, email: input.email },
      select: { id: true },
    });
    if (existe) {
      throw new BusinessRuleError('CANDIDATO_EMAIL_DUPLICADO', `Já existe um candidato com o email '${input.email}'`);
    }

    const candidato = await prisma.candidato.create({
      data: {
        tenantId: ctx.tenantId,
        nome: input.nome,
        email: input.email,
        telefone: input.telefone,
        bi: input.bi ?? null,
        nuit: input.nuit ?? null,
        cvUrl: input.cvUrl ?? null,
        linkedinUrl: input.linkedinUrl ?? null,
        observacoes: input.observacoes ?? null,
      },
      select: { id: true },
    });
    return candidato;
  },

  async actualizar(id: string, input: UpdateCandidatoInput, ctx: Ctx): Promise<void> {
    const candidato = await prisma.candidato.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    });
    if (!candidato || candidato.tenantId !== ctx.tenantId) throw new NotFoundError('Candidato não encontrado');

    await prisma.candidato.update({
      where: { id },
      data: {
        nome: input.nome,
        email: input.email,
        telefone: input.telefone,
        bi: input.bi ?? undefined,
        nuit: input.nuit ?? undefined,
        cvUrl: input.cvUrl ?? undefined,
        linkedinUrl: input.linkedinUrl ?? undefined,
        observacoes: input.observacoes ?? undefined,
      },
    });
  },

  async listar(filter: FilterCandidatoInput, ctx: Ctx) {
    const { q, take, cursor } = filter;

    const where: Prisma.CandidatoWhereInput = {
      tenantId: ctx.tenantId,
      ...(q ? {
        OR: [
          { nome: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      } : {}),
    };

    const items = await prisma.candidato.findMany({
      where,
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        bi: true,
        nuit: true,
        createdAt: true,
        _count: { select: { candidaturas: true } },
      },
    });

    const hasMore = items.length > take;
    if (hasMore) items.pop();

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    };
  },

  async obter(id: string, ctx: Ctx) {
    const candidato = await prisma.candidato.findUnique({
      where: { id },
      include: {
        candidaturas: {
          include: { vaga: { select: { id: true, titulo: true, codigo: true, status: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!candidato || candidato.tenantId !== ctx.tenantId) throw new NotFoundError('Candidato não encontrado');
    return candidato;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// CandidaturaService
// ─────────────────────────────────────────────────────────────────────────────

export const CandidaturaService = {
  /**
   * Submete uma candidatura a uma vaga.
   * Valida: vaga ABERTA ou EM_TRIAGEM + unicidade candidato/vaga.
   */
  async candidatar(input: CandidaturaInput, ctx: Ctx): Promise<{ id: string }> {
    // Verificar vaga
    const vaga = await prisma.vaga.findUnique({
      where: { id: input.vagaId },
      select: { id: true, tenantId: true, status: true, titulo: true },
    });
    if (!vaga || vaga.tenantId !== ctx.tenantId) throw new NotFoundError('Vaga não encontrada');
    if (vaga.status !== 'ABERTA' && vaga.status !== 'EM_TRIAGEM') {
      throw new BusinessRuleError('VAGA_NAO_ACEITA_CANDIDATURAS', `A vaga '${vaga.titulo}' não está a aceitar candidaturas (status: ${vaga.status})`);
    }

    // Verificar candidato
    const candidato = await prisma.candidato.findUnique({
      where: { id: input.candidatoId },
      select: { id: true, tenantId: true },
    });
    if (!candidato || candidato.tenantId !== ctx.tenantId) throw new NotFoundError('Candidato não encontrado');

    // Unicidade
    const existente = await prisma.candidatura.findUnique({
      where: {
        tenantId_vagaId_candidatoId: {
          tenantId: ctx.tenantId,
          vagaId: input.vagaId,
          candidatoId: input.candidatoId,
        },
      },
      select: { id: true },
    });
    if (existente) {
      throw new BusinessRuleError('CANDIDATURA_DUPLICADA', 'Este candidato já se candidatou a esta vaga');
    }

    // Calcular posição no final da coluna RECEBIDA
    const ultima = await prisma.candidatura.findFirst({
      where: { tenantId: ctx.tenantId, vagaId: input.vagaId, etapa: 'RECEBIDA' },
      orderBy: { posicao: 'desc' },
      select: { posicao: true },
    });

    const posicao = calcularMidpoint(ultima?.posicao ?? null, null);

    const candidatura = await prisma.candidatura.create({
      data: {
        tenantId: ctx.tenantId,
        vagaId: input.vagaId,
        candidatoId: input.candidatoId,
        fonte: input.fonte ?? null,
        pretensaoSalarial: input.pretensaoSalarial != null ? new Prisma.Decimal(input.pretensaoSalarial) : null,
        notaTriagem: input.notaTriagem != null ? new Prisma.Decimal(input.notaTriagem) : null,
        posicao,
        etapa: 'RECEBIDA',
      },
      select: { id: true },
    });

    // Histórico inicial
    await prisma.historicoCandidatura.create({
      data: {
        tenantId: ctx.tenantId,
        candidaturaId: candidatura.id,
        etapaAnterior: null,
        etapaNova: 'RECEBIDA',
        responsavelId: ctx.userId,
        notas: 'Candidatura recebida',
      },
    });

    return candidatura;
  },

  /**
   * Move a candidatura para a próxima etapa do pipeline.
   * Valida transição, cria histórico e registo de auditoria.
   */
  async moverEtapa(input: MoverEtapaInput, ctx: Ctx): Promise<void> {
    const candidatura = await prisma.candidatura.findUnique({
      where: { id: input.candidaturaId },
      select: { id: true, tenantId: true, etapa: true, vagaId: true },
    });
    if (!candidatura || candidatura.tenantId !== ctx.tenantId) {
      throw new NotFoundError('Candidatura não encontrada');
    }

    transitar(TRANSICOES_CANDIDATURA, candidatura.etapa, input.novaEtapa, 'TRANSICAO_CANDIDATURA_INVALIDA');

    // Calcular posição no fim da nova coluna
    const ultima = await prisma.candidatura.findFirst({
      where: {
        tenantId: ctx.tenantId,
        vagaId: candidatura.vagaId,
        etapa: input.novaEtapa,
        id: { not: input.candidaturaId },
      },
      orderBy: { posicao: 'desc' },
      select: { posicao: true },
    });
    const posicao = calcularMidpoint(ultima?.posicao ?? null, null);

    await prisma.$transaction(async (tx) => {
      await tx.candidatura.update({
        where: { id: input.candidaturaId },
        data: {
          etapa: input.novaEtapa,
          posicao,
          motivoRejeicao: input.motivoRejeicao ?? undefined,
        },
      });

      await tx.historicoCandidatura.create({
        data: {
          tenantId: ctx.tenantId,
          candidaturaId: input.candidaturaId,
          etapaAnterior: candidatura.etapa,
          etapaNova: input.novaEtapa,
          responsavelId: ctx.userId,
          notas: input.notas ?? null,
        },
      });
    });
  },

  /**
   * Move a posição fraccional no kanban (drag-and-drop).
   * Pode também mudar de etapa se novaEtapa for fornecida.
   */
  async moverPosicaoKanban(input: MoverPosicaoKanbanInput, ctx: Ctx): Promise<void> {
    const candidatura = await prisma.candidatura.findUnique({
      where: { id: input.candidaturaId },
      select: { id: true, tenantId: true, etapa: true },
    });
    if (!candidatura || candidatura.tenantId !== ctx.tenantId) {
      throw new NotFoundError('Candidatura não encontrada');
    }

    // Se mudar de etapa, valida transição
    if (input.novaEtapa && input.novaEtapa !== candidatura.etapa) {
      transitar(TRANSICOES_CANDIDATURA, candidatura.etapa, input.novaEtapa, 'TRANSICAO_CANDIDATURA_INVALIDA');
    }

    await prisma.$transaction(async (tx) => {
      await tx.candidatura.update({
        where: { id: input.candidaturaId },
        data: {
          posicao: input.posicao,
          ...(input.novaEtapa ? { etapa: input.novaEtapa } : {}),
        },
      });

      // Se mudou de etapa, registar histórico
      if (input.novaEtapa && input.novaEtapa !== candidatura.etapa) {
        await tx.historicoCandidatura.create({
          data: {
            tenantId: ctx.tenantId,
            candidaturaId: input.candidaturaId,
            etapaAnterior: candidatura.etapa,
            etapaNova: input.novaEtapa,
            responsavelId: ctx.userId,
            notas: 'Movido via kanban',
          },
        });
      }
    });
  },

  /**
   * Regista uma entrevista para a candidatura.
   */
  async registarEntrevista(input: EntrevistaInput, ctx: Ctx): Promise<{ id: string }> {
    const candidatura = await prisma.candidatura.findUnique({
      where: { id: input.candidaturaId },
      select: { id: true, tenantId: true },
    });
    if (!candidatura || candidatura.tenantId !== ctx.tenantId) {
      throw new NotFoundError('Candidatura não encontrada');
    }

    const entrevista = await prisma.entrevista.create({
      data: {
        tenantId: ctx.tenantId,
        candidaturaId: input.candidaturaId,
        tipo: input.tipo,
        dataHora: input.dataHora,
        entrevistadores: input.entrevistadores,
        avaliacao: input.avaliacao != null ? new Prisma.Decimal(input.avaliacao) : null,
        parecer: input.parecer ?? null,
        recomendaAvancar: input.recomendaAvancar ?? null,
      },
      select: { id: true },
    });

    return entrevista;
  },

  /**
   * Admite o candidato como Colaborador, numa $transaction atómica:
   * 1. Cria Colaborador (valida unicidade NUIT/BI/email antes)
   * 2. Marca candidatura.etapa = CONTRATADO, colaboradorId preenchido
   * 3. Regista histórico
   * 4. Incrementa vaga.posicoesPreenchidas
   * 5. Fecha vaga automaticamente se posições ficarem preenchidas
   */
  async admitir(input: AdmitirInput, ctx: Ctx): Promise<{ colaboradorId: string }> {
    const candidatura = await prisma.candidatura.findUnique({
      where: { id: input.candidaturaId },
      include: {
        vaga: { select: { id: true, tenantId: true, numeroPosicoes: true, posicoesPreenchidas: true, status: true } },
        candidato: { select: { id: true, nome: true, email: true } },
      },
    });
    if (!candidatura || candidatura.tenantId !== ctx.tenantId) {
      throw new NotFoundError('Candidatura não encontrada');
    }
    if (candidatura.etapa === 'CONTRATADO') {
      throw new BusinessRuleError('CANDIDATURA_JA_ADMITIDA', 'Esta candidatura já foi convertida em colaborador');
    }
    // Valida transição via máquina de estado (só PROPOSTA→CONTRATADO é permitido)
    transitar(TRANSICOES_CANDIDATURA, candidatura.etapa, 'CONTRATADO', 'ETAPA_INVALIDA_ADMISSAO');

    // Validar unicidade de Colaborador antes da transacção (melhor UX)
    const [colabNuit, colabBi, colabEmail] = await Promise.all([
      prisma.colaborador.findFirst({
        where: { tenantId: ctx.tenantId, nuit: input.nuit },
        select: { id: true },
      }),
      prisma.colaborador.findFirst({
        where: { tenantId: ctx.tenantId, bi: input.bi },
        select: { id: true },
      }),
      prisma.colaborador.findFirst({
        where: { tenantId: ctx.tenantId, email: input.email },
        select: { id: true },
      }),
    ]);

    if (colabNuit) throw new BusinessRuleError('COLABORADOR_NUIT_DUPLICADO', `Já existe um colaborador com o NUIT '${input.nuit}'`);
    if (colabBi) throw new BusinessRuleError('COLABORADOR_BI_DUPLICADO', `Já existe um colaborador com o BI '${input.bi}'`);
    if (colabEmail) throw new BusinessRuleError('COLABORADOR_EMAIL_DUPLICADO', `Já existe um colaborador com o email '${input.email}'`);

    // Validar código de colaborador
    const colabCodigo = await prisma.colaborador.findFirst({
      where: { tenantId: ctx.tenantId, codigo: input.codigo },
      select: { id: true },
    });
    if (colabCodigo) throw new BusinessRuleError('COLABORADOR_CODIGO_DUPLICADO', `Já existe um colaborador com o código '${input.codigo}'`);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Criar Colaborador
      const colaborador = await tx.colaborador.create({
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
          niss: input.niss ?? null,
          email: input.email,
          telefone: input.telefone,
          telefoneAlternativo: input.telefoneAlternativo ?? null,
          enderecoRua: input.enderecoRua,
          enderecoNumero: input.enderecoNumero,
          enderecoBairro: input.enderecoBairro,
          enderecoCidade: input.enderecoCidade,
          enderecoProvincia: input.enderecoProvincia,
          enderecoCodigoPostal: input.enderecoCodigoPostal ?? null,
          emergenciaNome: input.emergenciaNome,
          emergenciaParentesco: input.emergenciaParentesco,
          emergenciaTelefone: input.emergenciaTelefone,
          fotoUrl: input.fotoUrl ?? null,
          departamentoId: input.departamentoId ?? null,
          cargoId: input.cargoId ?? null,
          supervisorId: input.supervisorId ?? null,
          dataAdmissao: input.dataAdmissao,
          status: 'PERIODO_EXPERIMENTAL',
          tipoContrato: input.tipoContrato,
          regimeTrabalho: input.regimeTrabalho,
          horarioTrabalho: input.horarioTrabalho ?? null,
          salarioBase: new Prisma.Decimal(input.salarioBase),
          subsidioAlimentacao: input.subsidioAlimentacao != null ? new Prisma.Decimal(input.subsidioAlimentacao) : null,
          subsidioTransporte: input.subsidioTransporte != null ? new Prisma.Decimal(input.subsidioTransporte) : null,
          subsidioHabitacao: input.subsidioHabitacao != null ? new Prisma.Decimal(input.subsidioHabitacao) : null,
          subsidiosOutros: input.subsidiosOutros != null ? new Prisma.Decimal(input.subsidiosOutros) : null,
          localizacao: input.localizacao ?? null,
          bancoBanco: input.bancoBanco ?? null,
          bancoNib: input.bancoNib ?? null,
          bancoTitular: input.bancoTitular ?? null,
          nivelAcesso: input.nivelAcesso ?? 'USUARIO',
          observacoes: input.observacoes ?? null,
        },
        select: { id: true },
      });

      // 2. Actualizar candidatura
      await tx.candidatura.update({
        where: { id: input.candidaturaId },
        data: {
          etapa: 'CONTRATADO',
          colaboradorId: colaborador.id,
        },
      });

      // 3. Histórico
      await tx.historicoCandidatura.create({
        data: {
          tenantId: ctx.tenantId,
          candidaturaId: input.candidaturaId,
          etapaAnterior: candidatura.etapa,
          etapaNova: 'CONTRATADO',
          responsavelId: ctx.userId,
          notas: `Admitido como Colaborador (código: ${input.codigo})`,
        },
      });

      // 4. Incrementar posições preenchidas da vaga
      const vagaActualizada = await tx.vaga.update({
        where: { id: candidatura.vagaId },
        data: { posicoesPreenchidas: { increment: 1 } },
        select: { posicoesPreenchidas: true, numeroPosicoes: true, status: true },
      });

      // 5. Fechar vaga automaticamente se todas as posições preenchidas
      if (
        vagaActualizada.posicoesPreenchidas >= vagaActualizada.numeroPosicoes &&
        vagaActualizada.status !== 'FECHADA' &&
        vagaActualizada.status !== 'CANCELADA'
      ) {
        await tx.vaga.update({
          where: { id: candidatura.vagaId },
          data: { status: 'FECHADA', dataFecho: new Date() },
        });
      }

      return { colaboradorId: colaborador.id };
    });

    return result;
  },

  async obter(id: string, ctx: Ctx) {
    const candidatura = await prisma.candidatura.findUnique({
      where: { id },
      include: {
        vaga: { select: { id: true, titulo: true, codigo: true, status: true, regimeTrabalho: true, tipoContrato: true, salarioMin: true, salarioMax: true } },
        candidato: true,
        entrevistas: { orderBy: { dataHora: 'desc' } },
        historico: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!candidatura || candidatura.tenantId !== ctx.tenantId) throw new NotFoundError('Candidatura não encontrada');
    return candidatura;
  },
};
