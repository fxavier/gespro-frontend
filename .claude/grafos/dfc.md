# Grafo — Issue #153 · Demonstração de Fluxos de Caixa (WS-2 da spec 22)

- **Intenção**: `docs/agentic/issue-153/intent.md` · **Tickets**: `docs/agentic/issue-153/tickets.md`
- **ADR**: `docs/decisions/ADR-0037-demonstracao-fluxos-caixa.md` (emendado e aceite pelo nó `adr`)
- **Doutrina**: `docs/agentic/00-doutrina-loop-e-grafo.md` · **Prompts**: `docs/agentic/issue-153/prompts.md`
- Corre-se com `/no dfc <nó>`, um nó de cada vez. O orquestrador (tu, ou o prompt `P0`) decide a ordem.

## Topologia

Cada ticket cujo gate é um teste novo divide-se num **par de loops**: `<nó>-v` (o verificador escreve o
oráculo, que tem de falhar) e `<nó>` (o autor implementa até o oráculo passar). O grafo liga os pares;
cada par é um loop com verificador externo. ⚙ = migração, feita pelo orquestrador dentro do nó.

```
adr ─► contratos⚙ ─► oraculos ─► nucleo ─► seed-v ─► seed⚙ ─► servico-v ─► servico ─► fatia
                                                                                        │
                        ┌───────────────── wt/feat-dfc ────────────────────────────────┤
                        ▼                                                               ▼
                  config-v ─► config                                  export-v ─► export   (wt/feat-dfc-export)
                        └──────────────────────┬───────────────────────────────────────┘
                                               ▼  (orquestrador faz merge de export em feat-dfc)
                                            pagina ─► e2e-v ─► fecho ─► parecer [HUMANO]
```

| Nó | Ticket | Dono | Depende de | Verificador externo (gate) | Veto | Estado |
|---|---|---|---|---|---|---|
| `adr` | 0 | agente redige · **tu aceitas** | — | `grep -c "Estado\*\*: Aceite"` == 1 e `grep -c "Emenda 2026-09-25"` ≥ 1 | **humano** | FEITO |
| `contratos` | 1 | `feat-dfc` + ⚙ `22b` | adr | `prisma validate` · `migrate diff` vazio · `pnpm check` | code-reviewer | FEITO |
| `oraculos` | 2 | `verificador-fluxo-caixa` | contratos | os 3 ficheiros falham **só** por import em falta | orquestrador | FEITO |
| `nucleo` | 3 | `feat-dfc` | oraculos | ticket 2 verde **sem alterações** + 3 mutações mortas | verificador (adulteração) | FEITO |
| `seed-v` | 4.4 | `verificador-fluxo-caixa` | nucleo | casos novos de `tenant-bootstrap.test.ts` a falhar | orquestrador | FEITO |
| `seed` | 4.1–4.3 | `feat-dfc` + ⚙ `22c` | seed-v | teste verde · `psql`: 0 folhas sem mapeamento, 1 versão PENDING | verificador | FEITO |
| `servico-v` | 5.3 | `verificador-fluxo-caixa` | seed | golden `dfc-seed-demo.json` + I9 + I10 a falhar | orquestrador | por fazer |
| `servico` | 5.1–5.2 | `feat-dfc` | servico-v | golden ao cêntimo · articula · impedimento sem mapa · `pnpm check` | verificador | por fazer |
| `fatia` | 6 | `feat-dfc` | servico | `pnpm build` + smoke autenticado (0,00 · faixa · «Sem permissão» ao operador) | code-reviewer | por fazer |
| `config-v` | gate de 7 | `verificador-fluxo-caixa` | fatia | V1–V3 contra o serviço real, transição nos dois sentidos, sem `upsert`/`*Many` — a falhar | orquestrador | por fazer |
| `config` | 7 | `feat-dfc` | config-v | oráculo verde · `pnpm gates` | verificador + code-reviewer | por fazer |
| `export-v` | gate de 9 | `verificador-fluxo-caixa` | fatia | teste da rota: PDF com marca, 422 com impedimentos, GET em Leitura — a falhar | orquestrador | por fazer |
| `export` | 9.1 | `feat-dfc` (worktree própria) | export-v | oráculo verde · `pnpm check` | verificador + code-reviewer | por fazer |
| `pagina` | 8 + 9.2 | `feat-dfc` | config, export | `pnpm build` · `e2e:a11y` AA nos 2 temas · smoke: resultado = DRE | code-reviewer | por fazer |
| `e2e-v` | 10.1 | `verificador-fluxo-caixa` | pagina | `e2e/18-dfc.spec.ts` escrito e verde a correr sozinho | orquestrador | por fazer |
| `fecho` | 10.2–10.3 | `feat-dfc` | e2e-v | `pnpm check && pnpm gates` · `gate-periodo` a zero · handoff | orquestrador | por fazer |
| `parecer` | 11 | **contabilista** | fecho | nenhum automático: parecer escrito + versão VALIDATED | **humano** | por fazer |

