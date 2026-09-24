/**
 * Nota de débito — regras puras e CLIENT-SAFE (ADR-0039). Usadas pelo
 * provisionamento, pelos serviços e, no nó UI, pelos formulários.
 */
import type { NaturezaNotaDebito } from '@prisma/client';

export const NATUREZAS_NOTA_DEBITO = [
  'ACERTO_PRECO',
  'JUROS_MORA',
  'DESPESAS_REPERCUTIDAS',
  'PENALIZACAO',
  'OUTRO',
] as const satisfies readonly NaturezaNotaDebito[];

/**
 * Conta de crédito por omissão, por código PGC-NIRF (ADR-0039 §1, decisão M4).
 * DESPESAS_REPERCUTIDAS e OUTRO não têm omissão: a conta escolhe-se no acto.
 * A migração `0039_nota_debito_modelo` repete estes códigos em SQL para os
 * tenants que já existiam — alterar um é alterar os dois.
 */
export const CONTA_PADRAO_NATUREZA_ND = {
  ACERTO_PRECO: '711', // Vendas — o preço facturado estava abaixo do acordado
  JUROS_MORA: '781', // Juros obtidos — rendimento financeiro, não volume de negócios
  PENALIZACAO: '769', // Outros rendimentos alheios ao valor acrescentado — operacional
} as const satisfies Partial<Record<NaturezaNotaDebito, string>>;

/**
 * Classe PGC que a conta de crédito de uma natureza pode ter. Uma despesa
 * repercutida credita o gasto que a originou (recuperação, não venda); todas
 * as outras naturezas creditam rendimento.
 */
export function classeAdmitidaParaNatureza(natureza: NaturezaNotaDebito): 'CLASSE_6' | 'CLASSE_7' {
  return natureza === 'DESPESAS_REPERCUTIDAS' ? 'CLASSE_6' : 'CLASSE_7';
}

/**
 * Linha de documento fiscal com IVA a zero sem motivo de isenção/não sujeição
 * (ADR-0039 §4). Só a regra; ligá-la às emissões é do nó contabilizacao/ui.
 */
export function motivoIsencaoEmFalta(linha: {
  taxaIva: number | string | { isZero(): boolean };
  motivoIsencao?: string | null;
}): boolean {
  const t = linha.taxaIva;
  const taxaZero = typeof t === 'object' ? t.isZero() : Number(t) === 0;
  return taxaZero && !linha.motivoIsencao?.trim();
}
