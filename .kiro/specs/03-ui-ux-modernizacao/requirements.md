# Requisitos: Modernização UI/UX — Telas Modernas, Sem Modais

## Introdução

O GestPro tem 195 páginas com qualidade visual desigual: 66 ficheiros dependem de `Dialog` (modais) para criar/editar/detalhar, o header usa cor hardcoded (`#1877F2`), 191 páginas são `'use client'` e os padrões de listagem/formulário variam entre módulos. Este spec define o sistema de design, os padrões de navegação **sem modais** e a modernização visual de todas as telas, mantendo shadcn/Radix + Tailwind 4.

Princípio central: **modais são substituídos por rotas**. Criar/editar/detalhar são páginas próprias (ou painéis laterais persistentes com URL), preservando deep-linking, botão voltar, partilha de links e estado recarregável.

## Requisitos

### Requisito 1 — Sistema de Design (Design Tokens)

**User Story:** Como utilizador, quero uma interface visualmente coerente e profissional em todos os módulos.

#### Critérios de Aceitação

1. O sistema DEVE definir tokens em CSS variables (Tailwind 4 `@theme`) para: paleta (primária, superfícies, semânticas de estado — sucesso/aviso/erro/info), tipografia (escala 12–30px, Inter ou Geist), espaçamento, raios (base 8–12px) e sombras (2 níveis, subtis).
2. TODAS as cores hardcoded (ex.: `#1877F2` no header, gradientes ad-hoc) DEVEM ser substituídas por tokens; dark mode DEVE funcionar em todas as páginas via `next-themes` já presente.
3. Estados de dados DEVEM ter componentes padrão: `EmptyState` (ilustração leve + CTA), `ErrorState` (mensagem + retry), skeletons por tipo de conteúdo (tabela, cartões, detalhe) usados com Suspense.
4. Badges de estado de domínio (rascunho/pendente/aprovada/…) DEVEM usar um mapa único `status → variante` partilhado (`src/components/ui/status-badge.tsx`), eliminando mapas locais duplicados.
5. Densidade: tabelas DEVEM ter modo compacto por omissão em desktop (~44px por linha) com boa legibilidade.

### Requisito 2 — Eliminação de Modais

**User Story:** Como utilizador, quero criar e editar registos em páginas completas com URL próprio, para nunca perder trabalho nem contexto.

#### Critérios de Aceitação

1. NENHUMA operação de criação ou edição de entidade DEVE usar `Dialog`; DEVE existir rota dedicada: `<modulo>/<entidade>/novo` e `<modulo>/<entidade>/[id]/editar`.
2. Detalhes de registo DEVEM abrir em página própria (`[id]/page.tsx`); em listagens onde a consulta rápida é valiosa (ex.: requisições, tickets, movimentos), o sistema PODE usar painel lateral de inspecção implementado como **rota paralela/interceptada** (`@panel`/`(.)`) — com URL, back button e refresh a funcionarem — nunca `Dialog` com estado local.
3. Confirmações destrutivas são a ÚNICA excepção permitida: `AlertDialog` pequeno para apagar/cancelar irreversível.
4. QUANDO um formulário tem dados por guardar e o utilizador navega, ENTÃO o sistema DEVE avisar (guard de navegação) — comportamento impossível de garantir com os modais actuais.
5. Filtros e pesquisa de listagens DEVEM viver em `searchParams` (URL), não em estado local — partilháveis e persistentes.

### Requisito 3 — Padrões de Página (aplicados uniformemente)

1. **Listagem:** header com título+descrição+acção primária; barra de filtros (pesquisa com debounce, selects, chips de filtros activos); tabela server-paginada (cursor) com ordenação; linha clicável → detalhe; acções secundárias em `DropdownMenu` por linha; contagem/estado vazio/erro padronizados.
2. **Detalhe:** header com breadcrumbs, título, `StatusBadge`, acções contextuais por estado (máquina de estados do spec 02) e metadados; corpo em `Tabs` para entidades ricas (ex.: requisição: itens, aprovações, histórico); timeline de auditoria/histórico onde exista.
3. **Formulário:** página dedicada em card único ou secções (formulários longos: secções ancoradas com navegação lateral); `react-hook-form` + `zodResolver` com os mesmos schemas do servidor (`src/lib/validations`); submit via Server Action com `useActionState`/`useTransition`, erros de campo do servidor mapeados para os campos; toasts `sonner` apenas para resultado, nunca para erros de validação de campo.
4. **Dashboard de módulo:** grelha de KPI cards (valor, variação, sparkline) + 1–2 gráficos `recharts` + lista de pendências accionáveis; dados de Server Component com Suspense streaming por secção.
5. **Wizard:** fluxos multi-passo (fecho de caixa, recepção de mercadoria, inventário físico) DEVEM usar páginas sequenciais com stepper e estado no servidor (draft), não modais encadeados.

### Requisito 4 — Layout e Navegação Global

1. Sidebar reorganizada pelos 7 domínios do spec 02 (com grupos colapsáveis), filtrada por permissões (`usePermissions`), com pesquisa de comandos (`cmdk` já instalado) via `Cmd+K` para saltar para qualquer página/entidade.
2. Header: remover cor hardcoded; incluir breadcrumbs, selector de tenant (quando o utilizador pertence a vários), notificações reais (alertas de stock/documentos a expirar) e menu de utilizador com sessão real.
3. Responsividade: sidebar off-canvas em mobile; tabelas com colunas prioritárias + colunas secundárias colapsadas em cartões em `<md`.
4. Acessibilidade: navegação por teclado completa, `aria-*` nos componentes interactivos, contraste AA, foco visível — verificado por axe nos testes de UI dos fluxos críticos.

### Requisito 5 — Migração Página a Página

1. TODAS as 195 páginas DEVEM ser migradas para os padrões acima, consumindo as Server Actions/serviços do spec 02 (handoffs `docs/handoff/*.md`).
2. Páginas de listagem/detalhe DEVEM ser Server Components; interactividade isolada em Client Components folha (filtros, formulários, kanban).
3. Rotas duplicadas identificadas no spec 02 (`compras` vs `procurement`; `projetos/equipa` vs `equipes`; `projetos/orcamento` vs `orcamentos`) DEVEM ser consolidadas com `redirect()` das antigas.
4. O componente `zoer_chatbot` e a rota `next_api/example` DEVEM ser removidos se não houver decisão explícita de os manter (confirmar com o owner antes de apagar — task de decisão).

### Requisito 6 — Performance e Qualidade Percebida

1. Navegações entre listagens DEVEM apresentar conteúdo estável: Suspense + skeletons, `loading.tsx` por segmento, sem layout shift (CLS < 0.1).
2. Gráficos e componentes pesados DEVEM ser `dynamic()` com skeleton.
3. LCP das páginas de dashboard < 2.5s em ligação 4G simulada; bundle client por rota < 250KB gzip (medido com `next build` + analyse).
4. Testes E2E (Playwright) dos fluxos críticos: login, criar requisição→aprovar, venda POS completa, emitir factura, fecho de caixa.
