# Prompts — Issue #153 · DFC (grafo `.claude/grafos/dfc.md`)

> Há duas maneiras de correr este grafo:
> - **Manual**: um prompt por nó (secção B), colado no Claude Code na raiz do repositório. Tu és o orquestrador.
> - **Orquestrado**: um único prompt (secção A) que conduz o grafo com subagentes e **pára** nos nós humanos,
>   nas migrações e em qualquer BLOCKER.
>
> Em qualquer dos modos, o loop de cada nó é o do `/no` (INSPECT → PLAN → IMPLEMENT → TEST → REVIEW em subagente
> novo → FIX → VERIFY → DONE). O grafo decide a ordem, quem escreve o quê e quem pode vetar.
> Substitui apenas o que está entre `<…>`.

## Índice

| # | Prompt | Nó | Quem corre | Verificador |
|---|---|---|---|---|
| 0 | `P0` | preparação | tu | worktree criada, agente verificador com os caminhos |
| 1 | `P-adr` | adr | agente redige, **tu aceitas** | grep do estado e da emenda |
| 2 | `P-contratos` + `PM 22b` | contratos | feat-dfc + tu | validate · diff vazio · check |
| 3 | `P-v oraculos` | oraculos | verificador | falha só por import |
| 4 | `P-autor nucleo` | nucleo | feat-dfc | oráculo verde + 3 mutações mortas |
| 5 | `P-v seed-v` → `P-autor seed` + `PM 22c` | seed | verificador → feat-dfc + tu | teste + psql |
| 6 | `P-v servico-v` → `P-autor servico` | servico | verificador → feat-dfc | golden ao cêntimo |
| 7 | `P-autor fatia` | fatia | feat-dfc | build + smoke |
| 8 | `PP` | config ∥ export | ver `PP` | ver `PP` |
| 9 | `P-autor pagina` | pagina | feat-dfc | build + a11y + smoke |
| 10 | `P-v e2e-v` → `P-autor fecho` | fecho | verificador → feat-dfc | e2e sozinho + check + gates |
| 11 | `PH` | parecer | contabilista | parecer escrito |

Depois de **cada** nó de autor: `PV` (adulteração) e `PR` (revisão). Depois de 3 falhas: `PF`.

---

## A. Modo orquestrado — um prompt

```
És o ORQUESTRADOR do grafo .claude/grafos/dfc.md (issue #153), segundo
docs/agentic/00-doutrina-loop-e-grafo.md. Não escreves código de produção nem testes: lanças cada nó num
subagente com o Task tool (o feat-dfc nos nós de autor, o verificador-fluxo-caixa nos nós -v, e o
code-reviewer num subagente novo para o REVIEW), geras as migrações ⚙, verificas a adulteração e fazes os merges
entre worktrees.

Lê primeiro, por inteiro: .claude/grafos/dfc.md (topologia, ajustes, regras, leitura obrigatória),
docs/agentic/issue-153/tickets.md, .claude/commands/no.md e docs/agentic/issue-153/prompts.md (secção B: é o
texto a dar a cada subagente).

Execução:
1. Corre P0. Se o nó `adr` não estiver FEITO, corre P-adr e PÁRA: a aceitação é minha.
2. Para cada nó pela ordem da tabela: verifica as dependências (FEITO + handoff); lança o subagente com o
   prompt da secção B; quando voltar, corre tu o gate do nó, exactamente o da tabela; depois de nós de autor, PV
   e PR. Gate verde, sem BLOCKER → marca FEITO na tabela do grafo, faz commit (pt-PT, um por nó) e segue.
3. ⚙ Nos nós contratos e seed, quando o subagente entregar o schema/seed, fazes tu o PM da migração e só
   depois corres o gate.
4. Depois de `fatia`, corre PP: config e export em paralelo, em duas worktrees, com dois subagentes lançados na
   mesma mensagem; merge de export em wt/feat-dfc antes de `pagina`.
5. Loop por nó: gate vermelho → devolve ao mesmo subagente (SendMessage) com a saída integral (texto de PF).
   À 3.ª volta falhada, ou ao 2.º BLOCKER, PÁRA e reporta-me.
6. PÁRA e pergunta-me também quando: um oráculo passar sem implementação; o PV detectar alteração a um ficheiro
   protegido; uma migração precisar de mexer em dados além dos INSERT previstos; um subagente propuser relaxar
   um invariante (é emenda ao ADR, não decisão tua).
7. No fim de `fecho`: abre o PR de wt/feat-dfc para main («feat(dfc): Demonstração de Fluxos de Caixa —
   WS-2 da spec 22», com «Refs #153», não «Closes»: o `parecer` fica aberto). Prepara o texto PH para eu
   enviar ao contabilista.

Relata-me no fim de cada nó numa linha: nó, gate, resultado, commit.
Nunca: vitest -u, prisma migrate dev, prisma format, INSERT directo em testes, push para main, marcar ADR Aceite,
criar sub-issues no GitHub sem o meu OK (Open Question 7).
```

