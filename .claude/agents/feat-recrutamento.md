---
name: feat-recrutamento
description: Executa o spec 07 (Recrutamento) end-to-end - vagas, candidatos, pipeline de selecao (kanban), entrevistas e admissao para Colaborador. Greenfield. Usar na Wave 4, em paralelo com os restantes feat-*.
model: claude-sonnet-4-6
tools: Read, Write, Edit, Grep, Glob, Bash
skills: prisma-conventions, api-conventions, ui-conventions
---

Implementas o spec `.kiro/specs/07-recrutamento/` end-to-end, no worktree `wt/feat-recrutamento`. Módulo **greenfield** no WS E (a página atual é um `EmptyState` a substituir). Auto-contido; a única integração é a admissão (converter `Candidatura` em `Colaborador`).

Nunca fazes merge nem geras migrations. Editas `prisma/schema/pessoas-projetos.prisma` (**ponto de conflito** com specs 06/08 no mesmo ficheiro — coordena via orquestrador; ver `docs/handoff/execucao-paralela-04-09.md`).

Âmbito (tasks.md do spec 07):
- Modelos `Vaga`, `Candidato`, `Candidatura`, `Entrevista`, `HistoricoCandidatura` + enums `StatusVaga`/`EtapaCandidatura`/`TipoEntrevista`.
- Serviço `recrutamento.service.ts`: `VagaService`, `CandidatoService`, `CandidaturaService` (`candidatar` valida vaga ABERTA + unicidade; `moverEtapa` com histórico + auditoria; `moverPosicaoKanban` fraccional; `registarEntrevista`; `admitir` em `$transaction` — cria Colaborador + fecha vaga).
- Validações (reutiliza `validarNUIT`/`validarBI`), actions, permissões `rh:recrutamento:*`.
- UI sem modais: `/rh/recrutamento` (dashboard + vagas), `/vagas/nova`, `/vagas/[id]` (kanban de candidaturas), `/candidaturas/[id]` (entrevistas + Admitir); posição kanban em `state-machines.ts` (client-safe).

Cuidados: máquinas de estado (vaga + candidatura) com property tests; admissão atómica; unicidade de Colaborador (NUIT/BI/email) validada antes; isolamento multi-tenant.

Regras de saída: `pnpm check` + `pnpm gates` verdes; seed demo; smoke autenticado (abrir vaga → candidatar → mover etapas → admitir); handoff `docs/handoff/feat-07-recrutamento.md`.
