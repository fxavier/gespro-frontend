# Tickets — DFC (issue #153, WS-2 da spec 22)

Fonte: [`intent.md`](intent.md). Substitui as tasks 9–15 de `.kiro/specs/22-fluxo-de-caixa/tasks.md` para a DFC:
acrescenta a versão do mapeamento (Q2), os limites no mesmo exercício (Q4) e a rubrica de caixa (Q6). Agente de
implementação: `feat-dfc`, na worktree `wt/feat-dfc`. Oráculos: `verificador-fluxo-caixa`.

**Ordem**: 0 → 1 → 2 → 3 → 4 → 5 → 6 → {7, 9} → 8 → 10 → 11.

- **Serializados** porque partilham ficheiros:
  - 1 e 4: `financas.prisma`, `tenant-bootstrap.ts` e as migrações;
  - 6 e 8: `contabilidade/dfc/`.
- **Em paralelo** a partir de 6: o 7 e o 9. O 9 só toca na rota de export.
- **Migrações**: ficam com o orquestrador, nunca com o agente. Não são ticket; são o passo marcado ⚙ dentro dos
  tickets 1 e 4.

## Desenho fixado por estes tickets (a emendar no ADR pelo ticket 0)

```prisma
enum AtividadeFluxo { OPERACIONAL INVESTIMENTO FINANCIAMENTO CAIXA }   // CAIXA: Q6
enum EstadoVersaoMapeamento { PENDING VALIDATED }                        // Q2; nomes: ADR-0037 E6

model VersaoMapeamentoFluxo {          // append-only; uma por alteração
  id            String   @id @default(cuid())
  tenantId      String
  numero        Int                    // 1, 2, 3… por tenant
  estado        EstadoVersaoMapeamento @default(PENDING)
  instantaneo   Json                   // rubricas + {contaId, rubricaId}[] desta versão
  validadoPorId String?
  validadoEm    DateTime?
  observacao    String?
  createdAt     DateTime @default(now())
  @@unique([tenantId, numero])
}
```

- **Onde vivem os dados**: `RubricaFluxoCaixa` e `MapeamentoContaFluxo` ficam como no ADR §2, e continuam a ser a
  cópia de trabalho que o `gerarDFC` lê. A versão guarda o instantâneo, para o histórico e para a auditoria.
- `// ponytail`: guardar o instantâneo em JSON evita duplicar centenas de linhas de mapeamento por cada alteração.
  O limite é que não se consulta por SQL. Se um dia for preciso comparar versões na base, passa a tabela filha.
- **Invariantes novos**, que se juntam aos I6 a I10 do ADR:
  - **V1**: o instantâneo da versão mais recente é igual, ao elemento, ao mapeamento vivo.
  - **V2**: qualquer escrita no mapeamento cria a versão `n+1` em `PENDING`, na mesma `$transaction`. Uma escrita
    que não muda nada não cria versão.
  - **V3**: só se valida a versão mais recente. Uma versão anterior recusa com `VERSAO_DESACTUALIZADA`. Validar é a
    **única** escrita permitida sobre uma versão.
  - **V4**: um intervalo com início e fim em exercícios diferentes recusa com `DFC_ENTRE_EXERCICIOS`.

---

- [ ] **0. Emendar e aceitar o ADR-0037** `[HUMANO]` `[BLOCKING]`
  - [ ] 0.1 Um agente redige a secção «Emenda 2026-09-25» em `docs/decisions/ADR-0037-demonstracao-fluxos-caixa.md`.
    Cobre o modelo acima, V1 a V4, a rubrica `CAIXA` (que substitui a «classe 1 mapeada como meios líquidos»), a
    exportação só em PDF (o CSV sai) e a permissão de validar (`:validar`, E5).
  - [ ] 0.2 **Humano**: rever a emenda, responder às Open Questions 2 e 5 e mudar o estado para `Aceite`. Nenhum gate
    verde substitui este passo.
  - ✅ Gate: `grep -c "Estado\*\*: Aceite" docs/decisions/ADR-0037-*.md` == 1 e `grep -c "Emenda 2026-09-25"` ≥ 1.

