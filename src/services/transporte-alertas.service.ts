// ============================================================
// Serviço de Alertas — Módulo de Transportes e Logística
// Funções puras de geração de alertas: sem estado interno, sem HTTP
// ============================================================

import type { ManutencaoViatura, Motorista, Viatura } from '@/types/transporte';

// ------------------------------------------------------------
// Interface Alerta
// Requisitos: 11.5
// ------------------------------------------------------------

export interface Alerta {
  id: string;
  tipo:
    | 'documento_expirado'
    | 'documento_proximo_expirar'
    | 'manutencao_pendente'
    | 'conflito_alocacao';
  urgencia: 'critico' | 'aviso' | 'info';
  entidade: 'viatura' | 'motorista';
  entidadeId: string;
  entidadeNome: string;
  descricao: string;
  dataAlerta: Date;
}

// ------------------------------------------------------------
// gerarAlertasDocumentos
// Requisitos: 1.2, 1.5, 1.6, 11.1
// ------------------------------------------------------------

/**
 * Gera alertas de expiração de documentos para viaturas e motoristas.
 *
 * - Documentos com `estado === 'expirado'`        → urgencia: 'critico'
 * - Documentos com `estado === 'proximo_expirar'` → urgencia: 'aviso'
 * - Documentos com `estado === 'valido'`          → sem alerta
 */
export function gerarAlertasDocumentos(
  viaturas: Viatura[],
  motoristas: Motorista[],
): Alerta[] {
  const alertas: Alerta[] = [];
  const agora = new Date();

  // Alertas de documentos de viaturas
  for (const viatura of viaturas) {
    for (const doc of viatura.documentos) {
      if (doc.estado === 'valido') continue;

      const urgencia = doc.estado === 'expirado' ? 'critico' : 'aviso';
      const tipoLabel = labelTipoDocumentoViatura(doc.tipo);
      const descricao =
        doc.estado === 'expirado'
          ? `Viatura ${viatura.matricula}: ${tipoLabel} (nº ${doc.numero}) expirou em ${formatarData(doc.dataValidade)}.`
          : `Viatura ${viatura.matricula}: ${tipoLabel} (nº ${doc.numero}) expira em ${formatarData(doc.dataValidade)}.`;

      alertas.push({
        id: `alerta-viat-doc-${viatura.id}-${doc.id}`,
        tipo: doc.estado === 'expirado' ? 'documento_expirado' : 'documento_proximo_expirar',
        urgencia,
        entidade: 'viatura',
        entidadeId: viatura.id,
        entidadeNome: `${viatura.marca} ${viatura.modelo} (${viatura.matricula})`,
        descricao,
        dataAlerta: agora,
      });
    }
  }

  // Alertas de documentos de motoristas
  for (const motorista of motoristas) {
    for (const doc of motorista.documentos) {
      if (doc.estado === 'valido') continue;

      const urgencia = doc.estado === 'expirado' ? 'critico' : 'aviso';
      const tipoLabel = labelTipoDocumentoMotorista(doc.tipo);
      const descricao =
        doc.estado === 'expirado'
          ? `Motorista ${motorista.nomeCompleto}: ${tipoLabel} (nº ${doc.numero}) expirou em ${formatarData(doc.dataValidade)}.`
          : `Motorista ${motorista.nomeCompleto}: ${tipoLabel} (nº ${doc.numero}) expira em ${formatarData(doc.dataValidade)}.`;

      alertas.push({
        id: `alerta-mot-doc-${motorista.id}-${doc.id}`,
        tipo: doc.estado === 'expirado' ? 'documento_expirado' : 'documento_proximo_expirar',
        urgencia,
        entidade: 'motorista',
        entidadeId: motorista.id,
        entidadeNome: motorista.nomeCompleto,
        descricao,
        dataAlerta: agora,
      });
    }
  }

  return alertas;
}

// ------------------------------------------------------------
// gerarAlertasManutencao
// Requisitos: 4.4, 11.2
// ------------------------------------------------------------

/**
 * Gera alertas de manutenção preventiva em atraso.
 *
 * Gera um alerta para cada `ManutencaoViatura` do tipo `'preventiva'` que tenha
 * `proximaManutencaoPrevista.data` definida e essa data seja igual ou anterior à data actual.
 *
 * A viatura correspondente é procurada no array `viaturas` para enriquecer o alerta
 * com a matrícula e nome. Se a viatura não for encontrada, o alerta é gerado na mesma
 * com o `viaturaId` como nome de fallback.
 */
export function gerarAlertasManutencao(
  viaturas: Viatura[],
  manutencoes: ManutencaoViatura[],
): Alerta[] {
  const alertas: Alerta[] = [];
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // Índice de viaturas por id para lookup O(1)
  const viaturasPorId = new Map<string, Viatura>(
    viaturas.map((v) => [v.id, v]),
  );

  for (const manutencao of manutencoes) {
    // Apenas manutenções preventivas com próxima data definida
    if (manutencao.tipo !== 'preventiva') continue;
    if (!manutencao.proximaManutencaoPrevista?.data) continue;

    const proximaData = new Date(manutencao.proximaManutencaoPrevista.data);
    proximaData.setHours(0, 0, 0, 0);

    // Alerta quando a data de próxima manutenção foi atingida ou ultrapassada
    if (proximaData > hoje) continue;

    const viatura = viaturasPorId.get(manutencao.viaturaId);
    const entidadeNome = viatura
      ? `${viatura.marca} ${viatura.modelo} (${viatura.matricula})`
      : manutencao.viaturaId;

    const descricao = viatura
      ? `Viatura ${viatura.matricula}: manutenção preventiva prevista para ${formatarData(proximaData)} está em atraso.`
      : `Viatura ${manutencao.viaturaId}: manutenção preventiva prevista para ${formatarData(proximaData)} está em atraso.`;

    alertas.push({
      id: `alerta-manut-${manutencao.id}`,
      tipo: 'manutencao_pendente',
      urgencia: 'aviso',
      entidade: 'viatura',
      entidadeId: manutencao.viaturaId,
      entidadeNome,
      descricao,
      dataAlerta: new Date(),
    });
  }

  return alertas;
}

// ------------------------------------------------------------
// Utilitários internos
// ------------------------------------------------------------

function labelTipoDocumentoViatura(
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

function labelTipoDocumentoMotorista(
  tipo: import('@/types/transporte').DocumentoMotorista['tipo'],
): string {
  const labels: Record<typeof tipo, string> = {
    carta_conducao: 'Carta de Condução',
    bi: 'Bilhete de Identidade',
    outro: 'Outro',
  };
  return labels[tipo] ?? tipo;
}

function formatarData(data: Date): string {
  return new Date(data).toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
