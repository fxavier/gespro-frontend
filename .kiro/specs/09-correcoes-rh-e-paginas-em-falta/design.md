# Design: Correções e Páginas em Falta

## Âmbito

Trabalho maioritariamente de UI + pequenas adições de serviço, sobre domínios já
implementados. Sem novos domínios. Segue o golden standard
`compras/requisicoes/**` (lista SC + `@panel`/`(.)[id]` + detalhe com tabs +
`novo`/`[id]/editar`).

## 1. Correção do enum `TipoAvaliacao`

**Opção A (recomendada) — renomear no schema para `GRAU_360`:**

```prisma
enum TipoAvaliacao { DESEMPENHO COMPETENCIAS GRAU_360 PROBATORIO }
```

- Migração de renomeação de valor de enum (Postgres `ALTER TYPE ... RENAME VALUE`):
  ```sql
  ALTER TYPE "TipoAvaliacao" RENAME VALUE 'TREZENTOS_SESSENTA' TO 'GRAU_360';
  ```
- Alinhar `src/lib/validations/rh.ts` (enum Zod), `prisma/seed/*` e qualquer
  referência a `TREZENTOS_SESSENTA`. A UI já usa `GRAU_360`.

**Opção B (mínima) — alinhar UI ao schema:** trocar `GRAU_360`→`TREZENTOS_SESSENTA`
em `avaliacoes/page.tsx` (`TIPO_LABEL` + `FILTER_CONFIG`). Sem migração.

Recomenda-se A (nome legível, alinhado com o resto da UI). Adicionar um **teste de
paridade**: para cada valor de `TipoAvaliacao` do enum Prisma, existe entrada em
`TIPO_LABEL` e opção de filtro — falha o teste se divergir (previne o bug de novo).

## 2. `AvaliacaoService.listar`/`obter` + roteamento via serviço

```ts
// src/server/services/pessoas-projetos/rh.service.ts (AvaliacaoService)
async listar(filter: FilterAvaliacaoInput, ctx: Ctx) {
  return paginate((a) => prisma.avaliacao.findMany({
    ...a,
    where: { tenantId: ctx.tenantId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.tipo ? { tipo: filter.tipo } : {}) },
    include: { colaborador: { select: { nome: true } }, avaliador: { select: { nome: true } } },
    orderBy: { dataInicio: 'desc' },
  }), { cursor: filter.cursor, take: filter.take });
}
async obter(id, ctx) { /* findFirst tenant-scoped + include criterios */ }
```

- `FilterAvaliacaoSchema` em `validations/rh.ts`.
- Refactor de `avaliacoes/page.tsx`, `assiduidade/page.tsx` e (spec 06)
  `payroll/page.tsx` para chamar `Service.listar` dentro de `runWithTenantContext`
  em vez de `prisma` cru. Comportamento visual inalterado.

## 3. Páginas em falta — mapa (todas seguem o golden standard)

| Rota a criar | Backend existente | Notas |
|---|---|---|
| `/rh/avaliacoes/[id]` (+`/editar`) | `AvaliacaoService` (+`obter`) | detalhe: critérios, nota final, plano de ação, transições PENDENTE→EM_ANDAMENTO→CONCLUIDA |
| `/rh/colaboradores/[id]/editar` | `ColaboradorService.actualizar` | reutiliza o form de `_components` (15.8KB já existe) |
| `/rh/assiduidade/[id]` | `AssiduidadeService` (+`obter`) | opcional; adicionar `rowHref` na lista |
| `/projetos/[id]`, `/projetos/lista/[id]`(+`/editar`,`/kanban`), `/projetos/novo` | `projetos.service.ts` | kanban usa `TarefaProjeto.posicao` fraccional |
| `/produtos/[id]`(+`/editar`) | `catalogo.service.ts` | |
| `/inventario/ativos/[id]/editar`, `/inventario/manutencao/[id]/editar` | `ativos`/`manutencao` service | |
| `/core-tenancy/roles/[id]`(+`/editar`), `/utilizadores/[id]`(+`/editar`) | `tenant-admin`/`user-admin` service | |
| `/contabilidade/centros-custo/novo`, `/diarios/novo`, `/plano-contas/novo` | `contabilidade.service` | `_components` já existem; falta `page.tsx` |
| `/vendas/vendedores/[id]/comissoes` | `comissao.service.ts` | relatório por vendedor |

Cada detalhe é Server Component; edição/criação em rota dedicada; interactividade
em componentes-folha `'use client'`. Serializar `Decimal`→`string`.

## 4. Consolidação de rotas

- **compras vs procurement:** manter `/compras` como árvore canónica. Adicionar
  redirects em `next.config.ts` (ou `redirect()` em `page.tsx` finos) de
  `/procurement/*` → `/compras/*` equivalente, e remover as páginas duplicadas
  `/procurement/**` após confirmar paridade de funcionalidade. Registar o mapeamento
  de rotas.
- **projetos equipa/equipas/equipes:** eleger `equipa` como canónica; redirect das
  outras duas e remoção. Um único conjunto de páginas de equipa.

## 5. Higiene / gates

- Completar o mapa único `patterns/status-badge.tsx` com os estados em falta
  (cauda da UI-1) — sem mapas locais.
- Garantir `pnpm gates` verde: `Dialog` fora de `AlertDialog` = 0; `'use client'`
  em `page.tsx` de listagem/detalhe = 0; imports `@/data` = 0.

## Riscos e mitigações

- **Renomear enum em produção:** `ALTER TYPE ... RENAME VALUE` é seguro e preserva
  dados; validar em migração de teste antes. Se houver receio, usar Opção B.
- **Remover `/procurement`:** confirmar que nenhuma navegação/links internos ficam
  a apontar para as rotas removidas (grep + E2E de navegação) antes de apagar;
  manter redirects durante um período de transição.
- **Regressão de navegação:** E2E leve que percorre os `rowHref`/links das listas
  afetadas e afirma resposta 200 (evita 404 silenciosos).
