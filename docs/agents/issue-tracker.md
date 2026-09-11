# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Contexto deste repositório

As issues estão **vazias** — não é sinal de projecto novo. O registo histórico do
que foi feito e do que falta vive noutro sítio, e é lá que se procura antes de
abrir uma issue duplicada:

- `docs/status.md` — fonte de verdade operacional do que está feito e da dívida
- `.kiro/specs/` — especificações por wave
- `docs/handoff/` — contratos entre domínios e entregas por spec

As issues são para trabalho **novo** que ainda não tem spec.

## Wayfinding operations

Como este repositório expressa os conceitos do skill `wayfinder`. O GitHub **não** tem
relação de bloqueio nativa fora dos Projects, mas **tem** sub-issues nativas — usam-se
essas para a árvore, e convenção no corpo para o bloqueio.

| Conceito | Como se exprime aqui |
|---|---|
| Mapa | Issue com o label `wayfinder:map` |
| Ticket | Issue com `wayfinder:{research,prototype,grilling,task}`, **sub-issue do mapa** |
| Filiação | Sub-issues nativas (árvore visível na UI do GitHub) |
| Bloqueio | Secção `## Blocked by` no corpo, com referências `#NN` |
| Reclamação | `assignee` — um ticket aberto e sem assignee está por reclamar |
| Fronteira | Aberto · sub-issue do mapa · sem assignee · todos os bloqueadores fechados |

```bash
# Ligar um ticket ao mapa (precisa do id interno, não do número; -F envia inteiro)
id=$(gh api repos/fxavier/gespro-frontend/issues/<NN> --jq '.id')
gh api -X POST repos/fxavier/gespro-frontend/issues/<MAPA>/sub_issues -F sub_issue_id="$id"

# Filhos do mapa
gh api repos/fxavier/gespro-frontend/issues/<MAPA>/sub_issues --jq '.[] | "#\(.number) \(.title)"'

# Candidatos a fronteira (por reclamar) — confirmar o "Blocked by" de cada um
gh issue list --state open --search "no:assignee" \
  --json number,title,labels --jq '.[] | select(.labels[].name | startswith("wayfinder:"))'

# Reclamar antes de trabalhar
gh issue edit <NN> --add-assignee @me
```

**Armadilha:** `-f sub_issue_id=...` envia string e a API devolve `Invalid request`. Tem
de ser `-F`.

**Investigação em paralelo:** lançar vários agentes de investigação na mesma árvore de
trabalho parte-a — cada um faz `git checkout` por cima do outro. Ou se lhes dá um
worktree isolado, ou se lhes diz para não tocarem no git e escreverem para fora do
repositório.
