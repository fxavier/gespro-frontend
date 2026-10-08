/**
 * Que permissão de CONSULTA abre cada rota do dashboard (#76).
 *
 * Uma só decisão para dois sítios: a barra lateral (`AppSidebar`) esconde o que
 * `podeVerRota` recusa, e a guarda de cada módulo (`exigirPermissaoPagina`, chamada
 * no `layout.tsx` da rota) recusa o mesmo. Um atalho no menu para «Sem permissão», ou
 * uma página que abre sem atalho, deixam de ser possíveis por construção.
 *
 * Módulo neutro (sem `server-only` nem `'use client'`): o cliente e o servidor
 * importam-no os dois.
 *
 * Só permissões do catálogo de `prisma/seed/rbac.ts` — um código que não existe
 * esconde a rota a toda a gente, ADMIN incluído (era o que acontecia às Compras).
 */

/** Prefixo de rota → permissão de consulta. Vence o prefixo mais comprido. */
export const PERMISSAO_POR_ROTA: Record<string, string> = {
  '/compras': 'compras:ver',
  '/fornecedores': 'fornecedores:ver',
  '/servicos': 'servicos:ver',
  '/inventario': 'inventario:ver',
  '/produtos': 'produtos:ver',
  '/vendas': 'vendas:ver',
  '/pos': 'pos:operar',
  '/clientes': 'clientes:ver',
  '/contabilidade': 'financas:ver',
  // A DFC não é operacional: o OPERADOR não tem `financas:fluxo-caixa:leitura`.
  '/contabilidade/dfc': 'financas:fluxo-caixa:leitura',
  '/faturacao': 'faturacao:ver',
  // #149 — numeração dos documentos; quem só lê vê a lista sem acções.
  '/faturacao/series': 'faturacao:leitura',
  '/caixa': 'caixa:ver',
  '/tesouraria': 'financas:tesouraria:leitura',
  '/rh': 'rh:ver',
  '/projetos': 'projetos:ver',
  '/producao': 'producao:ver',
  '/transporte': 'transporte:ver',
  '/tickets': 'tickets:ver',
  '/analytics': 'analytics:ver',
  '/core-tenancy': 'core_tenancy:ver',
  // Administração: não basta ver o tenant para ver quem lá trabalha nem o trilho.
  '/core-tenancy/utilizadores': 'admin:ver_utilizadores',
  '/core-tenancy/auditoria': 'admin:ver_auditoria',
  // Spec 19 — subscrição SaaS.
  '/definicoes/faturacao': 'assinatura:ver',
  // #177 — nome, NUIT, morada e regime de IVA do emitente: só quem configura o tenant.
  '/definicoes/empresa': 'core_tenancy:configurar',
};

/** Rotas que qualquer sessão vê. */
export const ROTAS_PUBLICAS: readonly string[] = ['/dashboard'];

function normalizar(caminho: string): string {
  const semQuery = caminho.split(/[?#]/)[0];
  return semQuery.length > 1 ? semQuery.replace(/\/+$/, '') : semQuery;
}

/** A permissão do maior prefixo do mapa (por segmento inteiro), ou `null`. */
export function permissaoDaRota(caminho: string): string | null {
  const c = normalizar(caminho);
  let melhor: string | null = null;
  for (const prefixo of Object.keys(PERMISSAO_POR_ROTA)) {
    if (c !== prefixo && !c.startsWith(`${prefixo}/`)) continue;
    if (melhor === null || prefixo.length > melhor.length) melhor = prefixo;
  }
  return melhor === null ? null : PERMISSAO_POR_ROTA[melhor];
}

function ePublica(caminho: string): boolean {
  const c = normalizar(caminho);
  return ROTAS_PUBLICAS.some((p) => c === p || c.startsWith(`${p}/`));
}

/**
 * Pode ver a rota? Pública → sim; no mapa → só com a permissão; fora dos dois → não
 * (uma rota esquecida fica fechada, não aberta).
 */
export function podeVerRota(caminho: string, permissoes: readonly string[]): boolean {
  if (ePublica(caminho)) return true;
  const permissao = permissaoDaRota(caminho);
  return permissao !== null && permissoes.includes(permissao);
}
