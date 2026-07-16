# Plano de Implementação: Processamento Salarial (Payroll)

Depende de: WS D (lançamento/caixa/série — implementado) e WS C (comissões).
Módulo crítico → cobertura ≥ 90% no motor de cálculo.

- [ ] 1. Schema e migração
  - [ ] 1.1 Enums `TipoLinhaPayroll`/`NaturezaLinhaPayroll`; modelos `FolhaPagamento`, `LinhaPayroll`, `TabelaINSS`, `EscalaoIRPS`
  - [ ] 1.2 Relação `Payroll.folhaId` + `Payroll.linhas`
  - [ ] 1.3 Migração `06xx_payroll`

- [ ] 2. Motor de cálculo puro (`payroll-calculo.ts`)
  - [ ] 2.1 `calcularPayroll` (proventos, INSS 3%/4%, IRPS progressivo, líquido, custo total)
  - [ ] 2.2 `calcularIRPS` (escalão → taxa − parcela a abater)
  - [ ] 2.3 Property tests (liquido = bruto − descontos; IRPS monótono; INSS 3%; arredondamento)
  - [ ] 2.4 Golden tests contra exemplos oficiais (≥3 escalões) das fontes citadas

- [ ] 3. Serviço (`payroll.service.ts`)
  - [ ] 3.1 `processarFolhaMes` em `$transaction` (snapshots assiduidade/comissões/subsídios → cálculo → Payroll+linhas, idempotente)
  - [ ] 3.2 `marcarProcessada` → lançamento SALARIOS (WS D, débito==crédito)
  - [ ] 3.3 `marcarPaga` → movimento caixa/banco (WS D)
  - [ ] 3.4 `cancelar`, `recalcularPayroll`, `obterRecibo`, `listarFolhas`/`listarPayrolls`
  - [ ] 3.5 Interface + `TRANSICOES_PAYROLL`
  - [ ] 3.6 Property test: lançamento gerado tem débito == crédito

- [ ] 4. Validações e tabelas admin (`src/lib/validations/payroll.ts`)
  - [ ] 4.1 `ProcessarFolhaSchema`, `AjusteLinhaSchema`, `FilterPayrollSchema`
  - [ ] 4.2 `TabelaINSSSchema`, `EscalaoIRPSSchema` + gestão admin das tabelas

- [ ] 5. Actions e permissões
  - [ ] 5.1 `payroll.actions.ts` (processar/processada/paga/cancelar/recalcular) + `rh:payroll:*` no RBAC
  - [ ] 5.2 **Ligar** `/rh/payroll/novo` à `processarFolhaMesAction` (remover stub e inputs manuais de INSS/IRPS)

- [ ] 6. UI e documentos
  - [ ] 6.1 `/rh/payroll` (lista via serviço) + `/rh/payroll/[id]` (recibo)
  - [ ] 6.2 Recibo de vencimento PDF (Route Handler `withApi`)
  - [ ] 6.3 Mapas INSS e IRPS retido (CSV, Route Handler)
  - [ ] 6.4 Estados `StatusPayroll` no mapa `status-badge.tsx`

- [ ] 7. Seed e verificação
  - [ ] 7.1 `prisma/seed/payroll.ts` (TabelaINSS 3%/4% + EscalaoIRPS vigente + folha demo) com decreto documentado
  - [ ] 7.2 `pnpm check` + `pnpm gates` verdes
  - [ ] 7.3 Smoke autenticado: processar folha do mês → processada → paga → recibo
