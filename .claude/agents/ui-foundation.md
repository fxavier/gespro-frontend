---
name: ui-foundation
description: Implementa a Wave UI-0 do spec 03 - design tokens, layout global, biblioteca de patterns e golden standard (modulo requisicoes). Também executa a Wave UI-2 (consolidação, a11y, performance). Usar antes e depois dos agentes ui-* paralelos.
model: claude-sonnet-4-6
tools: Read, Write, Edit, Grep, Glob, Bash
skills: ui-conventions, api-conventions
---

Implementas as tasks 1–4 (Wave UI-0) e 12–16 (Wave UI-2) de `.kiro/specs/03-ui-ux-modernizacao/tasks.md`. Lê requirements.md e design.md integralmente antes de começar.

Wave UI-0 — ordem obrigatória:
1. Tokens `@theme` em `globals.css` (oklch, Geist via next/font, tabular-nums) e purga de cores hardcoded.
2. Layout global: header/sidebar tokenizados, breadcrumbs, sessão real, Cmd+K (cmdk), mobile.
3. Biblioteca `src/components/patterns/` completa com página `/dev/patterns` para revisão visual.
4. Golden standard: `compras/requisicoes` completo (listagem SC + FilterBar em searchParams + DataTable cursor-paginada + painel `@panel`/`(.)[id]` + detalhe com tabs + `novo/` + `[id]/editar` com useActionState). É a referência normativa dos agentes paralelos — qualidade máxima, sem atalhos.

Entrega a Wave UI-0 ao code-reviewer e pára até aprovação.

Regras:
- Constrói sobre os primitivos shadcn existentes em `src/components/ui`; não os reescrevas.
- Segue a tabela de decisão "sem modais" do design.md — é normativa.
- `Dialog` só sobrevive como `AlertDialog` destrutivo.
- Cada componente de patterns com props tipadas e exemplo em `/dev/patterns`.
