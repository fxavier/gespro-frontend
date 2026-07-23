import "server-only";

/**
 * Rate-limit em memória, por instância.
 *
 * Suficiente para os dois formulários públicos do site (contacto e registo):
 * o objectivo é travar submissões repetidas do mesmo browser, não substituir a
 * defesa real — que é do lado do spec 19 (rate-limit do endpoint de registo) e
 * do CDN/WAF à frente do site. Em várias instâncias o limite é por instância,
 * o que é aceitável para este uso e está documentado como gap.
 */

interface Janela {
  contagem: number;
  expiraEm: number;
}

const janelas = new Map<string, Janela>();

export interface ResultadoLimite {
  permitido: boolean;
  restantes: number;
  reiniciaEm: number;
}

export function verificarLimite(
  chave: string,
  maximo: number,
  janelaMs: number
): ResultadoLimite {
  const agora = Date.now();
  const actual = janelas.get(chave);

  if (!actual || actual.expiraEm <= agora) {
    janelas.set(chave, { contagem: 1, expiraEm: agora + janelaMs });
    limparExpiradas(agora);
    return { permitido: true, restantes: maximo - 1, reiniciaEm: janelaMs };
  }

  actual.contagem += 1;
  const restantes = Math.max(0, maximo - actual.contagem);
  return {
    permitido: actual.contagem <= maximo,
    restantes,
    reiniciaEm: actual.expiraEm - agora,
  };
}

function limparExpiradas(agora: number): void {
  if (janelas.size < 500) return;
  for (const [chave, janela] of janelas) {
    if (janela.expiraEm <= agora) janelas.delete(chave);
  }
}

/** Identificador do cliente a partir dos headers do proxy. */
export function identificarCliente(cabecalhos: Headers): string {
  const encaminhado = cabecalhos.get("x-forwarded-for");
  if (encaminhado) return encaminhado.split(",")[0]!.trim();
  return cabecalhos.get("x-real-ip") ?? "desconhecido";
}

/** Só para testes: reinicia o estado entre casos. */
export function reiniciarLimites(): void {
  janelas.clear();
}
