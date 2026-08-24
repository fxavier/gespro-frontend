/**
 * Utilitários de normalização de rotas para métricas (ADR-0019 §2 — B2 fix).
 *
 * REGRA DE CARDINALIDADE:
 *   A etiqueta `route` do Prometheus NÃO deve conter valores concretos de IDs,
 *   slugs, UUIDs ou outros valores de params dinâmicos.
 *   Cada valor único criaria uma nova série — /api/faturacao/<id>/pdf com 10.000
 *   facturas = 10.000 séries distintas, violando o ADR-0019 §2 e destruindo o Prometheus.
 *
 *   `normalizeRoute` garante que /api/faturacao/clj123abc/pdf e
 *   /api/faturacao/clj456def/pdf produzem a MESMA etiqueta route: /api/faturacao/[id]/pdf.
 */

/**
 * Normaliza uma rota dinâmica substituindo os valores concretos dos params
 * pelos nomes dos placeholders entre parênteses rectos.
 *
 * @param pathname  Pathname cru do pedido (ex.: /api/faturacao/clj123abc/pdf)
 * @param params    Params resolvidos pelo Next.js (ex.: { id: 'clj123abc' })
 * @returns         Pathname normalizado (ex.: /api/faturacao/[id]/pdf)
 *
 * Exemplos:
 *   /api/faturacao/clj123/pdf          + {id:'clj123'}         → /api/faturacao/[id]/pdf
 *   /api/documentos/local/a/b/c        + {key:['a','b','c']}   → /api/documentos/local/[...key]
 *   /api/rh/payroll/pid/recibo         + {id:'pid'}             → /api/rh/payroll/[id]/recibo
 *   /api/health                        + {}                     → /api/health
 */
export function normalizeRoute(pathname: string, params: Record<string, string | string[]>): string {
  // Comparação segmento-a-segmento (NIT fix): a implementação anterior usava
  // String.prototype.includes() + replace(), que substitui substrings sem verificar
  // fronteiras de segmento. Exemplo do problema:
  //   pathname = '/api/test123/data', params = {id: 'test'}
  //   includes('test') = true → replace produzia '/api/[id]123/data' — ERRADO.
  // Com split('/'), cada segmento é comparado por igualdade estrita, sem risco de
  // correspondência parcial.
  const segments = pathname.split('/');

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      // Catch-all: [...key] — o valor é um array de segmentos consecutivos.
      // Procura a janela de segmentos que corresponde ao array completo.
      const valueLen = value.length;
      for (let i = 0; i <= segments.length - valueLen; i++) {
        if (value.every((v, j) => segments[i + j] === v)) {
          segments.splice(i, valueLen, `[...${key}]`);
          break;
        }
      }
    } else if (value) {
      // Param simples: encontra o primeiro segmento que é exactamente igual ao valor.
      const idx = segments.findIndex((s) => s === value);
      if (idx !== -1) {
        segments[idx] = `[${key}]`;
      }
    }
  }

  return segments.join('/');
}
