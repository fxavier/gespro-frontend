/**
 * Planos de subscrição — só o que é CLIENT-SAFE e não é catálogo (spec 19, ADR-0049 §1).
 *
 * O catálogo (nome, preços, limites, funcionalidades, Price IDs) vive na tabela global `Plano`
 * e lê-se pelo serviço `server-only` `src/server/services/plataforma/plano.service.ts`. Os
 * Client Components recebem os planos por props do Server Component que os leu — nunca
 * importam o serviço.
 *
 * Moeda: USD. O Stripe não liquida em MZN; a contabilidade do tenant continua em
 * MZN/Decimal e não regista a factura da própria GestPro (ver ADR-0009).
 */

export const MOEDA_FATURACAO = 'USD' as const;

/** Duração do trial sem cartão, em dias (espelhada em `trial_period_days`). */
export const TRIAL_DIAS = 14;

/** Código de um `Plano` (ex.: `PROFISSIONAL`). Validado contra a tabela no servidor. */
export type PlanoId = string;
export type CicloId = 'MENSAL' | 'ANUAL';

export const CICLO_IDS: readonly CicloId[] = ['MENSAL', 'ANUAL'] as const;

export interface Preco {
  /** Valor na unidade principal da moeda (ex.: 29 = 29 USD). Nunca cêntimos. */
  valor: number;
  moeda: typeof MOEDA_FATURACAO;
}

/**
 * Só entra aqui o que o produto VERIFICA (ADR-0027 §2). Um número publicado
 * que ninguém aplica não é um limite, é uma promessa.
 */
export interface LimitesPlano {
  /** -1 = ilimitado. */
  utilizadores: number;
  /** -1 = ilimitado. Conta Localizações de tipo ARMAZEM, activas. */
  armazens: number;
  suporte: string;
}

/**
 * Payload público de um plano (contrato com o spec 18 —
 * `docs/handoff/site-provisionamento.md` §1). Não expõe Price IDs nem nomes de env vars.
 */
export interface PlanoPublico {
  id: PlanoId;
  nome: string;
  descricao: string;
  limites: LimitesPlano;
  precoMensal: Preco;
  precoAnual: Preco;
  destaque: boolean;
  /** Texto mostrado ao cliente, por ordem. Não liga nem desliga módulo nenhum. */
  funcionalidades: string[];
}
