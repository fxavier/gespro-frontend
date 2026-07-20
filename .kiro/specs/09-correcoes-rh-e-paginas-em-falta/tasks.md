# Plano de Implementação: Correções e Páginas em Falta

Trabalho de UI + pequenas adições de serviço sobre domínios já implementados.

- [ ] 1. Correção do enum `TipoAvaliacao` (bug confirmado)
  - [ ] 1.1 Opção A: migração `09xx_rename_avaliacao_360` (`ALTER TYPE ... RENAME VALUE 'TREZENTOS_SESSENTA' → 'GRAU_360'`)
  - [ ] 1.2 Alinhar enum Zod (`validations/rh.ts`), seeds e quaisquer referências
  - [ ] 1.3 Teste de paridade enum↔UI (`TIPO_LABEL`/`FILTER_CONFIG` cobrem todos os valores)

- [ ] 2. Camada de serviço nas listas de RH
  - [ ] 2.1 `AvaliacaoService.listar` (com include colaborador/avaliador) + `obter` + `FilterAvaliacaoSchema`
  - [ ] 2.2 Refactor `avaliacoes/page.tsx` e `assiduidade/page.tsx` para consumir o serviço (sem `prisma` cru)
  - [ ] 2.3 (com spec 06) `payroll/page.tsx` via serviço

- [ ] 3. Páginas em falta — RH e Projectos
  - [ ] 3.1 `/rh/avaliacoes/[id]` (+`/editar`) — detalhe, critérios, transições
  - [ ] 3.2 `/rh/colaboradores/[id]/editar` (reutiliza form existente)
  - [ ] 3.3 `/rh/assiduidade/[id]` + `rowHref` na lista (opcional)
  - [ ] 3.4 `/projetos/[id]`, `/projetos/lista/[id]`(+`/editar`,`/kanban`), `/projetos/novo`

- [ ] 4. Páginas em falta — transversais
  - [ ] 4.1 `/produtos/[id]`(+`/editar`)
  - [ ] 4.2 `/inventario/ativos/[id]/editar`, `/inventario/manutencao/[id]/editar`
  - [ ] 4.3 `/core-tenancy/roles/[id]`(+`/editar`), `/utilizadores/[id]`(+`/editar`)
  - [ ] 4.4 `/contabilidade/centros-custo/novo`, `/diarios/novo`, `/plano-contas/novo`
  - [ ] 4.5 `/vendas/vendedores/[id]/comissoes`

- [ ] 5. Consolidação de rotas duplicadas
  - [ ] 5.1 Redirects `/procurement/*` → `/compras/*` + remoção das duplicadas (após paridade) e `requisicoes/[id]/editar` único
  - [ ] 5.2 Consolidar `projetos/{equipa,equipas,equipes}` → `equipa` (redirect/remover)

- [ ] 6. Higiene e gates
  - [ ] 6.1 Completar estados no `patterns/status-badge.tsx` (sem mapas locais)
  - [ ] 6.2 `pnpm gates` verde (Dialog/`'use client'`/`@/data` a zero)

- [ ] 7. Verificação
  - [ ] 7.1 E2E de navegação: percorre `rowHref`/links das listas afetadas → 200 (sem 404)
  - [ ] 7.2 `pnpm check` verde + smoke autenticado das novas páginas (incl. edição)
