# Requisitos: Correções e Páginas em Falta

## Introdução

Ao contrário dos módulos totalmente por implementar, muitas funcionalidades **têm
serviço e action mas falta-lhes a página de detalhe/edição** (rotas com `_components`
mas sem `page.tsx`, ou `rowHref` que aponta para 404), há **um bug de enum
confirmado** e várias **listas que contornam a camada de serviço** (Server
Components a chamar `prisma` cru, contra o padrão do `CLAUDE.md`). Há ainda **árvores
de rotas duplicadas** por consolidar. Este spec agrupa estas correções.

## Requisitos

### Requisito 1 — Bug de enum em Avaliações (CONFIRMADO)

1. A UI `/rh/avaliacoes` usa o valor `GRAU_360` (em `TIPO_LABEL` e no filtro), mas
   o enum Prisma `TipoAvaliacao` define `TREZENTOS_SESSENTA`. Filtrar por 360°
   envia um valor de enum inválido ao Prisma → erro/lista vazia; rótulos de linhas
   `TREZENTOS_SESSENTA` não resolvem.
2. DEVE-se unificar num único valor canónico. **Decisão recomendada:** renomear o
   membro do enum para `GRAU_360` (mais legível na UI) via migração, **ou**, em
   alternativa mínima, alinhar a UI para `TREZENTOS_SESSENTA`. Escolher uma e
   aplicar em schema, seed, validações Zod e UI de forma consistente.
3. Property/unit test que garanta que todo o valor de `TipoAvaliacao` tem rótulo e
   opção de filtro correspondentes (paridade enum↔UI), evitando regressões.

### Requisito 2 — Listas de RH via camada de serviço

1. As páginas `/rh/avaliacoes`, `/rh/assiduidade` e `/rh/payroll` chamam `prisma`
   diretamente do Server Component. DEVEM passar a consumir os métodos `listar` dos
   respectivos serviços (`AvaliacaoService.listar` — a criar; `AssiduidadeService.listar`
   — existe; payroll — spec 06), cumprindo "Server Component chama o serviço" do
   `CLAUDE.md`.
2. `AvaliacaoService` DEVE ganhar `listar` (com enriquecimento colaborador/avaliador)
   e `obter` (detalhe com critérios), hoje inexistentes.

### Requisito 3 — Páginas de detalhe/edição em falta (RH e Projectos)

1. DEVEM ser criadas as páginas cujo backend já existe mas a rota não tem `page.tsx`
   (ou o `rowHref` aponta para 404):
   - `/rh/avaliacoes/[id]` (detalhe: critérios, notas, plano de ação, transições) e
     `/rh/avaliacoes/[id]/editar`.
   - `/rh/colaboradores/[id]/editar`.
   - `/rh/assiduidade/[id]` (detalhe do registo) — opcional, com `rowHref` na lista.
   - `/projetos/[id]` e `/projetos/lista/[id]`, `/projetos/lista/[id]/editar`,
     `/projetos/lista/[id]/kanban`, `/projetos/novo` (o serviço de projectos existe).
2. Todas Server Components, com detalhe/edição em rotas dedicadas (sem modais).

### Requisito 4 — Páginas de detalhe/edição em falta (transversais)

1. DEVEM ser criadas (backend existente):
   - `/produtos/[id]` e `/produtos/[id]/editar`.
   - `/inventario/ativos/[id]/editar` e `/inventario/manutencao/[id]/editar`.
   - `/core-tenancy/roles/[id]`, `/core-tenancy/roles/[id]/editar`,
     `/core-tenancy/utilizadores/[id]`, `/core-tenancy/utilizadores/[id]/editar`.
   - `/contabilidade/centros-custo/novo`, `/contabilidade/diarios/novo`,
     `/contabilidade/plano-contas/novo` (têm `_components` mas falta `page.tsx`).
   - `/vendas/vendedores/[id]/comissoes`.
   - `/compras/requisicoes/[id]/editar` (e o equivalente em `/procurement`, ver R5).

### Requisito 5 — Consolidação de rotas duplicadas

1. `/compras` e `/procurement` são árvores paralelas sobre o mesmo domínio de
   serviço. Conforme a recomendação do spec 02/ADR, DEVE manter-se `/compras` como
   árvore única e **redireccionar `/procurement/*` → `/compras/*`** (ou remover),
   eliminando páginas duplicadas e o `requisicoes/[id]/editar` em duplicado.
2. `/projetos` tem três pastas de equipa (`equipa`, `equipas`, `equipes`). DEVEM
   ser consolidadas numa só (`equipa`), com redirect/remover as restantes.

### Requisito 6 — Higiene

1. Estados em falta no mapa único `status-badge.tsx` (identificados na cauda da
   UI-1) DEVEM ser adicionados; proibido mapa local.
2. Zero `Dialog` fora de `AlertDialog`; zero `'use client'` em `page.tsx` de
   listagem/detalhe; zero imports de `@/data` — verificados por `pnpm gates`.

## Critérios de Aceitação

1. `pnpm check` e `pnpm gates` verdes; sem novos `Dialog`/`'use client'` proibidos.
2. Nenhum `rowHref`/link de navegação aponta para uma rota sem `page.tsx` (verificar
   por script/E2E de navegação nas rotas afetadas).
3. Teste de paridade enum↔UI para `TipoAvaliacao`; filtro 360° devolve resultados.
4. Smoke autenticado das novas páginas (todas 200), incluindo edição.

## Fontes

- Bug confirmado: `src/app/(dashboard)/rh/avaliacoes/page.tsx` (`GRAU_360`) vs
  `prisma/schema/pessoas-projetos.prisma` (`TipoAvaliacao.TREZENTOS_SESSENTA`).
- Golden standard de páginas: `src/app/(dashboard)/compras/requisicoes/**`.
- Convenções: `CLAUDE.md`, `.claude/skills/ui-conventions`.
