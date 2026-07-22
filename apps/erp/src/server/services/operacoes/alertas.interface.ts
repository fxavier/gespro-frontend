// Interface — Serviço de Alertas de Transporte (WS F)
// Porta as funções puras de src/services/transporte-alertas.service.ts para Prisma.
// Wave 1: apenas tipos e assinaturas; implementação na Wave 2.

import 'server-only';

// ============================================================
// Tipo Alerta (actualizado para enums Prisma SCREAMING_SNAKE)
// ============================================================

export interface Alerta {
  id: string;
  tipo:
    | 'DOCUMENTO_EXPIRADO'
    | 'DOCUMENTO_PROXIMO_EXPIRAR'
    | 'MANUTENCAO_PENDENTE'
    | 'CONFLITO_ALOCACAO';
  urgencia: 'CRITICO' | 'AVISO' | 'INFO';
  entidade: 'VIATURA' | 'MOTORISTA';
  entidadeId: string;
  entidadeNome: string;
  descricao: string;
  dataAlerta: Date;
}

// ============================================================
// Shapes de entrada (subconjuntos de modelos Prisma)
// ============================================================

export interface ViaturaComDocumentos {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  documentos: Array<{
    id: string;
    tipo: string;
    numero: string;
    dataValidade: Date;
    estado: 'VALIDO' | 'PROXIMO_EXPIRAR' | 'EXPIRADO';
  }>;
}

export interface MotoristaComDocumentos {
  id: string;
  nomeCompleto: string;
  documentos: Array<{
    id: string;
    tipo: string;
    numero: string;
    dataValidade: Date;
    estado: 'VALIDO' | 'PROXIMO_EXPIRAR' | 'EXPIRADO';
  }>;
}

export interface ManutencaoViaturaRef {
  id: string;
  viaturaId: string;
  tipo: 'PREVENTIVA' | 'CORRECTIVA';
  proximaManutencaoData: Date | null;
}

// ============================================================
// Tipos de função (assinaturas — property-test-ready)
// ============================================================

/**
 * Gera alertas de expiração de documentos para viaturas e motoristas.
 *
 * - Estado EXPIRADO → urgencia CRITICO
 * - Estado PROXIMO_EXPIRAR → urgencia AVISO
 * - Estado VALIDO → sem alerta
 *
 * Pure function — property-test-ready (conflito #20).
 */
export type GerarAlertasDocumentosFn = (
  viaturas: ViaturaComDocumentos[],
  motoristas: MotoristaComDocumentos[],
) => Alerta[];

/**
 * Gera alertas de manutenção preventiva em atraso.
 * Alerta gerado quando proximaManutencaoData ≤ hoje.
 *
 * Pure function — property-test-ready.
 */
export type GerarAlertasManutencaoFn = (
  viaturas: ViaturaComDocumentos[],
  manutencoes: ManutencaoViaturaRef[],
) => Alerta[];

/**
 * Recalcula o estado de todos os documentos do tenant e persiste as alterações.
 * Chamado pelo job /api/cron/transporte-alertas (F3) — tem efeito de lado (DB).
 */
export type RecalcularEstadosDocumentosFn = (ctx: {
  tenantId: string;
}) => Promise<{ viaturasActualizadas: number; motoistasActualizados: number }>;

/** Contrato do serviço de alertas (implementado na Wave 2). */
export interface IAlertasService {
  gerarAlertasDocumentos: GerarAlertasDocumentosFn;
  gerarAlertasManutencao: GerarAlertasManutencaoFn;
  recalcularEstadosDocumentos: RecalcularEstadosDocumentosFn;
}
