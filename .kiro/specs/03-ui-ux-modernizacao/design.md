# Design: Modernização UI/UX

## Direcção Visual

- **Estética:** profissional/enterprise limpa — superfícies neutras (slate/zinc), primária azul-petróleo ou índigo dessaturado definida em token (substitui o `#1877F2` do Facebook), acentos semânticos consistentes. Cantos 10px, sombras subtis, bordas 1px em vez de sombras pesadas.
- **Tipografia:** Geist Sans (via `next/font`) — escala: 12/13 (meta), 14 (corpo/tabelas), 16 (ênfase), 20/24/30 (títulos). Números tabulares (`font-variant-numeric: tabular-nums`) em tabelas e KPIs — essencial num ERP financeiro.
- **Dark mode:** tokens espelhados; gráficos recharts lêem cores de CSS vars.

Tokens em `globals.css` com Tailwind 4 `@theme`:

```css
@theme {
  --color-primary: oklch(0.55 0.15 250);
  --color-surface: oklch(0.985 0.002 250);
  --color-success: oklch(0.65 0.15 150);
  --color-warning: oklch(0.75 0.15 80);
  --color-destructive: oklch(0.6 0.2 25);
  --radius-base: 0.625rem;
  /* ... */
}
```

## Padrão "Sem Modais" — Arquitectura de Rotas

### Criar/Editar → páginas dedicadas

```
compras/requisicoes/
├─ page.tsx                 # listagem (Server Component)
├─ novo/page.tsx            # formulário de criação
└─ [id]/
   ├─ page.tsx              # detalhe completo
   └─ editar/page.tsx       # formulário de edição
```

### Inspecção rápida → painel lateral com URL (rotas paralelas + interceptação)

Para listagens de alto volume onde abrir página completa por registo é pesado (movimentos de stock, tickets, aprovações pendentes):

```
compras/requisicoes/
├─ layout.tsx               # renderiza {children} + {panel}
├─ @panel/
│  ├─ default.tsx           # null
│  └─ (.)[id]/page.tsx      # painel lateral (Sheet-like, mas rota real)
└─ [id]/page.tsx            # acesso directo por URL → página completa
```

Comportamento: clique na linha → painel desliza da direita com resumo + acções; URL muda para `/requisicoes/REQ-001`; refresh/partilha abre a página completa; `Esc`/fechar → `router.back()`. É o padrão oficial Next.js para "modal com URL": https://nextjs.org/docs/app/building-your-application/routing/parallel-routes e https://nextjs.org/docs/app/building-your-application/routing/intercepting-routes

Decisão de aplicação por tipo de ecrã (o agente não decide caso a caso — segue esta tabela):

| Operação | Padrão |
|---|---|
| Criar entidade | Página `novo/` |
| Editar entidade | Página `[id]/editar` |
| Ver detalhe rico (tabs, histórico) | Página `[id]/` |
| Inspecção rápida em lista de alto volume | Painel `@panel` + `(.)` |
| Confirmar acção destrutiva | `AlertDialog` (única excepção) |
| Filtros avançados | `Popover` inline ou secção expansível — nunca Dialog |
| Selecção de item relacionado (ex.: produto na linha de factura) | `Combobox` (cmdk) inline com pesquisa server-side |

## Componentes Padrão a Criar (`src/components/patterns/`)

| Componente | Responsabilidade |
|---|---|
| `PageHeader` | título, descrição, breadcrumbs, acções |
| `DataTable` | wrapper tabela server-paginada: colunas tipadas, ordenação via searchParams, selecção, row-click, responsivo (colapso em cartões `<md`) |
| `FilterBar` | pesquisa debounced + selects + chips activos, tudo sincronizado com `useSearchParams`/`router.replace` |
| `StatusBadge` | mapa único status→variante para todos os domínios |
| `KpiCard` | valor, delta, sparkline opcional |
| `DetailShell` | layout de detalhe: header + tabs + sidebar de metadados |
| `FormPage` / `FormSection` | esqueleto de formulário com secções ancoradas e footer sticky (Guardar/Cancelar) |
| `Timeline` | histórico/auditoria |
| `EmptyState` / `ErrorState` | estados padronizados |
| `Stepper` | wizards multi-página |
| `UnsavedChangesGuard` | aviso ao navegar com form dirty |

Todos construídos sobre os primitivos shadcn existentes em `src/components/ui` — não reescrever a base.

## Data Fetching por Página

```tsx
// page.tsx — Server Component
export default async function RequisicoesPage({ searchParams }: Props) {
  const filtros = FiltroRequisicaoSchema.parse(await searchParams);
  return (
    <PageShell header={<PageHeader ... />}>
      <FilterBar ... />
      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton cols={6} />}>
        <RequisicoesTable filtros={filtros} />   {/* async SC: chama serviço */}
      </Suspense>
    </PageShell>
  );
}
```

Formulários: Client Component folha com `useActionState(action)`; erros de campo do servidor (`fieldErrors`) fundidos no `react-hook-form` via `setError`.

## Plano de Migração das 195 Páginas

Paralelizado por 7 agentes de UI, espelhando os workstreams do spec 02 (mesmo agrupamento de módulos), após:
1. **Wave UI-0 (sequencial):** design tokens + layout global + componentes `patterns/` + página exemplo de referência completa (requisições de compras: listagem+painel+detalhe+novo+editar) aprovada pelo code reviewer como **golden standard**.
2. **Wave UI-1 (paralela):** cada agente migra o seu grupo de módulos replicando o golden standard, guiado pelo handoff do spec 02.
3. **Wave UI-2:** consolidação de rotas duplicadas, Cmd+K, notificações, passagem de acessibilidade e performance, E2E.

## Riscos e Mitigações

- **Deriva visual entre agentes paralelos:** golden standard obrigatório + skill `ui-conventions` com regras verificáveis + code reviewer com checklist visual.
- **Rotas interceptadas mal usadas:** tabela de decisão acima é normativa; desvios exigem aprovação do orquestrador.
- **Regressões funcionais na migração:** cada página migrada exige smoke E2E mínimo (render + acção primária) antes do merge.

## Referências

- Parallel/Intercepting Routes: https://nextjs.org/docs/app/building-your-application/routing/parallel-routes
- Tailwind 4 theme variables: https://tailwindcss.com/docs/theme
- shadcn/ui: https://ui.shadcn.com
- WCAG 2.2 AA: https://www.w3.org/TR/WCAG22/
