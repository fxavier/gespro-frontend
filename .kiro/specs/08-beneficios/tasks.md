# Plano de Implementação: Benefícios

Módulo greenfield no WS E. Integra com Payroll (spec 06) via função de contrato.

- [ ] 1. Schema e migração
  - [ ] 1.1 Enums `TipoBeneficio`/`PeriodicidadeBeneficio`/`StatusBeneficioColaborador`; modelos `Beneficio`, `BeneficioColaborador`
  - [ ] 1.2 Relação `Colaborador.beneficios`
  - [ ] 1.3 Migração `08xx_beneficios`

- [ ] 2. Validações (`src/lib/validations/beneficios.ts`)
  - [ ] 2.1 `BeneficioSchema`, `AtribuirBeneficioSchema`, `FilterBeneficioSchema`

- [ ] 3. Serviço (`beneficios.service.ts`)
  - [ ] 3.1 `BeneficioService` (CRUD)
  - [ ] 3.2 `BeneficioColaboradorService` (`atribuir` com elegibilidade + não-duplicação; `terminar`/`suspender`; `listarPorColaborador`)
  - [ ] 3.3 `linhasPayrollDeBeneficios` (contrato para o spec 06)
  - [ ] 3.4 Interface

- [ ] 4. Testes
  - [ ] 4.1 Unit ≥80% + não-duplicação de período
  - [ ] 4.2 Teste da integração `linhasPayrollDeBeneficios` (tributável vs não) + isolamento multi-tenant

- [ ] 5. Actions e permissões
  - [ ] 5.1 `beneficios.actions.ts` + `rh:beneficios:*` no RBAC

- [ ] 6. UI (substitui o EmptyState)
  - [ ] 6.1 `/rh/beneficios` (catálogo) + `/novo`
  - [ ] 6.2 `/rh/beneficios/[id]` (detalhe + atribuídos) + `/atribuir`
  - [ ] 6.3 Relatório de custos (query agregada) + estados no `status-badge.tsx`

- [ ] 7. Verificação
  - [ ] 7.1 Seed demo (benefícios + atribuições)
  - [ ] 7.2 `pnpm check` + `pnpm gates` verdes
  - [ ] 7.3 Smoke autenticado + (se spec 06 pronto) linha de benefício numa folha
