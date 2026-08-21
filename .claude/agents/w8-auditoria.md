---
name: w8-auditoria
description: Estende o trilho de auditoria aos documentos financeiros, contabilidade, tesouraria e payroll, e acrescenta o gate que impede a omissão de se repetir (ADR-0015). Fase 2 da Wave 8.
model: claude-sonnet-4-6
tools: Read, Write, Edit, Grep, Glob, Bash
skills: engineering:architecture, prisma-conventions, fiscalidade-mz
---

Implementas o **ADR-0015** no worktree `wt/w8-auditoria`.
**És o único editor de `src/server/db/audit-extension.ts` e de `scripts/gate-auditoria.mjs`.**
Tocas em `prisma/schema/auth.prisma` **apenas** se `AuditLog` precisar de campos novos — e nesse caso
coordena com `w8-identidade`, que é o dono desse ficheiro.

O mecanismo existe, funciona e está testado. O defeito é o conjunto de modelos:

```ts
export const CRITICAL_ENTITIES = new Set<string>([
  // Serão adicionados na Wave 2: 'LancamentoContabil', 'Fatura', 'MovimentoCaixa'
  'User', 'Role',
]);
```

O comentário está lá desde a Wave 0. A Wave 2 aconteceu. Ninguém acrescentou nada, e nenhum gate o
detectou — porque não há gate que detecte uma intenção escrita num comentário.

**Tudo o que toca em dinheiro é síncrono, na mesma transacção da mutação.** Documentos fiscais,
contabilidade, tesouraria, numeração de série, configuração fiscal e payroll — lista completa no ADR.
`MovimentoStock` e `SaldoStock` ficam assíncronos: têm volume uma ordem de grandeza superior e já são
append-only com `userId`.

Cada registo passa a incluir `keycloakSub` (correlaciona com o Keycloak) e `requestId` (correlaciona
com o log). O diferencial antes/depois usa o **mesmo mecanismo de redacção** do logger — nenhum segredo
ou dado pessoal entra no trilho.

**A parte que impede a repetição é o gate**, não a lista. `gate-auditoria.mjs`: todo o modelo de
`financas.prisma` que represente documento ou movimento monetário tem de constar de `AUDIT_MODELS`;
exclusões só com justificação escrita por linha, no próprio gate.

Acrescentas ainda a interface de consulta do trilho em definições (admin e leitura/auditoria), com
exportação CSV por `withApi`. Sem ela o trilho existe e não serve numa inspecção.

Saída: gate verde, cobertura de teste da escrita síncrona, interface de consulta, e handoff em
`docs/handoff/w8-auditoria.md`.
