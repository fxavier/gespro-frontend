// Interface do serviço de Amortização (WS A — Wave 1 contrato)
import 'server-only';

import type { GerarPlanoAmortizacaoInput } from '@/lib/validations/inventario-ativos';
import type { Ctx, TxClient } from './types';

// ─── Tipos de retorno ─────────────────────────────────────────────────────────

export interface AmortizacaoCalculoDto {
  id: string;
  tenantId: string;
  ativoId: string;
  ano: number;
  mes: number;
  valorInicial: string;       // Decimal
  valorResidual: string;
  vidaUtilAnos: number;
  valorAmortizacaoMensal: string;
  valorAmortizadoAcumulado: string;
  valorLiquidoContabilistico: string;
  metodoAmortizacao: string;
  contaDebitoId: string | null;
  contaCreditoId: string | null;
  lancamentoContabilId: string | null;
  processadoPor: string;
  processadoEm: Date;
  createdAt: Date;
}

export interface PlanoAmortizacaoDto {
  ativoId: string;
  totalMeses: number;
  totalAmortizacao: string;   // Decimal
  linhas: AmortizacaoCalculoDto[];
}

// ─── Interface do serviço ─────────────────────────────────────────────────────

export interface IAmortizacaoService {
  /**
   * Gera o plano de amortização completo para um ativo (sem persistir).
   * Utilizado para preview antes de confirmar.
   */
  calcularPlano(
    input: GerarPlanoAmortizacaoInput,
    ctx: Ctx,
  ): Promise<PlanoAmortizacaoDto>;

  /**
   * Processa a amortização do mês corrente para um ativo.
   * Persiste AmortizacaoCalculo e, opcionalmente, delega lançamento contabilístico
   * ao WS D via contrato registarLancamentoContabilistico(tx, doc).
   * Lança BusinessRuleError('AMORTIZACAO_JA_CALCULADA') se o período já existe.
   */
  processarAmortizacaoMensal(
    ativoId: string,
    ano: number,
    mes: number,
    ctx: Ctx,
    tx?: TxClient,
  ): Promise<AmortizacaoCalculoDto>;

  /**
   * Processa a amortização mensal de TODOS os ativos em EM_USO do tenant.
   * Usado pelo job mensal de amortização.
   * Retorna sumário com totais e eventuais erros por ativo.
   */
  processarAmortizacaoTenant(
    ano: number,
    mes: number,
    ctx: Ctx,
  ): Promise<{ processados: number; erros: { ativoId: string; erro: string }[] }>;

  /**
   * Historico de amortizações de um ativo.
   */
  listarAmortizacoes(
    ativoId: string,
    ctx: Ctx,
  ): Promise<AmortizacaoCalculoDto[]>;

  /**
   * Regista o abate de um ativo:
   * 1. Muda estado para BAIXADO.
   * 2. Gera lançamento contabilístico do abate (ganho/perda na alienação) via WS D.
   * Lança BusinessRuleError('ATIVO_EM_USO') se estado não permite abate.
   */
  registarAbate(
    ativoId: string,
    opts: {
      motivo: string;
      valorRealizado?: number;
      contaDebitoId?: string;
      contaCreditoId?: string;
    },
    ctx: Ctx,
    tx?: TxClient,
  ): Promise<void>;
}
