// Tipos serializados (Decimal→string, Date→ISO) que atravessam a fronteira
// Server→Client no ecrã de reconciliação (ADR-0038). Módulo neutro: sem
// 'use client' nem 'server-only', para os dois lados o poderem importar.

export type Natureza = 'DEBITO' | 'CREDITO';
export type Lado = 'BANCO' | 'CONTABILIDADE';

export interface MovimentoLinha {
  id: string;
  lado: Lado;
  /** ISO. */
  data: string;
  referencia: string | null;
  descricao: string;
  valor: string;
  natureza: Natureza;
  estado: string;
  correspondenciaId: string | null;
}

export interface SugestaoLinha {
  id: string;
  tipo: string;
  regra: string;
  confianca: number;
  diferencaValor: string;
  diferencaDias: number;
  /** Diferença de valor acima da tolerância da conta — só confirma com justificação. */
  exigeJustificacao: boolean;
  banco: MovimentoLinha[];
  contabilidade: MovimentoLinha[];
}

export const REGRA_LABEL: Record<string, string> = {
  REFERENCIA_EXACTA: 'Referência exacta',
  REFERENCIA_NORMALIZADA: 'Referência normalizada',
  DOCUMENTO: 'Número do documento',
  VALOR_NATUREZA_DATA: 'Valor, natureza e data',
  VALOR_TOLERANCIA: 'Valor com tolerância',
  DESCRICAO: 'Descrição',
  MANUAL: 'Manual',
};
