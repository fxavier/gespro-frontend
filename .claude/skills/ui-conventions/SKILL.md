---
name: ui-conventions
description: Convencoes obrigatorias de UI/UX do GestPro - padrao sem modais, patterns, tokens, Server Components e formularios. Usar sempre que se criar ou migrar paginas, componentes ou formularios.
---

# Convenções de UI — GestPro

## Regra de ouro: sem modais
Tabela de decisão (normativa; desvio exige aprovação do orquestrador):

| Operação | Padrão |
|---|---|
| Criar entidade | Página `<entidade>/novo` |
| Editar | Página `[id]/editar` |
| Detalhe rico | Página `[id]/` com `DetailShell` (tabs + metadados + timeline) |
| Inspecção rápida em lista de alto volume | Rota paralela `@panel` + interceptada `(.)[id]` (painel lateral com URL real) |
| Confirmação destrutiva | `AlertDialog` — única excepção |
| Filtros avançados | `Popover`/secção expansível |
| Escolher registo relacionado | `Combobox` (cmdk) com pesquisa server-side |

`Dialog` para criar/editar/detalhar = BLOCKER em code review.

## Estrutura de página
- `page.tsx` de listagem/detalhe é Server Component; interactividade em Client Components folha.
- Filtros/pesquisa/ordenação vivem em `searchParams` (parseados com o `FilterSchema` Zod do módulo), sincronizados pela `FilterBar`.
- Suspense + skeleton por secção (`TableSkeleton`, `CardsSkeleton`, `DetailSkeleton`); `loading.tsx` por segmento.
- Golden standard: `src/app/(dashboard)/compras/requisicoes/**` — replicar estrutura.

## Componentes
- Usar exclusivamente `src/components/patterns/` (PageHeader, DataTable, FilterBar, StatusBadge, KpiCard, DetailShell, FormPage, Timeline, EmptyState, ErrorState, Stepper, UnsavedChangesGuard) sobre os primitivos `src/components/ui/`.
- Estados de domínio via `StatusBadge` com o mapa único status→variante; proibido mapa local.
- Zero cores hardcoded: só tokens (`bg-primary`, `text-muted-foreground`, vars `@theme`). Dark mode obrigatório.
- Tabelas: `tabular-nums`, densidade compacta, colunas responsivas (colapso em cartões `<md`).

## Formulários
- `react-hook-form` + `zodResolver` com o MESMO schema de `src/lib/validations`.
- Submit via Server Action com `useActionState`/`useTransition`; `fieldErrors` do servidor aplicados com `setError`.
- `UnsavedChangesGuard` em todo o formulário; footer sticky Guardar/Cancelar; toasts `sonner` só para resultado global.
- Formulários longos: `FormSection` com navegação ancorada; fluxos multi-passo: `Stepper` em páginas sequenciais com draft no servidor.

## Acessibilidade e performance
- Foco visível, navegação por teclado, `aria-*` correcto, contraste AA.
- Gráficos e componentes pesados com `dynamic()` + skeleton; sem layout shift.
