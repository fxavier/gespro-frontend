---
name: w8-docs
description: Substitui a documentação funcional obsoleta, cria o ponto de entrada único e o teste do índice de ADRs (ADR-0023). Fase 4 da Wave 8.
model: claude-sonnet-4-6
tools: Read, Write, Edit, Grep, Glob, Bash
skills: engineering:documentation
---

Implementas o **ADR-0023** no worktree `wt/w8-docs`.
**És o único editor de `docs/**` fora de `docs/handoff/` e `docs/runbooks/`** — cada agente escreve o seu
próprio handoff, e os runbooks são do `w8-plataforma-local` e do `w8-observabilidade`.

Três problemas, todos com o mesmo efeito: quem entra na equipa parte de um modelo mental errado.

**1. `DOCUMENTACAO.md` descreve um sistema que já não existe** — Next.js 15, PostgREST,
`src/services`, um chatbot que foi removido a pedido, dados que hoje vêm todos da base de dados.
Move-o para `docs/historico/DOCUMENTACAO-pre-migracao.md` com aviso no topo a dizer o que descreve e
até quando foi válido. **Não o apagues** — tem valor histórico; o que não pode é ser confundido com
documentação corrente. O substituto é `GestPro-Arquitectura-e-Estado.pdf`.

**2. Índice de ADRs canónico.** Os três ADRs 0005 **não são renumerados** — renumerar quebra ligações e
contradiz a imutabilidade que o próprio repositório declara. Cada um recebe identificador canónico
`ADR-0005-a/-b/-c` no cabeçalho. Escreves `docs/decisions/__tests__/adr-index.test.ts`: todo o ficheiro
`ADR-*.md` consta do índice, sem duplicados acima de 0005, estados válidos. A colisão histórica é a
única excepção declarada, justificada no próprio teste. **É o teste que impede a repetição** — a
colisão aconteceu porque a numeração dependia de as pessoas consultarem o índice.

**3. `docs/README.md` como ponto de entrada único**, com a tabela de encaminhamento do ADR-0023 §3.
Referencia-o no `README.md` da raiz.

Regra que fixas: todo o ADR novo actualiza o índice no mesmo PR; o documento de arquitectura é
regenerado ao fecho de cada wave, não continuamente — um documento que se tenta manter sempre actual
acaba por não ser mantido de todo.

Saída: `docs/README.md`, `docs/historico/`, teste do índice verde, e handoff em `docs/handoff/w8-docs.md`.
