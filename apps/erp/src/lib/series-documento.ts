/**
 * Núcleo puro das séries de documento (#149, ticket 3).
 *
 * Client-safe de propósito: o ecrã de séries pré-visualiza o próximo número com
 * a MESMA função que `proximoNumeroSerie` usa para o emitir — a pré-visualização
 * não pode divergir do número que sai no documento.
 */
import { formatarDiaIso } from '@/lib/format-date';

/** S4 — formato fixo de toda a série criada pela UI. */
export const FORMATO_NUMERO_SERIE = '{prefixo}/{ano}/{numero:06}';

/** Rótulos pt-PT dos tipos de série que o ecrã gere. */
export const ROTULO_TIPO_SERIE: Record<string, string> = {
  FATURA: 'Factura',
  NOTA_CREDITO: 'Nota de Crédito',
  NOTA_DEBITO: 'Nota de Débito',
  PROFORMA: 'Factura Pró-forma',
  COTACAO_COMERCIAL: 'Cotação',
  RECIBO: 'Recibo',
};

/** Substitui o template de numeração: `{prefixo}/{ano}/{numero:06}`. */
export function formatarNumero(template: string, vars: { prefixo: string; ano: number; numero: number }): string {
  return template
    .replace('{prefixo}', vars.prefixo)
    .replace('{ano}', String(vars.ano))
    .replace(/\{numero(?::(\d+))?\}/, (_, w) => String(vars.numero).padStart(w ? parseInt(w, 10) : 1, '0'));
}

/** O número que a série emitirá a seguir, no formato fixo (S4). */
export function previsualizarNumero(prefixo: string, ano: number, numero: number): string {
  return formatarNumero(FORMATO_NUMERO_SERIE, { prefixo, ano, numero });
}

type Numeracao = { numeroInicial: number; proximoNumero: number };

/** S2 — «usada» ⇔ já numerou pelo menos um documento. */
export function serieUsada(s: Numeracao): boolean {
  return s.proximoNumero > s.numeroInicial;
}

/** S2 — documentos emitidos pela série. */
export function documentosEmitidos(s: Numeracao): number {
  return s.proximoNumero - s.numeroInicial;
}

/**
 * S5 — anos em que se pode criar uma série: o ano civil corrente em
 * Africa/Maputo e o seguinte. O servidor corre em UTC: `getFullYear()` a
 * 31/12 às 22h00 UTC (já 1/1 em Maputo) daria o ano que acabou.
 */
export function anosPermitidos(agora: Date): [number, number] {
  const ano = Number(formatarDiaIso(agora).slice(0, 4));
  return [ano, ano + 1];
}
