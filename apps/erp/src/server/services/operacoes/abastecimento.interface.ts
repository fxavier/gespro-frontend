// Interface — Serviço de Abastecimento (WS F)
// Registo e consulta de abastecimentos de combustível.
// Wave 1: tipos e assinaturas; implementação na Wave 2.
//
// Sem máquina de estado: abastecimentos são append-only (imutáveis após registo).
// Correcções via novo registo compensatório com flag `tipo = 'CORRECAO'`.

import 'server-only';
import type { Ctx, PaginatedResult } from '@/server/services/types';
import type {
  RegistarAbastecimentoInput,
  FiltrarAbastecimentosInput,
} from '@/lib/validations/transporte';

// ============================================================
// Shapes de retorno
// ============================================================

export interface AbastecimentoResumo {
  id: string;
  tenantId: string;
  viaturaId: string;
  motoristaId: string;
  data: Date;
  kmVeiculo: number;
  tipoCombustivel: string;
  /** Decimal serializado como string */
  litros: string;
  valorLitro: string;
  valorTotal: string;
  posto: string | null;
  notaFiscal: string | null;
  kmPercorrido: number | null;
  consumoMedio: string | null;
  rotaId: string | null;
  createdAt: Date;
}

export interface EficienciaViatura {
  viaturaId: string;
  /** Consumo médio em km/l — Decimal serializado */
  consumoMedioKmL: string;
  /** Custo total de combustível no período — Decimal serializado */
  custoTotalCombustivel: string;
  totalAbastecimentos: number;
  totalLitros: string;
  totalKm: number;
}

// ============================================================
// Contrato do serviço (implementado na Wave 2)
// ============================================================

export interface IAbastecimentoService {
  /**
   * Regista um abastecimento. Imutável após persistência.
   * Valida consistência valorTotal ≈ litros × valorLitro (tolerância €0.10).
   * Calcula consumoMedio se kmPercorrido estiver disponível.
   * Lança BusinessRuleError('ABASTECIMENTO_VALOR_INCONSISTENTE') se validação falhar.
   */
  registarAbastecimento(
    input: RegistarAbastecimentoInput,
    ctx: Ctx,
  ): Promise<AbastecimentoResumo>;

  obterAbastecimento(id: string, ctx: Ctx): Promise<AbastecimentoResumo>;

  listarAbastecimentos(
    filtros: FiltrarAbastecimentosInput,
    ctx: Ctx,
  ): Promise<PaginatedResult<AbastecimentoResumo>>;

  /**
   * Calcula indicadores de eficiência por viatura no período.
   * Chamado pelo dashboard de combustível.
   */
  calcularEficiencia(
    viaturaId: string,
    dataInicio: Date,
    dataFim: Date,
    ctx: Ctx,
  ): Promise<EficienciaViatura>;

  /**
   * Agrega custos de combustível de uma rota específica.
   * Usado no apuramento do custo real da Rota.
   */
  custosPorRota(rotaId: string, ctx: Ctx): Promise<{ total: string; litros: string }>;
}
