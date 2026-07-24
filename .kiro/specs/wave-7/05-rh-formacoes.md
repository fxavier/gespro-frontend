# WS-RH-FORMACOES — Criar `/rh/formacoes/nova` (+ detalhe `[id]`)

**Wave 7.1 · independente.** 1 worktree. Trabalho quase todo de UI.

## Diagnóstico (confirmado)
- Backend **completo**: `FormacaoService` (`rh.service.ts`) tem `criar(CreateFormacaoInput)`, `actualizar`, `transitarStatus`, `inscreverColaborador`, `listar`. Schemas em `validations/rh.ts`: `CreateFormacaoSchema`, `UpdateFormacaoSchema`, `FilterFormacaoSchema`, `ModalidadeFormacaoEnum`, `StatusFormacaoEnum`. Actions em `rh.actions.ts`: `criarFormacaoAction`, `actualizarFormacaoAction`, `transitarStatusFormacaoAction`, `inscreverColaboradorFormacaoAction`.
- UI existente: `rh/formacoes/page.tsx` (lista, liga a `/rh/formacoes/nova` no botão "Nova Formação") + `formacoes-table.tsx` (`rowHref` → `/rh/formacoes/{id}`).
- **Em falta:** as rotas `rh/formacoes/nova/` e `rh/formacoes/[id]/` **não existem** → o botão "Nova Formação" (e o clique numa linha) dá 404.

## Requisitos
- **RF1** `/rh/formacoes/nova` apresenta um formulário que cria uma formação via `criarFormacaoAction` e redireciona para a lista/detalhe em sucesso.
- **RF2** `/rh/formacoes/{id}` (detalhe) mostra a formação, estado (máquina de estados), participantes e ações (transitar estado, inscrever colaborador) — usando as actions existentes.
- **RF3** Validação partilhada cliente/servidor com `CreateFormacaoSchema` (datas coerentes: `dataFim ≥ dataInicio`, já garantido pelo `.refine` do schema).

## Design
- **`rh/formacoes/nova/page.tsx`** (Server Component fino) → renderiza `nova/_components/nova-formacao-form.tsx` (`'use client'`): `react-hook-form` + `zodResolver(CreateFormacaoSchema)`, campos (título, descrição, modalidade `PRESENCIAL|ONLINE|HIBRIDO`, datas início/fim, vagas, formador/entidade, custo `Decimal`-safe), submit `useActionState` → `criarFormacaoAction`. `UnsavedChangesGuard`. Molde: `ferias/nova` ou `avaliacoes/nova` (formulários RH já existentes).
- **`rh/formacoes/[id]/page.tsx`** (Server Component): carrega a formação (confirmar leitura por `id` no `FormacaoService`; se faltar `obter(id, ctx)`, adicionar — filtro por `tenantId`, cross-tenant → `NotFoundError`). `DetailShell` com abas (Informações / Participantes). Ações: transitar estado (`transitarStatusFormacaoAction`, respeita `TRANSICOES_FORMACAO`), inscrever colaborador (`inscreverColaboradorFormacaoAction`) — regras já validadas no serviço (vagas esgotadas, estado ≠ PLANEADA/EM_ANDAMENTO).
- **Interceptor:** garantir que a listagem não usa `@panel/(.)[id]` a colidir com `nova`; se usar, o painel devolve `null` (bug conhecido do golden standard, `docs/status.md`).
- **Permissões:** confirmar catálogo `rbac.ts` para `rh:formacoes:*` (as actions já declaram `permission`); se faltar alguma usada só pela UI, adicionar (merge aditivo pelo orquestrador).

## Ficheiros afetados
`app/(dashboard)/rh/formacoes/nova/**` (novo), `app/(dashboard)/rh/formacoes/[id]/**` (novo), eventualmente `services/pessoas-projetos/rh.service.ts` (`obter` se faltar), `rbac.ts` (se faltar permissão).

## Tarefas
1. `T1` `nova/page.tsx` + `nova-formacao-form.tsx` ligado a `criarFormacaoAction`.
2. `T2` `[id]/page.tsx` (detalhe) + ações transitar/inscrever (+ `obter` no serviço se faltar).
3. `T3` E2E: criar formação → aparece na lista; transitar estado; inscrever colaborador respeita vagas.

## Critérios de aceitação
- Botão "Nova Formação" abre o formulário (sem 404); criar persiste e aparece na lista.
- Clique numa linha abre o detalhe (sem 404).
- `pnpm check` + `pnpm gates` + build + smoke verdes.
