# Prompt — Executar o ciclo contabilístico (ADR-0033/0034/0035) com subagentes

> Cola o bloco abaixo no Claude Code, a partir da raiz do repositório `gespro/`.
> Põe o Claude Code a agir como orquestrador dos ADRs 0033 (exercício e períodos), 0034
> (apuramento do IVA) e 0035 (encerramento do exercício), com subagentes em worktrees
> separados e a skill `drill-with-docs` a abrir cada fase.
>
> **Pré-requisito humano**: os três ADRs estão em `Proposto`. As fases 0 e 1 não dependem
> disso; a fase 2 **depende** da confirmação legal do ADR-0034 contra o Boletim da República
> (Lei n.º 10/2025). Está escrito no prompt e o orquestrador tem de parar aí.
>
> `drill-with-docs` **não vive em `.claude/skills/` deste repositório** — resolve da instalação
> do utilizador. O prompt manda lê-la antes de a usar, em vez de assumir o que ela faz.

---

```text
Age como o agente `w8-orchestrator` do GestPro, mas para um programa novo: o ciclo
contabilístico e fiscal decidido nos ADR-0033, ADR-0034 e ADR-0035. Não escreves código de
features — coordenas, geras migrations e decides gates.

## REGRA ZERO — os ADRs são o design
`docs/decisions/ADR-0033-exercicio-contabilistico.md`,
`docs/decisions/ADR-0034-apuramento-iva.md` e
`docs/decisions/ADR-0035-encerramento-exercicio.md` são a especificação. Um agente que
contrarie o seu ADR está errado, mesmo que o código funcione e os testes passem. Se um ADR
estiver errado, PÁRA e escreve um ADR novo (ADR-0023: nunca se reescreve um aceite; o próximo
número livre está em `docs/decisions/README.md`). Não improvises uma terceira via no código.

## SKILL DE ABERTURA — `drill-with-docs`
Antes de lançar cada fase, e em cada subagente antes da primeira linha de código, invoca a
skill `drill-with-docs`. LÊ A SKILL PRIMEIRO e segue o que ela disser, à letra; o que se segue
é o âmbito a passar-lhe, não uma substituição do procedimento dela. Documentos de entrada,
por ordem:
  1. o ADR da fase (é o design);
  2. `CLAUDE.md` — regras invioláveis, migrations não-interactivas, gates;
  3. `.claude/skills/{prisma-conventions,api-conventions,ui-conventions,fiscalidade-mz}`;
  4. os ficheiros reais citados pelo ADR, com os números de linha — `git grep`, nunca `find`
     a partir da raiz (`wt/` tem 30 worktrees pré-monorepo e devolve o ficheiro certo no
     sítio errado; o ERP real está em `apps/erp/`);
  5. `docs/decisions/README.md` e `docs/status.md`.
A razão de ser desta skill neste programa está no ADR-0024: uma decisão escrita contra a
memória do sistema, e não contra o sistema, erra. O mesmo vale para a implementação.

## SETUP
  git switch -c ciclo-contabilistico
Um worktree por agente paralelo, criado só quando a fase arranca:
  git worktree add wt/ciclo-<nome> -b cc-<nome>
Ninguém faz merge senão tu, e só com parecer do `code-reviewer` sem BLOCKERs.
Migrations Prisma NUNCA são geradas por agentes — só por ti, no fim de cada fase, pelo
procedimento não-interactivo do CLAUDE.md (`migrate diff --from-config-datasource --to-schema
prisma/schema --script` + `migrate deploy`), e o `migrate diff` final tem de devolver
*empty migration*.

## FASE 0 — Os três achados. Sozinha, primeiro, mergida isolada.
O ADR-0033 lista três defeitos verificados (secção «Os três achados que bloqueiam esta
decisão»). Não são decisões, são correcções, e tudo o resto assenta neles: fechar um período
cujo balancete está errado é carimbar o erro com autor e data.
Agente: `domain-financas` (é o dono de `contabilidade.service.ts`). Skills:
`drill-with-docs`, `api-conventions`, `prisma-conventions`.
  A. O estorno inverte o balancete em vez de o zerar (`:450-502` + o filtro em `:659-670`).
  B. Rascunhos entram no balancete, no razão e na DRE (`:666`, `:696`, `:740`).
  C. A DRE devolve zero em todas as linhas de gasto — `saldoPrefixo('6.1')` contra códigos
     sem pontos (`:769-777`).
Exige um teste por achado, a trancar o comportamento correcto, ANTES da correcção — e que
cada teste falhe primeiro. Sem isso não se sabe se o defeito era o que se julgava.
GATE: `pnpm check` e `pnpm gates` verdes; os três testes novos vermelhos antes e verdes
depois; `balancete.test.ts` sem regressão. Merge isolado.

## FASE 1 — ADR-0033: exercício, períodos e trancamento. Sozinha.
Vai sozinha porque toda a escrita contabilística passa a ler o período: paralelizar isto é
garantir conflito em todos os caminhos de escrita.
Agente: `domain-financas`. Skills: `drill-with-docs`, `prisma-conventions`,
`api-conventions`, `estado-com-escritor`, `engineering:architecture`.
Âmbito, por secção do ADR: §1 modelos `ExercicioContabil`/`PeriodoContabil` + `Lancamento.periodoId`
(com `periodoFiscal` MANTIDA — é parte de `@@unique([tenantId, diarioId, periodoFiscal, numero])`);
§2 `periodoFiscalDe` em `Africa/Maputo`; §3 cron `/api/cron/abrir-exercicio` + criação preguiçosa;
§4 `proximoNumeroSerie` por data do documento; §5 `FOR SHARE`/`FOR UPDATE` no período; §6
pré-condições de fecho; §7 reabertura com motivo e registo; §9 `scripts/gate-periodo.mjs`.
Atenção a três coisas que o ADR obriga e que se esquecem:
  - §4 muda a assinatura em `devolucao.service.ts:171`, `encomenda.service.ts:270` e `:556`,
    `troca.service.ts:157`. São quatro linhas em `comercial` — declara que é o
    `domain-financas` que lhes toca, para não abrir um segundo worktree por quatro linhas, e
    avisa o `domain-comercial` de que não mexe nesses ficheiros nesta fase.
  - A rota `/api/cron/*` nova entra nos DOIS sítios (serviço `cron` do compose, perfil `full`,
    e `docs/runbooks/agendador.md`) ou não corre em lado nenhum. E corre sob `withApi`.
  - Três permissões novas em `prisma/seed/rbac.ts` (`financas:periodo:reabrir`,
    `financas:exercicio:abrir`, e `financas:fechar_periodo` passa a TER escritor). Nenhuma
    action nova leva `permiteEmLeitura` — fechar período é escrita (ADR-0032 §2).
MIGRATION (só tu): `periodoId` nasce nulo → backfill a partir de `periodoFiscal`, criando
exercícios e períodos a partir dos `periodoFiscal` distintos já gravados → só depois `NOT NULL`.
GATE: `pnpm check`, `pnpm gates` (com o quinto gate), `pnpm e2e` verdes; teste de concorrência
que prove que uma escrita não entra num período fechado entre a leitura e o commit; teste do
fuso na fronteira de mês (01-02 às 00h30 de Maputo cai em `2026-02`, não em `2026-01`);
`prisma migrate diff` a devolver empty. Merge isolado.

## PARAGEM OBRIGATÓRIA — confirmação legal do ADR-0034
A parte legal do ADR-0034 (Lei n.º 10/2025: fim dos regimes simplificado e de isenção, taxa
reduzida de 5 % sem dedução, prazos de dia 10 / dia 15 / último dia, Modelo A e Modelo E)
está apoiada em análises de consultoras e NÃO no articulado do Boletim da República. Antes da
fase 2, PÁRA e pede confirmação humana. Se não a tiveres:
  - NÃO inventes prazos nem nomes de modelos no código;
  - implementa na mesma a FORMA contabilística do apuramento (é estável e é o que o ADR decide),
    com prazos e modelos em tabela versionada por vigência, como `fiscalidade-mz` manda para o
    INSS e o IRPS;
  - abre issue no `fxavier/gespro-frontend` via `gh`, etiqueta `needs-info`, a pedir a
    confirmação, e cita a secção «O que não está conferido» do ADR.
Não marques nenhum destes três ADRs como `Aceite`. Isso é acto humano.

## FASE 2 — ADR-0034, dois agentes em paralelo (Task tool, as duas chamadas na MESMA mensagem)
CONGELA E COMUNICA O CONTRATO ANTES DE LANÇAR — é a fronteira entre os dois:
  reconhecimento da dívida ao fornecedor =
    D <gasto|existências>  +  D 4432{1|2|3}  /  C 421
  4432x escolhido por `ContaPagar.tipoAquisicao`: INVENTARIOS→44321, ATIVOS→44322,
    OUTROS_BENS_SERVICOS→44323
  sem `numeroDocumento` e `nuitFornecedor` não há dedução → `DOCUMENTO_FORNECEDOR_INCOMPLETO`
  a liquidação mantém-se `D 421 / C 121` e NÃO toca em IVA
  - `domain-compras` (ADR-0034 §1): bloco fiscal em `ContaPagar` (`compras.prisma`), enum
    `TipoAquisicaoIva`, e o lançamento de reconhecimento em `conta-pagar.service.ts` — que hoje
    só lança na liquidação (`:224-225`). Skills: `drill-with-docs`, `prisma-conventions`,
    `api-conventions`, `fiscalidade-mz`.
  - `domain-financas` (ADR-0034 §2-§9): modelo `ApuramentoIva` (`financas.prisma`), serviço de
    apuramento a ler do RAZÃO e não dos documentos, crédito reportável em 4438 com
    transferência explícita, os quatro códigos de recusa (`PRORATA_NAO_SUPORTADO`,
    `PERIODO_COM_RASCUNHOS`, `DOCUMENTO_SEM_LANCAMENTO`, `PERIODO_JA_APURADO`), estorno+versão
    vs regularização depois de `DECLARADO`, e as rotas de mapas
    `/api/financas/iva/mapas/[periodo]` no molde de `src/app/api/rh/payroll/mapas/*`.
    Skills: `drill-with-docs`, `prisma-conventions`, `api-conventions`, `fiscalidade-mz`.
Propriedade de schema, sem sobreposição: `compras.prisma` é do `domain-compras`;
`financas.prisma` e `plataforma.prisma` (o `regimeIva` que deixa de ser lido, §5) são do
`domain-financas`. `prisma/seed/rbac.ts` é teu — as três permissões novas
(`financas:iva:apurar`, `financas:iva:declarar`, `financas:iva:mapas`; só a terceira leva
`permiteEmLeitura: true`) escreves-as tu no merge, para os dois agentes não colidirem no
mesmo ficheiro.
NÃO reclassifiques tenants de `SIMPLIFICADO`/`ISENTO` para `NORMAL` (ADR-0034 §5): os valores
ficam mortos no enum, como o ADR-0032 §1 fez ao `EstadoAssinatura`.
GATE: `pnpm check`/`pnpm gates` verdes nos dois worktrees; teste que prove a invariante do §2
(depois do apuramento, 4435, 4433x, 4432x e 4434x ficam a zero no período); teste que prove que
o apuramento RECUSA com taxa reduzida em vez de calcular; teste de reprodutibilidade (recalcular
sobre o período fechado devolve o gravado). Merge: compras primeiro, finanças depois.

## FASE 3 — ADR-0035: encerramento. Sozinha, depois das fases 1 e 2.
Agente: `domain-financas`. Skills: `drill-with-docs`, `prisma-conventions`, `api-conventions`,
`fiscalidade-mz`, `engineering:architecture`.
Âmbito: §1 duas fases (`ENCERRADO_PROVISORIO`/`ENCERRADO`); §2 período 13; §3 as cinco contas
(81, 82, 83, 88, 59) a passarem a `aceitaLancamento: true` no `plano-contas-pgc.json` — são
FOLHAS, verifica-o antes e deixa o teste a trancá-lo; §4 os três lançamentos no diário `EN`;
§5 a aplicação do resultado FORA do encerramento; §6 abertura do seguinte a partir da
fotografia, com estorno e regeneração se o anterior reabrir; §7 pré-condições; §8
`EncerramentoExercicio` com a fotografia do balancete (código E NOME à data) e os PDF
arquivados pelo motor do ADR-0005-a no armazenamento do ADR-0017.
A parte mais fácil de implementar mal por instinto é a §5. Lê-a duas vezes.
MIGRATION (só tu): a alteração do plano de contas é `UPDATE` por código, idempotente, com teste
que fixa o resultado — é o primeiro precedente de alterar o plano depois do seed inicial.
GATE: `pnpm check`/`pnpm gates`/`pnpm e2e` verdes; encerramento completo de um exercício do
tenant `demo` com balanço a fechar; reabertura a estornar e a regerar a abertura do seguinte;
medição do encerramento num tenant `perf-*` (`pnpm db:seed:volume`) antes de dar por fechado.

## FASE 4 — UI, gates, E2E e docs, em paralelo
  - `ui-financas`: ecrãs de exercício/períodos, apuramento do IVA com os mapas, encerramento
    com as pré-condições TODAS mostradas de uma vez (não uma por tentativa). Sem modais; rotas
    dedicadas; `AlertDialog` só para o encerramento definitivo, que é irreversível. Skills:
    `drill-with-docs`, `ui-conventions`. Os estados novos entram no mapa único de
    `patterns/status-badge.tsx`, senão aparecem em bruto.
  - `w8-gates`: `gate-periodo.mjs` integrado no `pnpm gates` e no CI.
  - `qa-e2e`: um fluxo E2E que atravessa o ciclo inteiro — emitir, apurar IVA, fechar mês,
    encerrar ano, abrir o seguinte.
  - `w8-docs`: `docs/decisions/README.md` já tem a entrada dos três (não dupliques); actualiza
    `docs/status.md` e `CONTEXT.md`, e acrescenta um runbook do fecho mensal e anual em
    `docs/runbooks/`.

## RELATÓRIO
No fim de cada fase, um resumo CURTO: ficheiros tocados, decisões tomadas, desvios ao ADR (com
justificação), e o que ficou por fazer. O que o ADR marca como trabalho futuro — pro rata,
Modelo E, correcção de erros materiais de exercícios anteriores, período especial de tributação
— NÃO se implementa por iniciativa própria: abre issue com `needs-triage` e segue.
```
