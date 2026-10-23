import 'server-only';

/**
 * O IP de quem fez o pedido, para as chaves dos limitadores (#552).
 *
 * Cada proxy ACRESCENTA ao fim do `X-Forwarded-For` o endereço de quem lhe
 * ligou; o que está à esquerda veio do cliente e é forjável. Por isso lê-se
 * pela DIREITA, descontando os `TRUSTED_PROXY_HOPS` proxies nossos: o valor
 * escrito pelo proxy de confiança mais exterior é o cliente.
 *
 * Omissão 1: na AWS o App Runner (Envoy) acrescenta o IP do par; na pilha local
 * o Caddy sobrepõe o cabeçalho com o IP do par; sem proxy, o próprio Next só o
 * preenche (com o IP do socket) quando vem vazio. Os três dão um salto.
 * Um CDN à frente do App Runner passa a dois.
 *
 * `x-real-ip` só sem `X-Forwarded-For`: atrás do App Runner o XFF existe
 * sempre, e quem chega à app directamente forja os dois de igual modo.
 * Com 0 saltos nenhum cabeçalho é de confiança — `'unknown'` (balde único).
 */
export function saltosDeConfianca(valor = process.env.TRUSTED_PROXY_HOPS): number {
  const v = valor?.trim();
  if (!v) return 1;
  if (!/^\d+$/.test(v)) {
    throw new Error(`TRUSTED_PROXY_HOPS inválido: "${valor}" (inteiro ≥ 0; omissão 1)`);
  }
  return Number(v);
}

export function ipDoCliente(headers: Pick<Headers, 'get'> | null | undefined): string {
  const saltos = saltosDeConfianca();
  if (saltos === 0 || !headers) return 'unknown';
  const cadeia = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (cadeia.length > 0) return cadeia[Math.max(0, cadeia.length - saltos)];
  return headers.get('x-real-ip')?.trim() || 'unknown';
}
