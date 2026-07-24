# Handoff — Spec 05 (Wave 7): RH Formações (`/rh/formacoes/nova` + detalhe `[id]`)

Branch: `ws-rh-formacoes` (worktree `wt/feat-rh-formacoes`).
`pnpm check` ✓ · `pnpm gates` ✓ · `pnpm build` ✓ · E2E `06-formacoes` ✓ (3/3).

Trabalho **puro de UI** (ADR-0003: backend já existia). Uma única adição de
serviço (`FormacaoService.obter`) porque não existia leitura por `id`.

## Âmbito e diagnóstico
- Backend já completo: `FormacaoService.{criar,actualizar,transitarStatus,inscreverColaborador,listar}`,
  schemas em `validations/rh.ts` (`CreateFormacaoSchema`, enums), actions em
  `rh.actions.ts` (`criarFormacaoAction`, `transitarStatusFormacaoAction`,
  `inscreverColaboradorFormacaoAction`). **Reutilizados sem alteração** de contrato.
- Estavam em falta as rotas `nova/` e `[id]/` (o botão "Nova Formação" e o clique
  numa linha davam 404). É o que foi criado.

## Ficheiros criados (relativos a `apps/erp/`)
- `src/app/(dashboard)/rh/formacoes/nova/page.tsx` — Server Component fino.
- `src/app/(dashboard)/rh/formacoes/nova/_components/nova-formacao-form.tsx` —
  `'use client'`, `react-hook-form` + `zodResolver(CreateFormacaoSchema)` (o **mesmo**
  schema do servidor), submit via `useActionState` → `criarFormacaoAction`,
  `UnsavedChangesGuard`, `FormPage`/`FormSection`. Redirecciona para o detalhe em sucesso.
- `src/app/(dashboard)/rh/formacoes/[id]/page.tsx` — Server Component; lê
  `FormacaoService.obter(id, ctx)` dentro de `runWithTenantContext`; `DetailShell`
  com abas Informações / Participantes + metadados. Carrega colaboradores ACTIVOS
  (excluindo já inscritos) só quando a formação aceita inscrições.
- `src/app/(dashboard)/rh/formacoes/_components/formacao-acoes.tsx` — `'use client'`,
  transições de estado com botões derivados de `TRANSICOES_FORMACAO`; `AlertDialog`
  para a confirmação destrutiva (cancelar).
- `src/app/(dashboard)/rh/formacoes/_components/inscrever-colaborador.tsx` —
  `'use client'`, `Select` + `inscreverColaboradorFormacaoAction`; regras (vagas,
  estado) validadas no serviço.
- `e2e/06-formacoes.spec.ts` — criar → detalhe → transitar (PLANEADA→EM_ANDAMENTO)
  → aparece na lista.

## Ficheiros alterados (aditivos, não quebram contratos)
- `src/server/services/pessoas-projetos/rh.service.ts` — **novo** `FormacaoService.obter(id, ctx)`:
  `findFirst` filtrado por `tenantId` (cross-tenant → `NotFoundError`, 404) com
  `include` de `participantes.colaborador {id,nome,codigo}`. Nenhum método existente tocado.
- `src/lib/state-machines.ts` — **novo** `TRANSICOES_FORMACAO` (client-safe, espelha
  o de `rh.interface.ts`, que é `server-only`) para o componente de acções.

## Risco do interceptor `nova` vs `@panel/(.)[id]` — resolvido por ausência
A listagem `rh/formacoes` **não usa parallel route `@panel`/interceptor**: a
`FormacoesTable` navega com `rowHref={/rh/formacoes/${id}}` directo. Logo o
segmento literal `nova` **não** é capturado por nenhum interceptor e não há a
colisão do golden standard. Confirmado no `pnpm build`: as três rotas aparecem como
`ƒ /rh/formacoes`, `ƒ /rh/formacoes/[id]`, `ƒ /rh/formacoes/nova` (dynamic, distintas).

## Permissões (rbac)
Sem alterações. As actions declaram `rh:formacoes:create` / `rh:formacoes:update`,
ambas já existentes no catálogo (`prisma/seed/rbac.ts`). A leitura do detalhe é
Server Component a chamar o serviço (sem permissão de action).

## Notas de convenção
- Formulário usa `useActionState` (golden standard `compras/requisicoes`), com
  `fieldErrors` do servidor mapeados via `setError` e datas como `Date`
  (coerce no `CreateFormacaoSchema`; number fields via `parseInt/parseFloat`).
- `StatusBadge` (mapa único) cobre os estados da Formação; os estados do
  Participante (`INSCRITO`, `PRESENTE`, …) caem no fallback `outline` do próprio
  `StatusBadge` — **não** foi criado mapa local nem alterado o mapa partilhado.

## Gaps / follow-ups (não bloqueantes)
- Estados de participante não têm variante/label dedicados no `StatusBadge`
  (fallback `outline` + texto cru). Se se quiser polimento, adicionar ao mapa único
  (merge aditivo pelo orquestrador) em vez de mapa local.
- Não há rota `[id]/editar` (fora do âmbito da spec; `actualizarFormacaoAction`
  existe e está pronta se se quiser adicionar).
- Gestão do estado do participante (marcar PRESENTE/APROVADO, nota, certificado)
  não faz parte desta spec — só inscrição.

## Como correu a verificação
- `pnpm check` → exit 0 (1148 testes, tsc/eslint verdes; warnings existentes são
  de ficheiros não relacionados).
- `pnpm gates` → dialog / use-client / data-imports todos PASSED.
- `pnpm build` → exit 0; rotas presentes.
- E2E: servidor de produção do worktree em porta livre (3055, porque 3000 estava
  ocupado por outro worktree e o `reuseExistingServer` do Playwright apontaria para
  a app errada); `BASE_URL=http://localhost:3055 playwright test --project=setup
  --project=e2e 06-formacoes` → 3 passed.