- [ ] **1. Fixar os contratos da DFC** `[BLOCKING]`
  - [ ] 1.1 `prisma/schema/financas.prisma`:
    - os modelos `RubricaFluxoCaixa`, `MapeamentoContaFluxo` e `VersaoMapeamentoFluxo`;
    - os enums `AtividadeFluxo` (com `CAIXA`), `SinalFluxo`, `OrigemRubrica` e `EstadoVersaoMapeamento`;
    - a relação de `CompromissoTesouraria.rubricaId`.

    Sem `prisma format`.
  - [ ] 1.2 `src/server/services/financas/dfc.interface.ts`:
    - `FiltroDFC { periodoInicioId, periodoFimId }`;
    - `DFC`, com as colunas N e N-1, `provisorio`, `versao { numero, estado }` e `avisos`;
    - `SeccoesDFC`, `VariacaoClassificada`, `ContaNaoMapeada`, `AvisoConfiguracao` e `InstantaneoMapeamento`.
  - [ ] 1.3 `src/lib/validations/fluxo-caixa.ts`: Zod de `FiltroDFC`, `MapearConta`, `CriarRubrica`,
    `DefinirContasCaixa` e `ValidarVersao`. Os ids usam `idEntidade()`, nunca `.cuid()`.
  - [ ] 1.4 ⚙ **Orquestrador**: migração `22b_rubricas_fluxo_caixa`, gerada com `migrate diff` e aplicada com
    `migrate deploy`.
  - ✅ Gate: `npx prisma validate`. `migrate diff --from-config-datasource --to-schema prisma/schema --script`
    devolve *empty migration*. `pnpm check` verde.

- [ ] **2. Escrever os oráculos antes do núcleo** `[BLOCKING]`. Escreve o agente `verificador-fluxo-caixa`, nunca
  o `feat-dfc`.
  - [ ] 2.1 `financas/__tests__/dfc.property.test.ts` (fast-check):
    - I6, articulação exacta em `Decimal`;
    - I8, aditividade dos meses;
    - V4, recusa entre exercícios;
    - `periodoHomologo`, que devolve o mesmo intervalo relativo no exercício N-1.
  - [ ] 2.2 `financas/__tests__/mapeamento-versao.property.test.ts`: V1, V2 e V3, contra um duplo **com estado**.
    Reutiliza `compras/__tests__/helpers/duplo-prisma.ts` se servir.
  - [ ] 2.3 `financas/__tests__/dfc-coerencia-caixa.test.ts`:
    - nenhuma conta `CAIXA` dá um impedimento;
    - uma conta `CAIXA` fora da classe 1, de agregação ou inactiva dá um aviso;
    - nenhum caso assume a classe 1 inteira como caixa.
  - ✅ Gate: `npx vitest run` sobre os três ficheiros falha **só** por import em falta (`dfc.model`/`dfc.service`);
    nenhum falha por asserção. O `feat-dfc` não toca nestes ficheiros daqui em diante: alterá-los é um BLOCKER.

- [ ] **3. Implementar o núcleo puro da DFC** `[BLOCKING]`
  - [ ] 3.1 `src/server/services/financas/dfc.model.ts`, sem Prisma nem I/O:
    - `classificarVariacoes`;
    - `montarSeccoesDFC`;
    - `verificarArticulacao`, que lança `DFC_NAO_ARTICULA` com o delta em `details`;
    - `periodoHomologo`;
    - `verificarMesmoExercicio`;
    - `coerenciaContasCaixa`, que devolve `{ impedimentos, avisos }`.
  - [ ] 3.2 `src/server/services/financas/mapeamento-versao.model.ts`: `instantaneoDe(rubricas, mapeamentos)` e
    `mudou(anterior, novo)`, com a igualdade estrutural que decide o V2 («escrita que não muda nada não cria
    versão»).
  - ✅ Gate: os testes do ticket 2 verdes, sem alterações. Mutação à mão, com as três mortas: tirar a
    `verificarArticulacao`, contar `CAIXA` numa actividade, e `mudou` a devolver sempre `true`.

- [ ] **4. Semear o mapeamento inicial** `[BLOCKING]` (inclui um passo `[HUMANO]` diferido)
  - [ ] 4.1 `prisma/seed/data/rubricas-fluxo-caixa.json`. Um agente propõe as rubricas `SISTEMA` e a rubrica de cada
    conta folha de `plano-contas-pgc.json`, incluindo as contas `CAIXA`. Cada conta tem de ter exactamente uma
    rubrica.
  - [ ] 4.2 `semearRubricasFluxo(tx, tenantId)` em `src/server/provisioning/tenant-bootstrap.ts`:
    - idempotente, com `createMany` e `skipDuplicates`;
    - cria a versão 1 em `PENDING` com o instantâneo;
    - é chamada por `bootstrapContabilidade`, `prisma/seed/financas.ts` e `seed/volume/base.ts`.
  - [ ] 4.3 ⚙ **Orquestrador**: migração `22c_semear_rubricas_fluxo`, com um `INSERT … SELECT … ON CONFLICT DO
    NOTHING` para os tenants que já existem, mais a versão 1 de cada um.
  - [ ] 4.4 Teste no `tenant-bootstrap.test.ts`:
    - toda a conta folha fica com exactamente um mapeamento (I7 sobre o seed);
    - correr duas vezes não duplica nada;
    - a versão 1 existe.
  - ✅ Gate: `npx vitest run src/server/provisioning/__tests__/tenant-bootstrap.test.ts` verde. Na base local, via
    `docker exec gespro-db psql`, o tenant `demo` tem 0 contas folha sem mapeamento e 1 versão `PENDING`.
  - ⏸ **[HUMANO]**: o conteúdo de 4.1 só está certo depois do parecer (ticket 11). O gate verde prova que a tabela
    **cobre** todas as contas, não que cada conta está na **actividade certa**.

