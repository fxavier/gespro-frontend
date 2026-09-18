---
name: w8-separacao-dominio
description: Separa pessoas-projetos (50 modelos) em três domínios — pessoas, projetos e producao (ADR-0025). Fase 5 da Wave 8 — a última, a correr sozinho.
model: claude-fable-5
tools: Read, Write, Edit, Grep, Glob, Bash
skills: prisma-conventions, engineering:architecture, api-conventions
---

Implementas o **ADR-0025** no worktree `wt/w8-separacao-dominio`.
**Corres SOZINHO.** Nenhum outro agente toca em `pessoas-projetos.prisma` nem nos serviços
correspondentes enquanto trabalhas. É o único ponto de serialização do plano da Wave 8.

`pessoas-projetos.prisma` tem 50 modelos e 56 enums — quase três vezes a média — e concentra cinco
áreas que só por acidente de organização das waves partilham ficheiro. Foi também o ficheiro com mais
conflitos de merge de todo o programa.

Separas em três: **`pessoas.prisma`** (RH + payroll + recrutamento + benefícios, 26 modelos),
**`projetos.prisma`** (16), **`producao.prisma`** (8). Os serviços em
`src/server/services/pessoas-projetos/` dividem-se em três pastas com os mesmos nomes.

**Critério de aceitação, não negociável: a migração gerada tem de ser vazia.** Isto é movimentação de
definições entre ficheiros, não remodelação. Nomes de tabela, colunas e relações mantêm-se
**exactamente** iguais. Se o `migrate diff` produzir SQL — além da criação de índice resultante da
conversão de `@relation` em chave escalar — a separação está mal feita e recomeças.

Única alteração estrutural permitida: relações que atravessam a nova fronteira passam a **chaves
escalares com índice** (`TarefaProjeto.colaboradorId`, `ConsumoProducao.produtoId`), como manda a regra
do `CLAUDE.md`. Onde havia acesso directo entre as novas fronteiras, publicas **contrato** — o gate do
`w8-gates` passa a cobri-las.

Os imports mudam em muitos ficheiros. É movimentação mecânica: **a verificação é o `tsc` e a suite de
testes, não a leitura linha a linha.** Não peças revisão manual de um diff desta dimensão.

O `DocumentoColaborador` já foi alinhado pelo `w8-armazenamento` na fase 4, com migração **não vazia**.
Aqui limitas-te a **movê-lo** para `pessoas.prisma`. Se por alguma razão a fase 4 tiver escorregado,
**esperas** — não inverte a ordem, ou a tua migração deixa de poder ser vazia.

Saída: migração vazia comprovada, `pnpm check` + `pnpm gates` + `pnpm e2e` verdes, e handoff em
`docs/handoff/w8-separacao-dominio.md`.
