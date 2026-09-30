/**
 * Utilitários de vigência para tabelas INSS/IRPS — client-safe (sem server-only).
 *
 * AC5/D1: inicioDeVigencia(ano, mes) produz 'aaaa-mm-01', que z.coerce.date
 * interpreta como meia-noite UTC — igual a Date.UTC(ano, mes-1, 1). Assim a
 * vigência criada pelo formulário coincide com a dataReferência que
 * obterTabelasVigentes usa para resolver o mês M.
 *
 * D2: taxas introduzidas em % e convertidas para fracção antes da action.
 */

/** Devolve 'aaaa-mm-01' para o primeiro dia do mês indicado (mes: 1-12). */
export function inicioDeVigencia(ano: number, mes: number): string {
  const mm = String(mes).padStart(2, '0');
  return `${ano}-${mm}-01`;
}

/**
 * Converte uma percentagem para fracção sem ruído de vírgula flutuante.
 * Ex.: 3 → 0.03, 4.5 → 0.045
 */
export function percentagemParaFraccao(p: number): number {
  // Arredonda a 6 casas decimais para eliminar ruído de ponto flutuante.
  return Math.round(p * 10_000) / 1_000_000;
}

/**
 * Converte uma fracção para percentagem sem ruído de vírgula flutuante.
 * Ex.: 0.03 → 3, 0.32 → 32
 */
export function fraccaoParaPercentagem(f: number): number {
  // Arredonda a 6 casas decimais para eliminar ruído de ponto flutuante.
  return Math.round(f * 1_000_000) / 10_000;
}

/**
 * D6: Parser estrito de decimal em português para campos monetários.
 *
 * Aceita apenas /^\d+([.,]\d{1,2})?$/ (sem separador de milhares, sem
 * notação científica, sem negativos). Remove espaços (incluindo internos)
 * antes de validar — «1 000,50» é aceite como 1000.50.
 *
 * Devolve null para qualquer input inválido (incluindo string vazia).
 */
export function parseDecimalPt(s: string): number | null {
  const cleaned = s.replace(/\s/g, '');
  if (!/^\d+([.,]\d{1,2})?$/.test(cleaned)) return null;
  return parseFloat(cleaned.replace(',', '.'));
}
