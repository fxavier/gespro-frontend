/**
 * Recusa de negócio → campo do formulário de plano onde aparece (#534). Módulo neutro (nem
 * 'use client' nem server-only). O PRICE_ID_DUPLICADO vai para o campo que o servidor indica em
 * `details.campo`; sem ele, nenhum campo — o toast continua a dizer o erro, e nenhum campo é
 * melhor do que o campo errado.
 */

export type CampoErroPlano = 'codigo' | 'stripePriceIdMensal' | 'stripePriceIdAnual';

const CAMPOS_PRICE = new Set<string>(['stripePriceIdMensal', 'stripePriceIdAnual']);

export function campoDoErroPlano(erro: { code: string; details?: unknown }): CampoErroPlano | undefined {
  switch (erro.code) {
    case 'PLANO_CODIGO_INVALIDO':
    case 'PLANO_CODIGO_DUPLICADO':
      return 'codigo';
    case 'PRICE_ID_DUPLICADO': {
      const d = erro.details;
      const campo = d && typeof d === 'object' ? (d as { campo?: unknown }).campo : undefined;
      return typeof campo === 'string' && CAMPOS_PRICE.has(campo) ? (campo as CampoErroPlano) : undefined;
    }
    default:
      return undefined;
  }
}
