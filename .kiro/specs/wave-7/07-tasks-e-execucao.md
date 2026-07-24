# Tarefas consolidadas e execução multi-agente (fable + plugin rtk)

Backlog paralelizável derivado das specs 01–06. Cada tarefa é atómica e mapeada a um agente/worktree.

## Waves e agentes

| Wave | Agente (worktree) | Spec | Tarefas |
|---|---|---|---|
| 7.0 | `feat-doc-core` | 01 | T1..T8 (storage S3, presign, download, `<UploadDocumento>`, delta schema, infra, testes) |
| 7.1 | `feat-transporte` | 06 | T1..T7 (auditoria + de-mock + rotas + comandos + docs + E2E) |
| 7.1 | `feat-fornecedores` | 02 | T1..T5 (contactos create+gestão, docs upload, delete objeto, testes) |
| 7.1 | `feat-ativos` | 03 | T1..T4 (rota editar categorias, docs de activo) |
| 7.1 | `feat-stock` | 04 | T1..T6 (entrada/saída/transferência UI→actions, E2E) |
| 7.1 | `feat-rh-formacoes` | 05 | T1..T3 (rota nova + detalhe + E2E) |
| 7.2 | `orchestrator` | 00 | merge determinístico, migrations, gates, smoke, e2e |

## Dependências (arestas)
- `feat-fornecedores` (T3), `feat-ativos` (T2/T3), `feat-transporte` (T6) **dependem** de `feat-doc-core` (T5 `<UploadDocumento>` + T6 delta de schema).
- Tudo o resto é independente e arranca em paralelo no início da Wave 7.1.
- **Migrations** (delta de metadados de documento de `feat-doc-core` T6; campo `contactos` não altera schema) são geradas/aplicadas **só pelo orquestrador** na Wave 7.2 (`migrate diff` + `migrate deploy`, não-interativo).

## Ordem de merge determinística (Wave 7.2)
`feat-doc-core → feat-stock → feat-rh-formacoes → feat-ativos → feat-fornecedores → feat-transporte`

Conflitos aditivos esperados e resolução (padrão das waves anteriores):
- `src/components/patterns/index.ts` — export de `<UploadDocumento>` (só `feat-doc-core`).
- `prisma/schema/*.prisma` — deltas disjuntos por domínio; orquestrador consolida e gera **uma** migração `2000_wave7`.
- `rbac.ts` / `state-machines.ts` / `status-badge.tsx` — merge aditivo.
- `package.json` / `pnpm-lock.yaml` — `@aws-sdk/*` (só `feat-doc-core`); lockfile regenerado com `CI=true pnpm install --no-frozen-lockfile`.

## Configuração dos agentes
- **Orquestrador:** modelo `fable`; plugin `rtk` carregado. Não implementa features; detém merges, migrations, gates.
- **Cada agente `feat-*`:** 1 git worktree; plugin `rtk` carregado; lê a sua spec + `CLAUDE.md` + skills `{prisma,api,ui}-conventions`; corre `pnpm check` local antes de entregar; abre handoff em `docs/handoff/feat-<n>-<nome>.md`.
- **Gate de revisão:** agente `code-reviewer` por workstream antes do merge; BLOCKERs devolvidos ao agente por continuação de contexto (não recriar agente).

## Definition of Done (por workstream)
1. `pnpm check` verde no worktree.
2. Rotas novas testadas por **smoke autenticado** (o `check` não apanha crashes RSC/runtime).
3. Sem violações de `pnpm gates` (Dialog fora de AlertDialog; `'use client'` em page de listagem/detalhe; imports `@/data/`).
4. Testes novos (unit/property para regras; E2E para 1 fluxo com mutação).
5. Handoff escrito com dívida/decisões.

## Gates globais (só passam com tudo verde) — Wave 7.2
`pnpm check` · `pnpm gates` · `pnpm build` (standalone) · smoke autenticado das rotas novas · `pnpm e2e` · migração `2000_wave7` aplicada · seed atualizado se necessário.

## Esboço de prompt do orquestrador (fable + rtk)
> És o orquestrador (modelo `fable`, plugin `rtk`). Não implementas features. Provisiona 6 agentes `feat-*` (plugin `rtk`, 1 worktree cada) segundo as specs 01–06. Arranca `feat-doc-core` (Wave 7.0); quando entregar `<UploadDocumento>` e o delta de schema, liberta os 5 agentes da Wave 7.1 em paralelo. Recolhe pareceres do `code-reviewer` por workstream; devolve BLOCKERs por SendMessage. Faz merge na ordem determinística, consolida os deltas de schema numa migração `2000_wave7` (via `migrate diff`+`migrate deploy`, não-interativo), resolve conflitos aditivos, e só declara concluído com todos os gates da Wave 7.2 verdes. Atualiza `docs/status.md` no fim.
