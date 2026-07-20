# Plano de Implementação: Recrutamento

Módulo greenfield no WS E. Sem dependências cross-WS (integra só com Colaborador).

- [ ] 1. Schema e migração
  - [ ] 1.1 Enums `StatusVaga`/`EtapaCandidatura`/`TipoEntrevista`; modelos `Vaga`, `Candidato`, `Candidatura`, `Entrevista`, `HistoricoCandidatura`
  - [ ] 1.2 Migração `07xx_recrutamento`

- [ ] 2. Validações (`src/lib/validations/recrutamento.ts`)
  - [ ] 2.1 `VagaSchema`, `CandidatoSchema`, `CandidaturaSchema`, `EntrevistaSchema`, `MoverEtapaSchema`, `AdmitirSchema` (com `validarNUIT`/`validarBI`)

- [ ] 3. Serviço (`recrutamento.service.ts`)
  - [ ] 3.1 `VagaService` (CRUD + `transitarStatus`)
  - [ ] 3.2 `CandidatoService` + `CandidaturaService.candidatar` (valida vaga ABERTA + unicidade)
  - [ ] 3.3 `moverEtapa` (transição + `HistoricoCandidatura` + auditoria) + `moverPosicaoKanban`
  - [ ] 3.4 `registarEntrevista`
  - [ ] 3.5 `admitir` em `$transaction` (cria Colaborador + fecha vaga)
  - [ ] 3.6 Interface + `TRANSICOES_VAGA`/`TRANSICOES_CANDIDATURA`

- [ ] 4. Testes
  - [ ] 4.1 Unit ≥80%
  - [ ] 4.2 Property tests das máquinas de estado
  - [ ] 4.3 Teste de atomicidade da admissão + isolamento multi-tenant

- [ ] 5. Actions e permissões
  - [ ] 5.1 `recrutamento.actions.ts` + `rh:recrutamento:*` no RBAC

- [ ] 6. UI (substitui o EmptyState)
  - [ ] 6.1 `/rh/recrutamento` (dashboard + lista de vagas) + `/vagas/nova`
  - [ ] 6.2 `/rh/recrutamento/vagas/[id]` (detalhe + kanban de candidaturas)
  - [ ] 6.3 `/rh/recrutamento/candidaturas/[id]` (entrevistas + Admitir)
  - [ ] 6.4 Posição kanban fraccional em `state-machines.ts`; estados no `status-badge.tsx`

- [ ] 7. Verificação
  - [ ] 7.1 Seed demo (2 vagas, candidaturas em várias etapas)
  - [ ] 7.2 `pnpm check` + `pnpm gates` verdes
  - [ ] 7.3 Smoke autenticado: abrir vaga → candidatar → mover etapas → admitir
