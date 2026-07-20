# Plano de Implementação: Modernização UI/UX

Execução: Wave UI-0 sequencial (agente `ui-foundation`), depois 7 agentes `ui-<grupo>` em paralelo, Wave UI-2 pelo `ui-foundation` + `qa-e2e`. Revisão do golden standard e amostragem de páginas pelo `code-reviewer` (claude-fable-5).

## Wave UI-0 — Fundação Visual (BLOCKING para os agentes paralelos)

- [ ] 1. Design tokens e tema
  - Definir `@theme` em `globals.css` (paleta oklch, tipografia Geist via `next/font`, raios, sombras); números tabulares em tabelas/KPIs
  - Auditar e remover todas as cores hardcoded (grep `#[0-9a-fA-F]{6}` em `src/app` e `src/components`); dark mode verificado em todos os primitivos
  - _Requisitos: 1.1, 1.2_
- [ ] 2. Layout global
  - Reescrever `(dashboard)/layout.tsx`: header tokenizado com breadcrumbs, menu de utilizador com sessão real, notificações; sidebar por domínios com grupos colapsáveis e filtro por permissões
  - Command palette `Cmd+K` (cmdk) com navegação para páginas e pesquisa de entidades (server action de pesquisa global)
  - Responsividade mobile (sidebar off-canvas)
  - _Requisitos: 4.1–4.3_
- [ ] 3. Biblioteca `src/components/patterns/`
  - `PageHeader`, `DataTable`, `FilterBar`, `StatusBadge`, `KpiCard`, `DetailShell`, `FormPage`/`FormSection`, `Timeline`, `EmptyState`, `ErrorState`, `Stepper`, `UnsavedChangesGuard`
  - Stories/página de demonstração interna `/dev/patterns` (apenas em dev) para revisão visual
  - _Requisitos: 1.3–1.5, 2.4, 3.1–3.3_
- [ ] 4. Golden standard: módulo Requisições de Compras completo
  - Listagem (SC + DataTable + FilterBar em searchParams) + painel `@panel`/`(.)[id]` + detalhe com tabs (itens/aprovações/histórico) + `novo/` + `[id]/editar` com useActionState
  - Aprovação formal pelo code-reviewer antes de desbloquear Wave UI-1
  - _Requisitos: 2.1, 2.2, 3.1–3.3, 5.2_

## Wave UI-1 — Migração Paralela por Grupo

Cada agente executa, para cada módulo do seu grupo, o checklist:
(a) listagens → padrão DataTable/FilterBar; (b) modais de criar/editar → rotas `novo`/`[id]/editar`; (c) detalhes → `DetailShell` (painel `@panel` onde a tabela de decisão manda); (d) dashboards → `KpiCard`+recharts tokenizado com Suspense; (e) wizards → `Stepper` multi-página; (f) remover todos os `Dialog` excepto `AlertDialog` destrutivo; (g) smoke E2E por página migrada.

- [ ] 5. `ui-inventario`: `produtos`, `inventario` (18 páginas incl. ativos, fisico, manutencao, movimentacoes), `stock`
- [ ] 6. `ui-compras`: `compras`, `procurement` (consolidar em `/compras` com redirects), `fornecedores`, `servicos`
- [ ] 7. `ui-comercial`: `vendas`, `pos` (atenção: POS é ecrã de produtividade — layout dedicado full-screen, atalhos de teclado, sem sidebar), `clientes`
- [ ] 8. `ui-financas`: `caixa` (abertura/fechamento como wizards), `contabilidade` (11 páginas; lançamentos com editor de partidas inline), `faturacao` (emissão como formulário de página inteira com linhas dinâmicas e combobox de produtos server-side)
- [ ] 9. `ui-pessoas-projetos`: `rh`, `projetos` (kanban com drag-and-drop persistente; consolidar `equipa`/`equipes` e `orcamento`/`orcamentos`), `producao`
- [ ] 10. `ui-operacoes`: `transporte` (aplicar UI do spec `rotas-detalhes` existente onde compatível), `tickets`
- [ ] 11. `ui-plataforma`: `core-tenancy`, `analytics`, `dashboard` inicial, `(auth)` (login/reset/convite com o novo tema)

## Wave UI-2 — Consolidação e Qualidade

- [ ] 12. Consolidação de rotas duplicadas com `redirect()`; decisão registada sobre `zoer_chatbot` e remoção de `next_api/example`
  - _Requisitos: 5.3, 5.4_
- [ ] 13. Acessibilidade: passagem axe nos fluxos críticos; navegação por teclado; contraste AA
  - _Requisitos: 4.4_
- [ ] 14. Performance: `loading.tsx` por segmento; `dynamic()` em gráficos; bundle analyse por rota (<250KB gzip); CLS<0.1, LCP<2.5s nos dashboards
  - _Requisitos: 6.1–6.3_
- [ ] 15. E2E Playwright: login, requisição→aprovação, venda POS, emissão de factura, fecho de caixa; correr em CI
  - _Requisitos: 6.4_
- [ ] 16. Gate final: zero `Dialog` fora de `AlertDialog` destrutivo (lint rule/grep em CI); zero `'use client'` em `page.tsx` de listagem/detalhe
