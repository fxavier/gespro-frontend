# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Estado no GitHub

Destes cinco, só o `wontfix` existe hoje neste repositório (vem por omissão do
GitHub). Os outros quatro têm de ser criados antes do primeiro `/triage`:

```bash
gh label create needs-triage    --description "Precisa de avaliação do mantenedor"
gh label create needs-info      --description "À espera de mais informação de quem reportou"
gh label create ready-for-agent --description "Totalmente especificada — um agente pode pegar nela sem contexto humano"
gh label create ready-for-human --description "Precisa de implementação humana"
```

Os nomes ficam em inglês por serem metadados de repositório, a par dos labels
que o GitHub já criou (`bug`, `enhancement`, `wontfix`). A regra de Português de
Portugal do `CLAUDE.md` aplica-se à UI e às mensagens do produto, não a isto.
