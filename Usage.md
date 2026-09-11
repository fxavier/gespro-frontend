# Como se trabalha neste repositório

Guia para **pessoas**. O `CLAUDE.md` diz a um agente quais são as regras; o `docs/agents/*`
diz às skills quais são as convenções. Falta o resto: que ferramenta usar, por que ordem, e
o que já correu mal a quem tentou.

## Onde vive cada coisa

| Ficheiro | O que responde | Quando se lê |
|---|---|---|
| `CLAUDE.md` | As regras invioláveis e os comandos | Antes de escrever código |
| `CONTEXT.md` | **Só termos.** O glossário do domínio | Quando um nome está em disputa |
| `docs/decisions/` | Porque é que as coisas são assim | Antes de mudar um desenho |
| `docs/decisions/README.md` | O índice e **o próximo número livre** | Antes de escrever um ADR |
| `docs/status.md` | O que está feito e a dívida conhecida | Antes de abrir uma issue duplicada |
| `docs/handoff/` | Contratos entre domínios, entregas por spec | Ao tocar numa fronteira |
| `docs/research/` | Apuramentos externos, com nível de confiança | Quando a resposta não está no código |
| `docs/agents/` | Como as skills falam com este repositório | Raramente — as skills lêem-no por si |
| `.kiro/specs/` | As especificações por wave | Contexto histórico |

**A regra que se esquece:** o `CONTEXT.md` é um glossário e nada mais. Decisões vão para
`docs/decisions/`; estado vai para `docs/status.md`. Um glossário que vira bloco de notas
deixa de servir para o que serve.

## A cadeia, da ideia ao código

Nem tudo precisa de todos os passos. A maioria do trabalho começa no meio.

```
ideia vaga e grande          →  /wayfinder          →  mapa + tickets de decisão
ideia clara mas por afiar    →  /grill-with-docs    →  decisões + ADR + glossário
decisões tomadas             →  /to-spec            →  spec publicado
spec ou conversa             →  /to-tickets         →  fatias verticais, com bloqueios
ticket na fronteira          →  /implement          →  código, testes, revisão, commit
entrou uma issue de fora     →  /triage             →  categoria + estado + brief
```

**Duas transversais**, que não são passos da cadeia:

- **`/improve-codebase-architecture`** — quando a fricção é de forma, não de funcionalidade.
  Produz um relatório com candidatos de aprofundamento; não implementa nada.
- **`/code-review`** — o `/implement` já o chama no fim. Correr à mão quando se herda trabalho.

### Quando usar o quê

**`/wayfinder`** só quando o caminho **não se vê** e o trabalho não cabe numa sessão. Se já
consegue formular a pergunta com precisão, não é nevoeiro — é um ticket, e o mapa só acrescenta
burocracia. O teste é «consigo enunciar a pergunta agora?», não «consigo respondê-la agora?».

**`/grill-with-docs`** quando há uma decisão real a tomar, com alternativas reais. Entrevista
em rondas e escreve o glossário e o ADR à medida que as coisas assentam. Não o use para validar
um desenho já feito — não rende nada.

**`/to-tickets`** produz **fatias verticais**: cada ticket atravessa todas as camadas e é
demonstrável sozinho. A excepção é o *refactor largo*, que se sequencia como expandir-contrair:
primeiro a forma nova ao lado da velha, depois os chamadores em lotes, e só no fim a remoção.

## O quadro de issues

GitHub, via `gh`. PRs externos **não** entram na triagem (`docs/agents/issue-tracker.md`).

Cada issue triada leva **uma categoria** e **um estado**:

- Categoria: `bug` · `enhancement`
- Estado: `needs-triage` · `needs-info` · `ready-for-agent` · `ready-for-human` · `wontfix`

**`ready-for-agent` significa uma coisa concreta:** um agente pega nela sem contexto humano
nenhum. Se a issue exige uma decisão que ainda não foi tomada — que fornecedor, que prazo, que
permissão — não é `ready-for-agent`, é `needs-triage`. Pôr o label errado faz um agente escolher
por si o que era seu para escolher.

Issues são para trabalho **novo sem spec**. O histórico está no `docs/status.md`.

## Escrever um ADR

Governado pelo ADR-0023. Os quatro pontos que se falham:

1. **O número sai do `docs/decisions/README.md`**, onde está escrito. Não se infere listando a
   pasta: a numeração tem buracos e três ADRs colidem no 0005.
2. **O índice actualiza-se no mesmo commit.**
3. **Nunca se renumera** um ADR existente, nem se reescreve um aceite. Decisão que muda é ADR novo.
4. Português, e a forma de sempre: Contexto → Decisão → Alternativas (tabela, com ✅) → Consequências.

Só vale a pena se as três forem verdade: **difícil de reverter**, **surpreendente sem contexto**,
e **resultado de um compromisso real**. Falhando uma, não escreva.

## Armadilhas que já custaram tempo

**Ambiente**

- `prisma migrate dev` exige TTY e rebenta fora de um terminal. Para gerar migrations sem prompts,
  o `CLAUDE.md` tem a receita com `migrate diff` + `migrate deploy`.
- Renomear um valor de enum: o `migrate diff` gera *drop+recreate* e **perde dados**. Escreve-se
  o `ALTER TYPE … RENAME VALUE` à mão.
- `pnpm check` falha com o Postgres em baixo: três ficheiros `*-integracao` dão `ECONNREFUSED`, e
  o `skipIf` não detecta uma base inalcançável — só a variável de ambiente. **Antes de dizer que
  partiu alguma coisa, confirme com `git stash` que já falhava.**
- O que o `pnpm check` **não** apanha: erros de runtime RSC e erros que só o build de produção
  revela. Para UI, smoke autenticado ou `pnpm e2e`.

**`gh` e o GitHub**

- O espaço de numeração é **partilhado entre issues e PRs**. Um repositório com zero issues pode
  abrir a primeira no #31.
- Sub-issues: `gh api … -F sub_issue_id=<id>`. Com `-f` envia string e a API responde
  `Invalid request`. E é o **id interno**, não o número da issue.
- Não há bloqueio nativo fora dos Projects — usa-se secção `## Blocked by` no corpo.

**zsh**

- Não faz *word-splitting* de parâmetros sem aspas. `set -- $par` não parte em palavras; use
  `${=par}` ou `read -r a b`.
- `IFS=: read` parte nos dois pontos **dentro** do valor — foi assim que cinco labels
  `wayfinder:*` falharam em silêncio.

**Agentes**

- **Vários agentes na mesma árvore de trabalho pisam-se.** Se lhes mandar criar um ramo, o segundo
  faz checkout por cima do primeiro. Ou lhes dá um worktree isolado, ou lhes diz para não tocarem
  no git e escreverem para fora do repositório.
- **O scratchpad é efémero.** Investigação que interesse guardar tem de vir para `docs/research/`
  e ser commitada, ou o link aponta para o vazio na sessão seguinte.
- **Agentes retractam-se.** Nesta base já aconteceu duas vezes: um corrigiu-se sobre políticas de
  fornecedores, outro descobriu que citara um código legal revogado. **Verifique antes de publicar,
  e diga sempre o que verificou e o que não.** Um relatório que distingue as duas coisas vale mais
  do que um que soa seguro.