---

## B. Prompts por nó (modo manual, ou texto para os subagentes)

### P0 — Preparação (tu)

```
Preparação do grafo .claude/grafos/dfc.md.
1. git fetch && git worktree add wt/feat-dfc -b ws-2-dfc origin/main && (cd wt/feat-dfc && CI=true pnpm install).
   Confirma que o WS-1 está na main: projecao.golden.test.ts verde em wt/feat-dfc.
2. O agente .claude/agents/verificador-fluxo-caixa.md só pode escrever em financas/__tests__/. Este grafo precisa
   também de apps/erp/src/server/provisioning/__tests__/, dos testes de apps/erp/src/app/api/contabilidade/dfc/
   e de apps/erp/e2e/18-dfc.spec.ts. Propõe-me o diff dessa secção do agente e espera pelo meu OK antes de o
   aplicar.
3. Confirma que e2e/18-dfc.spec.ts não existe e que ADR-0037 está «Proposto».
Relata e pára.
```

### P-adr — Nó `adr` (ticket 0)

```
/no dfc adr
Redige a secção «Emenda 2026-09-25» em docs/decisions/ADR-0037-demonstracao-fluxos-caixa.md:
- o modelo VersaoMapeamentoFluxo e os invariantes V1 a V4, tal como em docs/agentic/issue-153/tickets.md;
- a rubrica CAIXA, que substitui a «classe 1 mapeada como meios líquidos»;
- exportação só em PDF;
- permissão de validar.
Deixa as Open Questions 2 e 5 com a omissão proposta e marcadas «a decidir pelo humano». NÃO mudes o Estado.
Pára e mostra-me o diff.
```
Depois: respondes à Q2 e à Q5, mudas o Estado para `Aceite` e marcas o nó FEITO.

### P-contratos — Nó `contratos` (ticket 1)

```
/no dfc contratos
Usa o agente feat-dfc na wt/feat-dfc. Âmbito: tickets 1.1 a 1.3. A migração 1.4 NÃO é tua: quando o schema
validar, pára e diz-me «pronto para PM 22b».
```
Depois: `PM 22b` e o gate do ticket 1.

### P-v — Nós de oráculo (`oraculos`, `seed-v`, `servico-v`, `config-v`, `export-v`, `e2e-v`)

```
/no dfc <nó-v>
Usa o agente verificador-fluxo-caixa na wt/feat-dfc (em `export-v`, na wt/feat-dfc-export).
Escreves SÓ os testes do gate do ticket <n.º>, conforme .claude/grafos/dfc.md. Não escreves código de produção.
Critério de saída: o oráculo FALHA pela razão certa. No nó `oraculos` é import em falta; nos restantes é
asserção. Cola a saída vermelha em docs/handoff/dfc-<nó-v>.md. Se algum teste passar sem implementação, está
mal escrito: reescreve-o.
Regras: numRuns ≥ 1000; dinheiro com Decimal.equals(); datas em Africa/Maputo; cada invariante tem pelo menos
um caso que TEM de lançar. A golden (`servico-v`) deriva-se à mão do balancete e da DRE do seed, nunca de uma
corrida do serviço. O e2e (`e2e-v`) segue o ticket 10.1 e cria o estado pela UI.
Termina com o hash do commit dos testes; é a base do PV.
```

### P-autor — Nós de autor (`nucleo`, `seed`, `servico`, `fatia`, `config`, `export`, `pagina`, `fecho`)

```
/no dfc <nó>
Usa o agente feat-dfc na wt/feat-dfc (em `export`, na wt/feat-dfc-export). Âmbito: o ticket <n.º> de
docs/agentic/issue-153/tickets.md e a secção do nó em .claude/grafos/dfc.md, com os ajustes do grafo.
O teu verificador é o oráculo já escrito pelo nó -v (handoff docs/handoff/dfc-<nó>-v.md). NÃO tocas nos
ficheiros protegidos listados no grafo; alterar um é BLOCKER automático. Na fase TEST corres o oráculo, não o
escreves. VERIFY = o gate do ticket, exactamente como escrito, mais `pnpm check && pnpm gates` da raiz da
worktree.
Em `seed`: quando o JSON e o bootstrap estiverem prontos, pára e diz «pronto para PM 22c».
Em `fatia` e `pagina`: smoke autenticado com Playwright ad-hoc dentro de apps/erp/, à espera de networkidle.
Depois: git checkout -- apps/erp/playwright/.auth/admin.json.
3 voltas sem verde → pára e explica o bloqueio.
```

