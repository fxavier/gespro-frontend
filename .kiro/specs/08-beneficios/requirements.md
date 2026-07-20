# Requisitos: Benefícios

## Introdução

O módulo `/rh/beneficios` é atualmente um **stub** (`EmptyState` "Gestão de
benefícios em breve"), sem schema, serviço, action ou UI. Este spec define a
gestão de benefícios/regalias (seguro de saúde, subsídios, planos) e a sua
atribuição a colaboradores, com ligação ao processamento salarial (spec 06).

## Requisitos

### Requisito 1 — Catálogo de benefícios

1. O sistema DEVE permitir CRUD de `Beneficio` (nome, tipo, descrição,
   fornecedor/seguradora, custo, periodicidade, regra de comparticipação
   empresa/colaborador, se é tributável).
2. Tipos suportados: seguro de saúde, seguro de vida, subsídio (alimentação,
   transporte, habitação, comunicações), plano de pensões, outro.

### Requisito 2 — Atribuição a colaboradores

1. O sistema DEVE permitir atribuir/remover benefícios a `Colaborador`
   (`BeneficioColaborador`), com data de início/fim e valores efectivos
   (comparticipação empresa vs desconto colaborador).
2. Um colaborador não DEVE ter o mesmo benefício activo duplicado no mesmo período
   → `BusinessRuleError('BENEFICIO_DUPLICADO')`.
3. Elegibilidade opcional por departamento/cargo/tipo de contrato.

### Requisito 3 — Integração com Payroll

1. QUANDO uma folha é processada (spec 06), ENTÃO os benefícios activos do
   colaborador DEVEM originar linhas de payroll: provento (comparticipação
   tributável) e/ou desconto (parte do colaborador), conforme a regra do benefício.
2. Benefícios tributáveis integram a base de IRPS; não tributáveis não.

### Requisito 4 — Custos e relatórios

1. O sistema DEVE reportar o custo total de benefícios por período, por tipo e por
   departamento (encargo da empresa), por agregação dedicada (sem N+1).

### Requisito 5 — UI sem modais

1. `/rh/beneficios` (catálogo/lista), `/rh/beneficios/novo`,
   `/rh/beneficios/[id]` (detalhe + colaboradores atribuídos),
   `/rh/beneficios/atribuir` (atribuição). Server Components; folhas `'use client'`;
   sem `Dialog` (excepto `AlertDialog`); `Decimal`→`string`.

## Critérios de Aceitação

1. `pnpm check` verde; cobertura ≥ 80%.
2. A integração com o payroll gera as linhas correctas (teste conjunto com spec 06).
3. Isolamento multi-tenant; substituição do `EmptyState` pela UI real.

## Fontes

- Colaborador e subsídios já existentes em
  `prisma/schema/pessoas-projetos.prisma`. Integração com spec 06 (Payroll).
- Convenções: `CLAUDE.md`, `.claude/skills/{prisma,api,ui}-conventions`.
