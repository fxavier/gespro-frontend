// ============================================================
// Serviço de Alocação — Módulo de Transportes e Logística
// Funções puras de validação: sem estado interno, sem HTTP
// ============================================================

import type { Atividade, Motorista, Viatura } from '@/types/transporte';

// ------------------------------------------------------------
// Interfaces de resultado
// ------------------------------------------------------------

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface ConflictResult {
  atividadeId: string;
  atividadeCodigo: string;
  dataInicio: Date;
  dataFim?: Date;
  descricao: string;
}

// ------------------------------------------------------------
// calcularEstadoDocumento
// Requisitos: 3.4, 3.5, 3.6, 9.4, 9.5, 9.6
// ------------------------------------------------------------

/**
 * Calcula o estado de um documento com base na data de validade e no prazo de alerta.
 *
 * - 'expirado'        → dataValidade < hoje
 * - 'proximo_expirar' → dataValidade está entre hoje e hoje + prazoAlertaDias (inclusive)
 * - 'valido'          → dataValidade > hoje + prazoAlertaDias
 */
export function calcularEstadoDocumento(
  dataValidade: Date,
  prazoAlertaDias: number,
): 'valido' | 'proximo_expirar' | 'expirado' {
  const hoje = new Date();
  // Normalizar para início do dia para comparações consistentes
  hoje.setHours(0, 0, 0, 0);

  const validade = new Date(dataValidade);
  validade.setHours(0, 0, 0, 0);

  if (validade < hoje) {
    return 'expirado';
  }

  const limiteAlerta = new Date(hoje);
  limiteAlerta.setDate(limiteAlerta.getDate() + prazoAlertaDias);

  if (validade <= limiteAlerta) {
    return 'proximo_expirar';
  }

  return 'valido';
}

// ------------------------------------------------------------
// verificarConflitosAgenda
// Requisitos: 7.5, 7.6, 7.7, 7.8
// ------------------------------------------------------------

/**
 * Verifica conflitos de agenda para uma viatura ou motorista.
 *
 * Dois intervalos [A_inicio, A_fim] e [B_inicio, B_fim] sobrepõem-se quando:
 *   A_inicio < B_fim  &&  B_inicio < A_fim
 *
 * Quando dataFim é indefinida, considera-se que a atividade não tem fim previsto
 * e qualquer sobreposição com o dataInicio é suficiente para gerar conflito.
 */
export function verificarConflitosAgenda(
  entidadeId: string,
  tipo: 'viatura' | 'motorista',
  dataInicio: Date,
  dataFim: Date | undefined,
  atividades: Atividade[],
): ConflictResult[] {
  // Atividades terminadas não geram conflito
  const ativadasAtivas = atividades.filter(
    (a) => a.estado !== 'concluida' && a.estado !== 'cancelada',
  );

  // Filtrar atividades da mesma entidade
  const atividadesDaEntidade = ativadasAtivas.filter((a) => {
    if (tipo === 'viatura') return a.viaturaId === entidadeId;
    return a.motoristaResponsavelId === entidadeId;
  });

  const conflitos: ConflictResult[] = [];

  for (const atividade of atividadesDaEntidade) {
    const aInicio = new Date(atividade.dataInicioPrevista);
    const aFim = atividade.dataConclusaoPrevista
      ? new Date(atividade.dataConclusaoPrevista)
      : null;

    // Verificar sobreposição de intervalos
    const haConflito = intervalosSesobrepoem(dataInicio, dataFim, aInicio, aFim ?? undefined);

    if (haConflito) {
      conflitos.push({
        atividadeId: atividade.id,
        atividadeCodigo: atividade.codigo,
        dataInicio: aInicio,
        dataFim: aFim ?? undefined,
        descricao: `Conflito com a atividade "${atividade.titulo}" (${atividade.codigo})`,
      });
    }
  }

  return conflitos;
}

/**
 * Determina se dois intervalos de tempo se sobrepõem.
 * Intervalos sem fim (undefined) são tratados como abertos à direita.
 */
function intervalosSesobrepoem(
  inicio1: Date,
  fim1: Date | undefined,
  inicio2: Date,
  fim2: Date | undefined,
): boolean {
  // [inicio1, fim1) sobrepõe [inicio2, fim2) se:
  //   inicio1 < fim2  &&  inicio2 < fim1
  // Quando fim é indefinido, o intervalo é aberto → qualquer sobreposição conta

  // Se ambos os fins são indefinidos, qualquer par de atividades conflitua
  if (!fim1 && !fim2) return true;

  // Se apenas fim1 é indefinido: conflito se inicio1 < fim2 (ou seja, inicio1 antes do fim da outra)
  if (!fim1) return inicio1 < fim2!;

  // Se apenas fim2 é indefinido: conflito se inicio2 < fim1
  if (!fim2) return inicio2 < fim1;

  // Ambos têm fim: sobreposição clássica
  return inicio1 < fim2 && inicio2 < fim1;
}

// ------------------------------------------------------------
// validarAlocacaoViatura
// Requisitos: 7.1, 7.2, 5.6
// ------------------------------------------------------------