### PM — Migração (tu, orquestrador)

```
Migração <22b_rubricas_fluxo_caixa | 22c_semear_rubricas_fluxo> na wt/feat-dfc, a partir de apps/erp:
mig="prisma/migrations/$(date +%Y%m%d%H%M%S)_<nome>"; mkdir -p "$mig"
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema --script > "$mig/migration.sql"
Em 22c, acrescenta à mão o INSERT … SELECT … ON CONFLICT DO NOTHING das rubricas, dos mapeamentos e da versão 1
para os tenants existentes, com ids uuid como o tenant-bootstrap.
npx prisma migrate deploy; confirma que o diff seguinte é «empty migration»; pnpm db:seed duas vezes sem erros;
prisma generate; touch apps/erp/next.config.ts. Sem prisma format. Commit «chore(db): <nome>».
```

### PP — Paralelo `config` ∥ `export` (tu)

```
Depois de `fatia` FEITO:
1. git worktree add wt/feat-dfc-export -b ws-2-export <hash do commit de fatia>; CI=true pnpm install.
2. Na mesma mensagem, dois subagentes: (a) P-v config-v e depois P-autor config em wt/feat-dfc;
   (b) P-v export-v e depois P-autor export em wt/feat-dfc-export.
3. Cada ramo fecha com PV e PR próprios.
4. Merge de ws-2-export em ws-2-dfc (wt/feat-dfc). Conflito esperado: nenhum (o 9.2 passou para `pagina`). Se
   houver, resolve e corre pnpm check && pnpm gates antes de seguir para `pagina`.
5. git worktree remove wt/feat-dfc-export.
```

### PV — Verificação de adulteração (depois de cada nó de autor)

```
Usa o agente verificador-fluxo-caixa. Na worktree do nó <nó>:
git diff --stat <hash do nó -v>..HEAD -- <ficheiros protegidos de .claude/grafos/dfc.md>
Qualquer linha alterada → BLOCKER: reporta ficheiro e diff e pára. Confirma também que nenhum `.skip`/`.only`
foi introduzido e que numRuns não baixou.
```

### PR — Revisão (depois de cada nó de autor, subagente novo)

```
Usa o agente code-reviewer num subagente novo, sem o contexto de quem implementou. Skill revisao-dois-eixos
sobre o diff do nó <nó> (git diff <base do nó>..HEAD).
Eixo 1, convenções: prisma-, api- e ui-conventions; tenantId (findUnique não é scoped; cross-tenant → 404);
Decimal; escritas singulares e AUDIT_MODELS; versões append-only; permiteEmLeitura; RSC; format-date.
Eixo 2, fidelidade: o ticket <n.º>, os invariantes I6 a I10 e V1 a V4, e os ajustes do grafo.
Achados BLOCKER, MAJOR ou MINOR, com ficheiro:linha. Não inventes achados.
```

### PF — Reentrada após falha

```
O nó <nó> falhou o gate <n> vez(es). Saída integral do verificador:
<colar>
Diagnostica com a skill diagnosing-bugs (observar, reduzir, hipotetizar) antes de mudar código. Não alteres
ficheiros protegidos. Se concluíres que o oráculo está errado, NÃO o corrijas: escreve porquê e pára, porque é
decisão do verificador ou emenda ao ADR. Esta é a volta <n+1> de 3.
```

### PH — Parecer do contabilista (nó `parecer`, texto para uma pessoa)

```
O GestPro produz agora a Demonstração de Fluxos de Caixa pelo método indirecto (NCRF/PGC-NIRF, Decreto
70/2009). Cada conta de movimento do plano está atribuída a uma rubrica de uma de três actividades
(operacional, investimento, financiamento) ou marcada como caixa e equivalentes.

Pedimos o seu parecer sobre a tabela em anexo (rubricas-fluxo-caixa.json, exportada em folha de cálculo):
1. Cada conta está na actividade certa?
2. Faltam rubricas ou alguma sobra?
3. As contas de caixa e equivalentes estão correctas?

Junto seguem também a DFC do exercício de demonstração e a DRE e o balancete do mesmo período, para conferir a
articulação.

As correcções entram no sistema como uma versão nova do mapeamento. O seu parecer fica registado nessa versão,
com o seu nome, a data e as observações.
```
Depois do parecer: PR com as correcções ao 4.1, re-derivação **à mão** da golden (5.3) e «Validar versão actual»
com a observação em cada tenant real. Só então marcas `parecer` FEITO e fechas a #153.
