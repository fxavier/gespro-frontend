# Requisitos: Recrutamento

## Introdução

O módulo `/rh/recrutamento` é atualmente um **stub** (`EmptyState`
"Recrutamento em breve"), sem schema, serviço, action ou UI real. Este spec
define o módulo de gestão de vagas e candidatos, integrado com o `Colaborador`
existente (admissão a partir de candidatura aprovada).

## Requisitos

### Requisito 1 — Vagas

1. O sistema DEVE permitir CRUD de `Vaga` (título, descrição, `departamentoId`,
   `cargoId`, número de posições, faixa salarial, regime, tipo de contrato,
   localização, data de abertura/fecho, requisitos).
2. Ciclo de vida da vaga: `RASCUNHO → ABERTA → EM_TRIAGEM → FECHADA/CANCELADA`.
   Transições inválidas → `BusinessRuleError`.
3. Uma vaga `ABERTA` DEVE aceitar candidaturas; `FECHADA`/`CANCELADA` não.

### Requisito 2 — Candidatos e candidaturas

1. O sistema DEVE registar `Candidato` (nome, contactos, BI/NUIT opcional, CV) e
   `Candidatura` que liga um candidato a uma vaga.
2. Unicidade: um candidato não se candidata duas vezes à mesma vaga
   (`@@unique([tenantId, vagaId, candidatoId]`).
3. Validação de documentos moçambicanos (BI/NUIT) quando fornecidos, reutilizando
   `validarNUIT`/`validarBI`.

### Requisito 3 — Pipeline de seleção

1. Cada candidatura percorre etapas configuráveis:
   `RECEBIDA → TRIAGEM → ENTREVISTA → PROPOSTA → CONTRATADO / REJEITADO / DESISTIU`.
2. A transição de etapa DEVE gerar histórico (etapa, data, responsável, notas) e
   auditoria.
3. O sistema DEVE registar `Entrevista` (data, entrevistadores, tipo, avaliação,
   parecer) associada à candidatura.

### Requisito 4 — Admissão (integração com Colaborador)

1. QUANDO uma candidatura chega a `CONTRATADO`, ENTÃO o sistema DEVE permitir
   **converter em `Colaborador`**, pré-preenchendo os dados do candidato, dentro
   de uma `$transaction` (cria colaborador + marca candidatura contratada +
   fecha/decrementa posições da vaga).
2. Fechar a vaga automaticamente quando as posições ficam preenchidas.

### Requisito 5 — UI sem modais

1. `/rh/recrutamento` (dashboard/lista de vagas), `/rh/recrutamento/vagas/nova`,
   `/rh/recrutamento/vagas/[id]` (detalhe + pipeline kanban de candidaturas),
   `/rh/recrutamento/candidaturas/[id]` (detalhe + entrevistas + admitir).
2. Server Components; folhas `'use client'`; kanban de candidaturas com posição
   fraccional (padrão de `TarefaProjeto.posicao`). Sem `Dialog` (excepto
   `AlertDialog`).

## Critérios de Aceitação

1. `pnpm check` verde; cobertura de serviços ≥ 80%.
2. Property test das máquinas de estado (vaga e candidatura); nenhuma sequência
   válida atinge estado inválido; conversão em colaborador é atómica.
3. Isolamento multi-tenant; substituição do `EmptyState` pela UI real.

## Fontes

- Colaborador e utils MZ: `prisma/schema/pessoas-projetos.prisma`,
  `src/lib/validations/mocambique.ts`. Padrão kanban: `TarefaProjeto`.
- Convenções: `CLAUDE.md`, `.claude/skills/{prisma,api,ui}-conventions`.