/**
 * Valida se uma viatura pode ser alocada a uma atividade.
 *
 * Verificações (por ordem):
 * 1. Documentos expirados → bloqueia com lista de documentos inválidos
 * 2. Checklist mais recente com itens em avaria/falta → bloqueia
 * 3. Conflitos de agenda com atividades existentes → bloqueia
 */
export function validarAlocacaoViatura(
  viatura: Viatura,
  dataInicio: Date,
  dataFim?: Date,
  atividadesExistentes?: Atividade[],
): ValidationResult {
  const errors: string[] = [];

  // 1. Verificar documentos expirados
  const documentosExpirados = viatura.documentos.filter(
    (doc) => doc.estado === 'expirado',
  );

  for (const doc of documentosExpirados) {
    errors.push(
      `Documento "${tipoDocumentoViatura(doc.tipo)}" (nº ${doc.numero}) está expirado desde ${formatarData(doc.dataValidade)}.`,
    );
  }

  // 2. Verificar checklist mais recente
  // A viatura não tem checklists directamente no tipo — a validação recebe
  // a viatura tal como está. Para suportar checklists, o chamador deve
  // passar uma viatura com o campo `checklists` populado se disponível.
  // Como o tipo Viatura não inclui checklists directamente, esta verificação
  // é feita via cast seguro para suportar extensão futura.
  const viaturaComChecklist = viatura as Viatura & { checklists?: import('@/types/transporte').ChecklistViatura[] };
  if (viaturaComChecklist.checklists && viaturaComChecklist.checklists.length > 0) {
    const checklistMaisRecente = viaturaComChecklist.checklists.reduce((mais, atual) =>
      new Date(atual.dataInspeccao) > new Date(mais.dataInspeccao) ? atual : mais,
    );

    const itensProblematicos = checklistMaisRecente.itens.filter(
      (item) => item.estado === 'avaria' || item.estado === 'falta',
    );

    for (const item of itensProblematicos) {
      errors.push(
        `Checklist: item "${item.nome}" está em estado "${item.estado === 'avaria' ? 'avaria' : 'falta'}".`,
      );
    }
  }

  // 3. Verificar conflitos de agenda
  if (atividadesExistentes && atividadesExistentes.length > 0) {
    const conflitos = verificarConflitosAgenda(
      viatura.id,
      'viatura',
      dataInicio,
      dataFim,
      atividadesExistentes,
    );

    for (const conflito of conflitos) {
      errors.push(conflito.descricao);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ------------------------------------------------------------
// validarAlocacaoMotorista
// Requisitos: 7.3, 7.4, 7.7, 7.8, 7.9
// ------------------------------------------------------------

/**
 * Valida se um motorista pode ser alocado a uma atividade.
 *
 * Verificações (por ordem):
 * 1. Carta de condução expirada → bloqueia
 * 2. Motorista indisponível → bloqueia com motivo
 * 3. Conflitos de agenda com atividades existentes → bloqueia
 */
export function validarAlocacaoMotorista(
  motorista: Motorista,
  dataInicio: Date,
  dataFim?: Date,
  atividadesExistentes?: Atividade[],
): ValidationResult {
  const errors: string[] = [];

  // 1. Verificar validade da carta de condução
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const validadeCarta = new Date(motorista.validadeCarta);
  validadeCarta.setHours(0, 0, 0, 0);

  if (validadeCarta < hoje) {
    errors.push(
      `Carta de condução do motorista "${motorista.nomeCompleto}" expirou em ${formatarData(motorista.validadeCarta)}.`,
    );
  }

  // 2. Verificar disponibilidade
  if (!motorista.disponibilidade.disponivel) {
    const motivo = motorista.disponibilidade.motivo
      ? motivoIndisponibilidade(motorista.disponibilidade.motivo)
      : 'motivo não especificado';

    errors.push(
      `Motorista "${motorista.nomeCompleto}" está indisponível: ${motivo}.`,
    );
  }

  // 3. Verificar conflitos de agenda
  if (atividadesExistentes && atividadesExistentes.length > 0) {
    const conflitos = verificarConflitosAgenda(
      motorista.id,
      'motorista',
      dataInicio,
      dataFim,
      atividadesExistentes,
    );

    for (const conflito of conflitos) {
      errors.push(conflito.descricao);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ------------------------------------------------------------
// Utilitários internos
// ------------------------------------------------------------

function tipoDocumentoViatura(
  tipo: import('@/types/transporte').DocumentoViatura['tipo'],
): string {
  const labels: Record<typeof tipo, string> = {
    livrete: 'Livrete',
    inspecao: 'Inspecção',
    seguro: 'Seguro',
    licenca: 'Licença',
    manifesto: 'Manifesto',
    taxa_radio: 'Taxa de Rádio',
    outro: 'Outro',
  };
  return labels[tipo] ?? tipo;
}

function motivoIndisponibilidade(
  motivo: NonNullable<import('@/types/transporte').DisponibilidadeMotorista['motivo']>,
): string {
  const labels: Record<typeof motivo, string> = {
    ferias: 'férias',
    ausencia: 'ausência',
    suspensao: 'suspensão',
    manual: 'indisponibilidade registada manualmente',
    conflito_agenda: 'conflito de agenda',
  };
  return labels[motivo] ?? motivo;
}

function formatarData(data: Date): string {
  return new Date(data).toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
