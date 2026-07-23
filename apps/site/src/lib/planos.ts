import { z } from "zod";
import { ENDPOINT_PLANOS } from "./env";

/**
 * Catálogo de planos — CLIENTE do contrato do spec 19.
 *
 * O site **nunca** define preços: lê-os de `GET /api/publico/planos`, servido
 * pela plataforma de onboarding (spec 19, dono do contrato). Nenhum componente
 * pode conter um valor monetário — ver `scripts/gate-cores-hardcoded.mjs` e o
 * teste `__tests__/planos.test.ts`.
 *
 * Contrato congelado em `docs/handoff/execucao-paralela-18-19.md`:
 *
 *   GET /api/publico/planos
 *     → 200 { planos: [{ id, nome, limites,
 *                        precoMensal: { valor, moeda },
 *                        precoAnual:  { valor, moeda } }] }
 *
 * Enquanto o endpoint não existir, `obterPlanos()` degrada para o catálogo de
 * demonstração (`PLANOS_DEMONSTRACAO`) e assinala `origem: "demonstracao"`,
 * para a página avisar que os valores são indicativos.
 */

export const IDS_PLANO = ["BASICO", "PROFISSIONAL", "EMPRESARIAL"] as const;
export type IdPlano = (typeof IDS_PLANO)[number];

/** Preço tolerante à serialização: `Decimal` chega como string, mas aceita número. */
const precoSchema = z.object({
  valor: z.union([z.string(), z.number()]).transform((v) => String(v)),
  moeda: z.string().min(3).max(3),
});

const planoSchema = z.object({
  id: z.enum(IDS_PLANO),
  nome: z.string().min(1),
  descricao: z.string().optional(),
  limites: z
    .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .default({}),
  funcionalidades: z.array(z.string()).default([]),
  destaque: z.boolean().default(false),
  precoMensal: precoSchema,
  precoAnual: precoSchema,
});

const respostaSchema = z.object({
  planos: z.array(planoSchema).min(1),
});

export type Preco = z.infer<typeof precoSchema>;
export type Plano = z.infer<typeof planoSchema>;

export type OrigemCatalogo = "plataforma" | "demonstracao";

export interface Catalogo {
  planos: Plano[];
  origem: OrigemCatalogo;
}

/**
 * Catálogo de demonstração — usado só quando o endpoint do spec 19 ainda não
 * responde. Fica isolado neste módulo (e nunca importado por componentes) para
 * que a origem dos valores seja sempre explícita na UI. Ver ADR-0009: a
 * subscrição é cobrada em USD porque o processador não liquida em MZN.
 *
 * TODO(spec 19): remover quando `GET /api/publico/planos` estiver disponível
 * em todos os ambientes.
 */
export const PLANOS_DEMONSTRACAO: Plano[] = [
  {
    id: "BASICO",
    nome: "Básico",
    descricao: "Para quem está a arrancar e precisa de facturar em condições.",
    limites: {
      utilizadores: 3,
      armazens: 1,
      documentosPorMes: 500,
      empresas: 1,
    },
    funcionalidades: [
      "Vendas e facturação",
      "Stock num armazém",
      "Caixa e contas correntes",
      "Contabilidade PGC-NIRF",
    ],
    destaque: false,
    precoMensal: { valor: "29", moeda: "USD" },
    precoAnual: { valor: "290", moeda: "USD" },
  },
  {
    id: "PROFISSIONAL",
    nome: "Profissional",
    descricao: "Para operações com equipa, armazéns e compras a sério.",
    limites: {
      utilizadores: 15,
      armazens: 5,
      documentosPorMes: 5000,
      empresas: 1,
    },
    funcionalidades: [
      "Tudo o do plano Básico",
      "Compras com circuito de aprovação",
      "Multi-armazém e inventários",
      "Recursos humanos e processamento salarial",
      "Ponto de venda (POS)",
    ],
    destaque: true,
    precoMensal: { valor: "79", moeda: "USD" },
    precoAnual: { valor: "790", moeda: "USD" },
  },
  {
    id: "EMPRESARIAL",
    nome: "Empresarial",
    descricao: "Para grupos com várias empresas e operação complexa.",
    limites: {
      utilizadores: null,
      armazens: null,
      documentosPorMes: null,
      empresas: null,
    },
    funcionalidades: [
      "Tudo o do plano Profissional",
      "Empresas ilimitadas no mesmo grupo",
      "Projectos, obras e produção",
      "Relatórios e exportações avançadas",
      "Apoio prioritário",
    ],
    destaque: false,
    precoMensal: { valor: "199", moeda: "USD" },
    precoAnual: { valor: "1990", moeda: "USD" },
  },
];

/** Segundos de ISR do catálogo — mudanças de preço propagam sem rebuild. */
export const REVALIDACAO_PLANOS = 300;

/**
 * Lê o catálogo de planos. Nunca lança: qualquer falha (rede, 5xx, payload
 * inválido) degrada para o catálogo de demonstração, porque uma página de
 * preços em branco é pior do que uma página de preços assinalada como
 * indicativa (Requisito 10.2 — degradar, nunca expor o erro do backend).
 */
export async function obterPlanos(): Promise<Catalogo> {
  try {
    const resposta = await fetch(ENDPOINT_PLANOS, {
      headers: { Accept: "application/json" },
      next: { revalidate: REVALIDACAO_PLANOS, tags: ["planos"] },
    });

    if (!resposta.ok) {
      return { planos: PLANOS_DEMONSTRACAO, origem: "demonstracao" };
    }

    const corpo: unknown = await resposta.json();
    const validado = respostaSchema.safeParse(corpo);
    if (!validado.success) {
      return { planos: PLANOS_DEMONSTRACAO, origem: "demonstracao" };
    }

    return { planos: ordenar(validado.data.planos), origem: "plataforma" };
  } catch {
    return { planos: PLANOS_DEMONSTRACAO, origem: "demonstracao" };
  }
}

/** Ordena pela progressão comercial dos planos, independente da ordem da API. */
export function ordenar(planos: Plano[]): Plano[] {
  return [...planos].sort(
    (a, b) => IDS_PLANO.indexOf(a.id) - IDS_PLANO.indexOf(b.id)
  );
}

/**
 * Formata um preço para apresentação. Usa `Intl.NumberFormat` com a moeda que
 * vem da API — o site não assume moeda nenhuma.
 */
export function formatarPreco(preco: Preco, locale = "pt-MZ"): string {
  const numero = Number(preco.valor);
  if (!Number.isFinite(numero)) return `${preco.valor} ${preco.moeda}`;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: preco.moeda,
    maximumFractionDigits: Number.isInteger(numero) ? 0 : 2,
  }).format(numero);
}

/** Poupança percentual do ciclo anual face a 12 mensalidades (0 se não houver). */
export function poupancaAnual(plano: Plano): number {
  const mensal = Number(plano.precoMensal.valor);
  const anual = Number(plano.precoAnual.valor);
  if (!Number.isFinite(mensal) || !Number.isFinite(anual) || mensal <= 0) {
    return 0;
  }
  const total = mensal * 12;
  if (anual >= total) return 0;
  return Math.round(((total - anual) / total) * 100);
}
