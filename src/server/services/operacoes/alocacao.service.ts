// Serviço de Alocação — WS F (Wave 2)
// Porta src/services/transporte-alocacao.service.ts para a nova camada Prisma.
// Funções puras: sem estado interno, sem chamadas IO — testáveis e property-test-ready.

import 'server-only';
import type {
  IAlocacaoService,
  ViaturaParaAlocacao,
  MotoristaParaAlocacao,
  AtividadeRef,
  ConflictResult,
  ValidationResult,
} from './alocacao.interface';

// ============================================================
// calcularEstadoDocumento (pure)
// ============================================================

export function calcularEstadoDocumento(
  dataValidade: Date,
  prazoAlertaDias: number,
): 'VALIDO' | 'PROXIMO_EXPIRAR' | 'EXPIRADO' {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const val = new Date(dataValidade);
  val.setHours(0, 0, 0, 0);

  if (val < hoje) return 'EXPIRADO';

  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + prazoAlertaDias);

  if (val <= limite) return 'PROXIMO_EXPIRAR';

  return 'VALIDO';
}

// ============================================================
// verificarConflitosAgenda (pure)
// ============================================================

function intervalosSesobrepoem(
  inicio1: Date,
  fim1: Date | undefined,
  inicio2: Date,
  fim2: Date | undefined,
): boolean {
  // Dois intervalos [A,B) e [C,D) sobrepõem-se quando A < D && C < B.
  // Intervalos sem fim são abertos à direita → qualquer sobreposição conta.
  if (!fim1 && !fim2) return true;
  if (!fim1) return inicio1 < fim2!;
  if (!fim2) return inicio2 < fim1;
  return inicio1 < fim2 && inicio2 < fim1;
}

export function verificarConflitosAgenda(
  entidadeId: string,
  tipo: 'viatura' | 'motorista',
  dataInicio: Date,
  dataFim: Date | undefined,
  atividades: AtividadeRef[],
): ConflictResult[] {
  // Atividades terminais não geram conflito
  const ativas = atividades.filter(
    (a) => a.estado !== 'CONCLUIDA' && a.estado !== 'CANCELADA',
  );

  const daEntidade = ativas.filter((a) =>
    tipo === 'viatura'
      ? a.viaturaId === entidadeId
      : a.motoristaResponsavelId === entidadeId,
  );

  const conflitos: ConflictResult[] = [];

  for (const a of daEntidade) {
    const aInicio = new Date(a.dataInicioPrevista);
    const aFim = a.dataConclusaoPrevista ? new Date(a.dataConclusaoPrevista) : undefined;

    if (intervalosSesobrepoem(dataInicio, dataFim, aInicio, aFim)) {
      conflitos.push({
        atividadeId: a.id,
        atividadeCodigo: a.codigo,
        dataInicio: aInicio,
        dataFim: aFim,
        descricao: `Conflito com a atividade "${a.titulo}" (${a.codigo})`,
      });
    }
  }

  return conflitos;
}

// ============================================================
// validarAlocacaoViatura (pure)
// ============================================================

export function validarAlocacaoViatura(
  viatura: ViaturaParaAlocacao,
  dataInicio: Date,
  dataFim?: Date,
  atividadesExistentes?: AtividadeRef[],
): ValidationResult {
  const errors: string[] = [];

  // 1. Documentos expirados
  for (const doc of viatura.documentos) {
    if (doc.estado === 'EXPIRADO') {
      errors.push(
        `Viatura ${viatura.matricula}: documento (id: ${doc.id}) está expirado desde ${formatarData(doc.dataValidade)}.`,
      );
    }
  }

  // 2. Checklist mais recente com itens em avaria ou falta
  if (viatura.checklist) {
    for (const item of viatura.checklist.itens) {
      if (item.estado === 'AVARIA' || item.estado === 'FALTA') {
        errors.push(
          `Viatura ${viatura.matricula}: checklist — item "${item.nome}" em estado "${item.estado.toLowerCase()}".`,
        );
      }
    }
  }

  // 3. Conflitos de agenda
  if (atividadesExistentes?.length) {
    const conflitos = verificarConflitosAgenda(
      viatura.id, 'viatura', dataInicio, dataFim, atividadesExistentes,
    );
    for (const c of conflitos) errors.push(c.descricao);
  }

  return { isValid: errors.length === 0, errors };
}

// ============================================================
// validarAlocacaoMotorista (pure)
// ============================================================

export function validarAlocacaoMotorista(
  motorista: MotoristaParaAlocacao,
  dataInicio: Date,
  dataFim?: Date,
  atividadesExistentes?: AtividadeRef[],
): ValidationResult {
  const errors: string[] = [];

  // 1. Carta de condução expirada
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const validadeCarta = new Date(motorista.validadeCarta);
  validadeCarta.setHours(0, 0, 0, 0);

  if (validadeCarta < hoje) {
    errors.push(
      `Carta de condução do motorista "${motorista.nomeCompleto}" expirou em ${formatarData(motorista.validadeCarta)}.`,
    );
  }

  // 2. Disponibilidade
  if (motorista.disponibilidade && !motorista.disponibilidade.disponivel) {
    const motivo = motorista.disponibilidade.motivo
      ? motorista.disponibilidade.motivo.toLowerCase().replace('_', ' ')
      : 'motivo não especificado';
    errors.push(`Motorista "${motorista.nomeCompleto}" está indisponível: ${motivo}.`);
  }

  // 3. Conflitos de agenda
  if (atividadesExistentes?.length) {
    const conflitos = verificarConflitosAgenda(
      motorista.id, 'motorista', dataInicio, dataFim, atividadesExistentes,
    );
    for (const c of conflitos) errors.push(c.descricao);
  }

  return { isValid: errors.length === 0, errors };
}

// ============================================================
// Utilitário interno
// ============================================================

function formatarData(data: Date): string {
  return new Date(data).toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// ============================================================
// Instância do serviço (singleton)
// ============================================================

export const alocacaoService: IAlocacaoService = {
  calcularEstadoDocumento,
  verificarConflitosAgenda,
  validarAlocacaoViatura,
  validarAlocacaoMotorista,
};
