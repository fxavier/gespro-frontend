/**
 * #165 — que botão o detalhe de BOM/roteiro mostra, lido do mapa de transições do serviço:
 * em ATIVO, «Desactivar» se o mapa permite INATIVO; noutro estado, «Activar» se permite ATIVO.
 * (RASCUNHO → INATIVO existe na BOM, mas desactivar um rascunho não é o que o botão oferece.)
 */
export function alvoActivarDesactivar(
  transicoes: Record<string, string[]>,
  status: string,
): 'ATIVO' | 'INATIVO' | null {
  const permitidas = transicoes[status] ?? [];
  if (status === 'ATIVO') return permitidas.includes('INATIVO') ? 'INATIVO' : null;
  return permitidas.includes('ATIVO') ? 'ATIVO' : null;
}