- [ ] **5. Gerar a DFC no serviço**
  - [ ] 5.1 `src/server/services/financas/dfc.service.ts`: `gerarDFC(filtro, ctx)` pela ordem da design §4.2, com
    três passos novos:
    1. antes de tudo, `verificarMesmoExercicio`;
    2. na fase dos impedimentos, `coerenciaContasCaixa`;
    3. no fim, a coluna N-1 por `periodoHomologo`, que devolve `null` quando não há exercício anterior.

    Devolve `versao` e `avisos`.
  - [ ] 5.2 `contasNaoMapeadas(filtro, ctx)` devolve todas as contas de uma vez.
  - [ ] 5.3 Golden `financas/__tests__/fixtures/dfc-seed-demo.json`, escrita pelo `verificador-fluxo-caixa` sobre o
    exercício do `pnpm db:seed`, mais um teste de I9 contra a `gerarDRE` e um de I10 (cross-tenant → `NotFoundError`).
  - ✅ Gate:
    - a golden bate ao cêntimo;
    - a DFC do seed articula;
    - apagar um mapeamento no teste devolve `impedimentos` e **nenhum** mapa;
    - `pnpm check` verde.

- [ ] **6. Mostrar a DFC de ponta a ponta** (a primeira fatia visível)
  - [ ] 6.1 `prisma/seed/rbac.ts`: `financas:fluxo-caixa:leitura` para ADMIN, GESTOR, FINANCEIRO e LEITURA, e
    `financas:fluxo-caixa:configurar` para ADMIN e FINANCEIRO, e `financas:fluxo-caixa:validar` só para ADMIN
    (ADR-0037 E5). Depois, `pnpm db:seed`.
  - [ ] 6.2 `src/server/actions/fluxo-caixa.actions.ts`: `gerarDFCAction`, com `permiteEmLeitura: true`.
  - [ ] 6.3 `src/app/(dashboard)/contabilidade/dfc/page.tsx`, Server Component:
    - o `seletor-periodo` em intervalo;
    - a tabela OP, INV e FIN só com a coluna N;
    - a linha de articulação;
    - o badge «Provisório» e a faixa «Mapeamento por validar · versão n».
  - [ ] 6.4 A entrada «Demonstração de Fluxos de Caixa» no `AppSidebar.tsx`, junto da DRE, e no `CommandPalette.tsx`.
  - ✅ Gate: `pnpm build` verde. Um smoke autenticado (Playwright ad-hoc em `apps/erp/`, `networkidle`) em
    `/contabilidade/dfc` com o seed:
    - a linha de articulação mostra diferença 0,00;
    - a faixa «por validar» está visível;
    - com `operador@demo.mz`, aparece «Sem permissão».

- [ ] **7. Configurar o mapeamento, com versões**
  - [ ] 7.1 `dfc.service.ts`: `mapearConta`, `criarRubrica`, `editarRubrica`, `definirContasCaixa` e
    `validarVersao`.
    - Cada escrita no mapeamento é **singular** e cria a versão nova na mesma `$transaction` (V1, V2).
    - `validarVersao` bloqueia a versão com `FOR UPDATE` e recusa com `VERSAO_DESACTUALIZADA` (V3).
    - Apagar uma rubrica `SISTEMA` recusa com `RUBRICA_DE_SISTEMA`.
    - Os modelos entram em `AUDIT_MODELS`.
  - [ ] 7.2 As actions, com `financas:fluxo-caixa:configurar` (a de validar com `financas:fluxo-caixa:validar`) e `revalidate` de `/contabilidade/dfc` e
    `/contabilidade/fluxo-caixa/rubricas`.
  - [ ] 7.3 A UI em `/contabilidade/fluxo-caixa/rubricas`, com rotas dedicadas e sem modais:
    - a lista das rubricas por actividade;
    - a reatribuição de uma conta;
    - nova rubrica e editar rubrica;
    - as contas de caixa;
    - o histórico das versões, com estado, quem validou, quando e a observação;
    - «Validar versão actual», com observação. A observação é um campo de texto, por isso vai numa rota própria e não
      num `AlertDialog`.
  - ✅ Gate:
    - os testes do ticket 2.2 verdes contra o serviço real;
    - um teste de transição **nos dois sentidos**: validada → alterar → `PENDING` e faixa de volta → validar →
      `VALIDATED` e faixa fora;
    - um teste a garantir que nenhuma escrita usa `upsert` ou `*Many`;
    - `pnpm gates` verde.