## Ajustes aos tickets (decididos neste grafo)

1. **O botão «Exportar PDF» (9.2) passa para o nó `pagina`.** O ticket diz que o 9 «só toca na rota de
   export», mas o 9.2 mexe em `contabilidade/dfc/page.tsx`, o mesmo ficheiro do 8. Assim o `export` corre em
   paralelo com o `config` sem conflito.
2. **O E2E chama-se `e2e/18-dfc.spec.ts`**, não `15-dfc`: o número 15 já é da reconciliação, e o 16 e o 17 são
   das issues #78 e #77.
3. **Os testes que julgam um ticket são escritos pelo verificador**, também nos tickets 4, 5, 7, 9 e 10, e não
   só no 2 (doutrina §5). Daí os nós `-v`.
4. **`desmapearConta(contaId, ctx)` entra no nó `config` (ticket 7.1)**, decidido pelo orquestrador depois da revisão
   do `contratos` (m4). É uma escrita singular, com `NotFoundError` cross-tenant e versão n+1 (V2). Sem ela, o E2E
   10.1 («desmapear uma conta com movimento») só podia retirar contas de caixa e nunca exercitava o I7 numa
   actividade. Custa uma action e a linha «Desmapear» na UI de rubricas. O oráculo do `config-v` cobre-a.

## Regras deste grafo (prevalecem sobre `/no` quando colidem)

- **Ficheiros protegidos.** Depois de o nó `-v` respectivo fechar, o `feat-dfc` não lhes toca. Alterar um é
  **BLOCKER automático**, verificado pelo orquestrador no fim de cada nó de autor com
  `git diff --stat <commit do nó -v>..HEAD -- <lista>`:
  - `apps/erp/src/server/services/financas/__tests__/{dfc.property,mapeamento-versao.property,dfc-coerencia-caixa}.test.ts`
  - `apps/erp/src/server/services/financas/__tests__/fixtures/dfc-seed-demo.json` e os testes de I9/I10
  - os casos DFC de `apps/erp/src/server/provisioning/__tests__/tenant-bootstrap.test.ts`
  - os testes de `config-v` e de `export-v`
  - `apps/erp/e2e/18-dfc.spec.ts`
- **A fase TEST do `/no`, nos nós do `feat-dfc`, corre o oráculo; não o escreve.** O autor pode acrescentar
  testes acessórios, mas só fora dos ficheiros protegidos.
- **Nós `-v`**: o critério de saída é o oráculo a falhar pela razão certa (asserção, ou import em falta no
  `oraculos`, como o ticket 2 fixa). A saída vermelha vai colada no handoff do nó. Um oráculo que passa sem
  implementação está mal escrito.
- **Migrações** ⚙ (`22b` no `contratos`, `22c` no `seed`): só o orquestrador, com `migrate diff` não-interactivo
  e `migrate deploy`. Nunca `migrate dev`, nunca `prisma format`.
- **Golden**: `vitest -u` é proibido. A re-derivação (ticket 11.2) é à mão, com o raciocínio no PR.
- **Paralelismo**: só `config` ∥ `export-v`/`export`. O `export` corre numa worktree própria
  (`git worktree add wt/feat-dfc-export -b ws-2-export <commit da fatia>`). O orquestrador faz merge dela em
  `wt/feat-dfc` antes do `pagina`. Tudo o resto é sequencial: partilha `financas.prisma`,
  `tenant-bootstrap.ts` ou `contabilidade/dfc/`.
