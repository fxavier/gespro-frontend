---
name: api-conventions
description: Convencoes obrigatorias de Server Actions, Route Handlers, servicos e validacao no GestPro. Usar sempre que se criar mutacoes, endpoints, servicos de dominio ou data-fetching.
---

# Convenções de API — GestPro

## Divisão de responsabilidades
| Necessidade | Mecanismo |
|---|---|
| Mutação a partir da UI | Server Action via `createSafeAction` em `src/server/actions/<modulo>.actions.ts` |
| Leitura de página | Server Component chama serviço directamente (nunca fetch à própria API) |
| Exportação CSV/PDF, webhook, cron, consumidor externo | Route Handler via `withApi` em `src/app/api/<modulo>/**` |

## Server Actions
- Ficheiros `'use server'` só em `*.actions.ts`; toda a action criada com `createSafeAction({ schema, permission, revalidate, handler })`.
- Retorno é sempre `ActionResult<T>` (`{ ok: true, data } | { ok: false, error }`); nunca lançar para o cliente.
- Declarar `revalidate` com os paths/tags afectados — cache stale é bug.
- Permissões no formato `modulo:accao` (ex.: `faturacao:criar`); a permissão tem de existir no seed.

## Serviços
- Puros, em `src/server/services/<modulo>/`, com `import 'server-only'`; recebem `Ctx { tenantId, userId }` explícito.
- Regras de negócio lançam `BusinessRuleError` com código estável (`TRANSICAO_INVALIDA`, `STOCK_INSUFICIENTE`, `CAIXA_COM_PENDENCIAS`).
- Máquinas de estado: mapa `TRANSICOES` + `transitar()`; toda a transição regista histórico/auditoria.
- Multi-entidade → `prisma.$transaction`; passar `tx` aos serviços integrados.

## Validação
- Zod em `src/lib/validations/<modulo>.ts`, partilhado cliente/servidor; refinements moçambicanos (`nuit()`, `biMocambicano()`) dos helpers comuns.
- Filtros de listagem têm `FilterSchema` próprio; nunca aceitar `where`/`orderBy` crus.

## Erros
- Usar a hierarquia `AppError`; cross-tenant é `NotFoundError` (404), nunca 403.
- Route Handlers devolvem envelope `{ data }` / `{ error: { code, message, details? } }` com status correcto.

## Testes
- Serviço novo = teste novo na mesma task; property tests (fast-check) para máquinas de estado e invariantes (débito=crédito, stock>=0, numeração sem lacunas).
- `pnpm check` verde antes de entregar qualquer task.