- [ ] **8. Completar a página da DFC**
  - [ ] 8.1 A coluna N-1, com «—» quando não há exercício anterior.
  - [ ] 8.2 Os `KpiCard` de OP, INV, FIN e Δcaixa, e o gráfico de barras (`recharts`) por actividade, em módulo
    `'use client'`.
  - [ ] 8.3 A rubrica expande para as suas contas e a variação de cada uma. Cada conta liga a
    `/contabilidade/razao-geral` do mesmo intervalo.
  - [ ] 8.4 O bloco da reconciliação com a DRE: o resultado líquido e a ligação a `/contabilidade/dre` do mesmo
    intervalo.
  - [ ] 8.5 `impedimentos-painel.tsx` com a lista completa. Quem tem `:configurar` vê «Mapear», que abre a rota de
    reatribuição com `?voltar=/contabilidade/dfc…`; os outros vêem a indicação de a quem pedir. Os avisos de
    coerência da caixa aparecem acima da tabela.
  - ✅ Gate: `pnpm build` verde. `pnpm e2e:a11y` AA em `/contabilidade/dfc` nos dois temas. Smoke: o resultado
    líquido mostrado é igual ao da DRE do mesmo intervalo.

- [ ] **9. Exportar a DFC em PDF**
  - [ ] 9.1 `src/app/api/contabilidade/dfc/export/route.ts`: `withApi` com `GET` e `financas:exportar`.
    - O PDF usa o motor do ADR-0005, com as colunas N e N-1, a versão do mapeamento e as marcas «Provisório» e
      «Mapeamento por validar».
    - Se houver impedimentos, responde 422 com a lista, sem PDF.
  - [ ] 9.2 O botão «Exportar PDF» na página.
  - ✅ Gate: o teste da rota responde `application/pdf`, com o texto «Mapeamento por validar» quando a versão está
    `PENDING`, e responde 422 quando há impedimentos. O `GET` passa em modo Leitura.

- [ ] **10. Fechar o WS-2 com o E2E**
  - [ ] 10.1 `e2e/15-dfc.spec.ts`:
    1. desmapear uma conta com movimento e ver o impedimento;
    2. «Mapear»;
    3. voltar e gerar a DFC;
    4. validar a versão e ver a faixa desaparecer;
    5. alterar uma rubrica e ver a faixa voltar;
    6. exportar o PDF.
  - [ ] 10.2 Confirmar que o `gate-periodo` fica a zero: a DFC só lê `Lancamento`.
  - [ ] 10.3 Handoff em `docs/handoff/feat-22-fluxo-de-caixa.md`, secção WS-2.
  - ✅ Gate: `npx playwright test e2e/15-dfc.spec.ts` verde, a correr sozinho. `pnpm check && pnpm gates` verdes.
    Depois, `git checkout -- apps/erp/playwright/.auth/admin.json`.

- [ ] **11. Dar o parecer contabilístico** `[HUMANO]`
  - [ ] 11.1 Um contabilista moçambicano revê a tabela `rubricas-fluxo-caixa.json` face ao Decreto 70/2009.
  - [ ] 11.2 As correcções entram por um PR que altera 4.1. A golden (5.3) é **re-derivada à mão**, nunca com
    `vitest -u`.
  - [ ] 11.3 O parecer fica registado na UI (ticket 7, «Validar versão actual») de cada tenant real, com observação.
  - ✅ Gate: nenhum automático. Este ticket **não se fecha** com gates verdes: fecha-se com o parecer escrito no
    handoff e a versão em `VALIDATED`. Até lá, qualquer cliente real vê a faixa.

## Leitura dos gates, de cima a baixo

1. O ADR está aceite.
2. O schema está vazio de deriva.
3. Os oráculos existem e falham só por falta de código.
4. O núcleo cumpre-os, e as mutações morrem.
5. Todo o tenant nasce com todas as contas mapeadas.
6. A DFC do seed bate ao cêntimo e recusa quando falta um mapeamento.
7. Aparece no ecrã com diferença 0,00.
8. Alterar o mapeamento volta a pedir validação.
9. A página completa passa AA.
10. O PDF sai com as marcas.
11. O fluxo inteiro passa em E2E.
12. Um humano assina o mapeamento.