- **Paragem**: 3 voltas falhadas em qualquer loop → pára, escreve o que tentou e devolve ao orquestrador. O
  segundo BLOCKER do code-reviewer no mesmo nó também pára o nó.
- **Humano**: `adr` e `parecer` não fecham com gates verdes. O `seed` fecha com cobertura, **não** com
  correcção contabilística: a tabela 4.1 só está certa depois do `parecer`.

## Leitura obrigatória antes de qualquer nó

- `docs/agentic/issue-153/intent.md` e `tickets.md` — o ticket do nó, **inteiro**, com o gate.
- `docs/decisions/ADR-0037-demonstracao-fluxos-caixa.md`, incluindo a «Emenda 2026-09-25» depois do nó `adr`.
- `.kiro/specs/22-fluxo-de-caixa/design.md` §2 (schema), §4.2 (ordem do `gerarDFC`).
- `.claude/skills/fluxo-de-caixa-conventions/SKILL.md` e `prisma-conventions`, `api-conventions`,
  `ui-conventions`, `estado-com-escritor`.
- `apps/erp/src/server/services/financas/contabilidade.service.ts`: `montarLinhasBalancete`,
  `calcularLinhasDRE`/`gerarDRE`, `saldoContabilAte` e `FILTRO_LANCAMENTO_MAPA`. **Reutilizar, não reescrever.**
- `apps/erp/src/server/services/financas/projecao.service.ts`, para ver como o WS-1 lê saldos do razão.
- `CLAUDE.md`: «Exercício e período», «Datas», «Auditoria só vê escritas singulares», «Configuração por tenant
  nova», «Permissões novas», «Modo de leitura».

## Âmbito por nó

O ticket é a especificação: não o repitas, cumpre-o. Aqui fica só o que o ticket não diz.

### `adr`
O agente redige a emenda e **pára**. Tu respondes às Open Questions 2 e 5, e mudas o estado. O agente
**não** marca `Aceite`.

### `contratos`
O ⚙ `22b` fecha o nó. `CompromissoTesouraria.rubricaId` passa a relação: confirma que o WS-1 continua verde
(`projecao.golden.test.ts`).

### `oraculos`
`numRuns ≥ 1000` e comparação por `Decimal.equals()`. Os geradores incluem 44331 e 421, a fronteira de
exercício e contas `CAIXA` fora da classe 1. O duplo do 2.2 tem **estado**: a transição V2 mede-se nele, não
num mock que devolve fixo.

### `nucleo`
Sem Prisma nem I/O. As três mutações do gate fazem-se à mão, e o relatório mostra, para cada uma, o teste que a
matou.

### `seed-v` / `seed`
O verificador escreve os casos do 4.4. O autor propõe o 4.1, com uma linha de justificação por conta num
comentário do PR, para o `parecer`. O ⚙ `22c` fecha o nó. O `db:seed` corre duas vezes sem duplicar nada.

### `servico-v` / `servico`
A golden deriva-se do exercício do seed **à mão** (balancete e DRE existentes), nunca de uma corrida de
`gerarDFC`.

### `fatia`
A primeira coisa visível. Pede um smoke autenticado real, porque o `pnpm check` não apanha erros RSC.

### `config-v` / `config`
O teste da transição nos dois sentidos é o da skill `estado-com-escritor`, contra o serviço real, sem
`INSERT` directo. «Validar versão actual» é uma rota com formulário, não um `AlertDialog`.

### `export-v` / `export`
O motor de PDF corre só em runtime Node. `withApi` `GET` com `financas:exportar`. Havendo impedimentos,
responde 422 sem PDF.

### `pagina`
Inclui o 9.2. O gráfico e as colunas com funções ficam em módulos `'use client'`. As datas passam por
`format-date.ts`.

### `e2e-v` / `fecho`
O `18-dfc.spec.ts` segue o 10.1 à letra. O `fecho` confirma o `gate-periodo` e escreve o handoff na secção
WS-2 de `docs/handoff/feat-22-fluxo-de-caixa.md`.

### `parecer`
Texto para o contabilista: prompt `PH` de `docs/agentic/issue-153/prompts.md`.
