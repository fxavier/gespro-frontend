/**
 * Rótulos da configuração da DFC — módulo NEUTRO (nem `'use client'` nem
 * `server-only`): serve os Server Components das páginas e os formulários
 * cliente. Constantes num módulo `'use client'` chegariam ao servidor como
 * referências de cliente (CLAUDE.md, «Fronteira 'use client' no servidor»).
 */
import type { AtividadeFluxo, SinalFluxo } from '@/lib/validations/fluxo-caixa';

export const ROTA_RUBRICAS = '/contabilidade/fluxo-caixa/rubricas';

export const ROTULO_ATIVIDADE: Record<AtividadeFluxo, string> = {
  OPERACIONAL: 'Actividades operacionais',
  INVESTIMENTO: 'Actividades de investimento',
  FINANCIAMENTO: 'Actividades de financiamento',
  CAIXA: 'Caixa e equivalentes de caixa',
};

/** As actividades que um utilizador pode escolher: `CAIXA` é única e semeada (E2). */
export const ATIVIDADES_ESCOLHIVEIS = ['OPERACIONAL', 'INVESTIMENTO', 'FINANCIAMENTO'] as const;

export const ROTULO_SINAL: Record<SinalFluxo, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  VARIACAO: 'Variação',
};

export const SINAIS = ['ENTRADA', 'SAIDA', 'VARIACAO'] as const;

export const BREADCRUMBS_BASE = [
  { label: 'Contabilidade', href: '/contabilidade' },
  { label: 'Fluxos de Caixa', href: '/contabilidade/dfc' },
  { label: 'Rubricas', href: ROTA_RUBRICAS },
];
