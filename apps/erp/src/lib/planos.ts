/**
 * Catálogo de planos de subscrição — FONTE ÚNICA de preços e limites (spec 19).
 *
 * CLIENT-SAFE: sem `server-only`, sem imports de Prisma, sem segredos.
 * O site de marketing (spec 18) consome-o via `GET /api/publico/planos` e NUNCA
 * hardcoda preços; a UI de faturação do ERP importa-o directamente.
 *
 * Os identificadores de `Price` do Stripe NÃO vivem aqui: guardamos apenas o
 * **nome** da variável de ambiente que os contém (`stripePriceEnv`), resolvida em
 * runtime só no servidor (`src/server/billing/stripe-client.ts`). Alterar preço
 * ou limites nunca exige migração de schema — só esta constante e o Stripe.
 *
 * Moeda: USD. O Stripe não liquida em MZN; a contabilidade do tenant continua em
 * MZN/Decimal e não regista a factura da própria GestPro (ver ADR-0009).
 */

export const MOEDA_FATURACAO = 'USD' as const;

/** Duração do trial sem cartão, em dias (espelhada em `trial_period_days`). */
export const TRIAL_DIAS = 14;

export type PlanoId = 'BASICO' | 'PROFISSIONAL' | 'EMPRESARIAL';
export type CicloId = 'MENSAL' | 'ANUAL';

export const PLANO_IDS: readonly PlanoId[] = ['BASICO', 'PROFISSIONAL', 'EMPRESARIAL'] as const;
export const CICLO_IDS: readonly CicloId[] = ['MENSAL', 'ANUAL'] as const;

export interface Preco {
  /** Valor na unidade principal da moeda (ex.: 29 = 29 USD). Nunca cêntimos. */
  valor: number;
  moeda: typeof MOEDA_FATURACAO;
}

export interface LimitesPlano {
  utilizadores: number;
  armazens: number;
  documentosMes: number;
  /** -1 = ilimitado. */
  produtos: number;
  suporte: string;
}

export interface Plano {
  id: PlanoId;
  nome: string;
  descricao: string;
  limites: LimitesPlano;
  precoMensal: Preco;
  precoAnual: Preco;
  /** Nome da env var com o Stripe Price ID mensal (nunca o valor). */
  stripePriceIdMensalEnv: string;
  /** Nome da env var com o Stripe Price ID anual (nunca o valor). */
  stripePriceIdAnualEnv: string;
  destaque?: boolean;
}

export const PLANOS: Record<PlanoId, Plano> = {
  BASICO: {
    id: 'BASICO',
    nome: 'Básico',
    descricao: 'Para empresas em arranque que precisam de facturação e stock.',
    limites: {
      utilizadores: 3,
      armazens: 1,
      documentosMes: 200,
      produtos: 500,
      suporte: 'Email (48h)',
    },
    precoMensal: { valor: 29, moeda: MOEDA_FATURACAO },
    precoAnual: { valor: 290, moeda: MOEDA_FATURACAO },
    stripePriceIdMensalEnv: 'STRIPE_PRICE_BASICO_MENSAL',
    stripePriceIdAnualEnv: 'STRIPE_PRICE_BASICO_ANUAL',
  },
  PROFISSIONAL: {
    id: 'PROFISSIONAL',
    nome: 'Profissional',
    descricao: 'Contabilidade PGC-NIRF completa, compras e recursos humanos.',
    limites: {
      utilizadores: 15,
      armazens: 5,
      documentosMes: 2000,
      produtos: -1,
      suporte: 'Email + telefone (24h)',
    },
    precoMensal: { valor: 79, moeda: MOEDA_FATURACAO },
    precoAnual: { valor: 790, moeda: MOEDA_FATURACAO },
    stripePriceIdMensalEnv: 'STRIPE_PRICE_PROFISSIONAL_MENSAL',
    stripePriceIdAnualEnv: 'STRIPE_PRICE_PROFISSIONAL_ANUAL',
    destaque: true,
  },
  EMPRESARIAL: {
    id: 'EMPRESARIAL',
    nome: 'Empresarial',
    descricao: 'Multi-armazém, produção, projectos e apoio dedicado.',
    limites: {
      utilizadores: -1,
      armazens: -1,
      documentosMes: -1,
      produtos: -1,
      suporte: 'Gestor de conta dedicado (4h)',
    },
    precoMensal: { valor: 199, moeda: MOEDA_FATURACAO },
    precoAnual: { valor: 1990, moeda: MOEDA_FATURACAO },
    stripePriceIdMensalEnv: 'STRIPE_PRICE_EMPRESARIAL_MENSAL',
    stripePriceIdAnualEnv: 'STRIPE_PRICE_EMPRESARIAL_ANUAL',
  },
};

/** `true` se `id` é um plano conhecido (revalidação server-side do input). */
export function isPlanoId(id: string): id is PlanoId {
  return (PLANO_IDS as readonly string[]).includes(id);
}

export function isCicloId(id: string): id is CicloId {
  return (CICLO_IDS as readonly string[]).includes(id);
}

/** Preço do plano no ciclo pedido. */
export function precoDoPlano(planoId: PlanoId, ciclo: CicloId): Preco {
  const plano = PLANOS[planoId];
  return ciclo === 'ANUAL' ? plano.precoAnual : plano.precoMensal;
}

/** Nome da env var do Stripe Price para (plano, ciclo). Nunca devolve o segredo. */
export function nomeEnvPrice(planoId: PlanoId, ciclo: CicloId): string {
  const plano = PLANOS[planoId];
  return ciclo === 'ANUAL' ? plano.stripePriceIdAnualEnv : plano.stripePriceIdMensalEnv;
}

/**
 * Payload público do catálogo (contrato com o spec 18 —
 * `docs/handoff/site-provisionamento.md` §1). Não expõe nomes de env vars.
 */
export interface PlanoPublico {
  id: PlanoId;
  nome: string;
  descricao: string;
  limites: LimitesPlano;
  precoMensal: Preco;
  precoAnual: Preco;
  destaque: boolean;
}

export function catalogoPublico(): { planos: PlanoPublico[]; trialDias: number } {
  return {
    trialDias: TRIAL_DIAS,
    planos: PLANO_IDS.map((id) => {
      const p = PLANOS[id];
      return {
        id: p.id,
        nome: p.nome,
        descricao: p.descricao,
        limites: p.limites,
        precoMensal: p.precoMensal,
        precoAnual: p.precoAnual,
        destaque: p.destaque ?? false,
      };
    }),
  };
}
