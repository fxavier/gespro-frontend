# Handoff — grafo `dfc`, nó `config` (ticket 7)

- **Data**: 2026-09-26 · **Grafo**: [`.claude/grafos/dfc.md`](../../.claude/grafos/dfc.md) · **Destranca**: `pagina`
- **Depende de**: `config-v` (FEITO, [`dfc-config-v.md`](dfc-config-v.md)) sobre HEAD `7a89e07` (ramo `ws-2-dfc`, worktree `wt/feat-dfc`)
- **Agente**: `feat-dfc`. Sem commit e sem migração. O grafo não foi marcado. A base local foi escrita **só pelo smoke**
  (ver «Estado da base»).
- **Voltas**:
  - oráculo: 1 (56/56 à primeira);
  - smoke: 3. As duas primeiras deram timeout em `networkidle` na página de rubricas. A causa foi um prefetch
    pendente de `/contabilidade/fluxo-caixa`, que não tinha página (ver «Achados»).

## Gate do ticket 7

| Verificador | Resultado |
|---|---|
| `npx vitest run …/dfc-config.test.ts` | **56/56** ✅ (autoteste do duplo: 11/11) |
| ficheiros protegidos | `git diff --stat 7a89e07 -- …/__tests__ …/export/__tests__ …/provisioning/__tests__ playwright/.auth/admin.json` **vazio** ✅ |
| `npx tsc --noEmit -p .` | 0 erros ✅ |
| `pnpm gates` | 5/5 ✅ (`gate-periodo` a zero) |
| `pnpm check` **antes** do smoke | só o vermelho aceite (`projecao.golden`, `compromissosManuais` 1 vs 0). 146/147 ficheiros, 2057 testes ✅ |
| `pnpm check` **depois** do smoke | 3 vermelhos: o aceite **e** a sentinela da golden DFC, em `dfc.golden` e `dfc.impedimentos-isolamento`. Ver «Estado da base». ⚠️ |
| `pnpm --filter erp build` | verde ✅. As 8 rotas novas são `ƒ`. |
| smoke autenticado (`next start -p 3010`) | **23/23** ✅, 0 erros de consola ou de página |

## Entregue

| Ficheiro | O quê |
|---|---|
| `apps/erp/src/server/services/financas/dfc.service.ts` | 7.1. Os escritores `mapearConta`, `desmapearConta`, `criarRubrica`, `editarRubrica`, `eliminarRubrica` e `definirContasCaixa` passam todos por `escreverVersionado`. As leituras são `validarVersao`, `versaoAtual`, `listarVersoes`, `listarRubricas` e `listarMapeamentos`, e para a UI há ainda `painelConfiguracao`, `obterRubrica`, `obterContaParaMapear` e `historicoVersoes`. `dfcService` passa a `satisfies IDfcService`, com o contrato inteiro. |
| `…/financas/dfc.interface.ts` | `desmapearConta` entra no `IDfcService` (ajuste 4). `ERROS_DFC` ganha 5 códigos novos (ver «Decisões»). Tipos da UI: `PainelConfiguracaoDFC`, `ContaResumoDFC` e `VersaoComValidador`. |
| `apps/erp/src/server/db/audit-extension.ts` | `RubricaFluxoCaixa`, `MapeamentoContaFluxo` e `VersaoMapeamentoFluxo` entram em `AUDIT_MODELS`. |
| `apps/erp/src/server/actions/fluxo-caixa.actions.ts` | 7.2. Seis actions com `financas:fluxo-caixa:configurar` e `validarVersaoAction` com `:validar`, todas com `revalidate` de `/contabilidade/dfc` e `/contabilidade/fluxo-caixa/rubricas`. `procurarContasDFCAction` é uma leitura para o `ComboboxRemoto`: `:configurar` e `permiteEmLeitura`. |
| `apps/erp/src/lib/validations/fluxo-caixa.ts` | `ProcurarContasDFCSchema` e `voltarSeguro()`, que só aceita caminhos `/contabilidade/…` sem `//`, `://`, `..`, `\` nem caracteres de controlo, e que continuem dentro de `/contabilidade/` depois de normalizados por `new URL` (FIX m3). |
| `apps/erp/src/app/(dashboard)/contabilidade/fluxo-caixa/rubricas/**` | 7.3. As `page.tsx` são todas Server Components. `page.tsx` tem as rubricas por actividade com as contas, «Reatribuir»/«Desmapear» por conta, «Editar»/«Eliminar» por rubrica, as contas folha sem mapeamento e o cartão da versão actual. As rotas dedicadas são `nova`, `[id]/editar`, `mapear` (`?contaId=`, `?voltar=`), `contas-caixa`, `versoes` e `validar`. Os únicos `AlertDialog` são o desmapear e o eliminar: confirmam e não recolhem dados. |
| `…/contabilidade/fluxo-caixa/page.tsx` | Redirecciona para `rubricas` (ver «Achados»). |
| `…/contabilidade/dfc/page.tsx` | Ligação «Configurar rubricas» (`data-testid=dfc-configurar-rubricas`), só para quem tem `:configurar`. O painel de impedimentos com «Mapear» fica para o `pagina`. |
| `apps/erp/src/components/layout/Breadcrumbs.tsx` | Rótulos de `fluxo-caixa`, `rubricas`, `contas-caixa`, `versoes`, `validar` e `mapear`. |
| `apps/erp/src/lib/__tests__/dfc-voltar.test.ts` | Teste acessório do `voltarSeguro`, do `verificador-fluxo-caixa` desde o FIX (acrescenta os casos codificados). |

### Como o serviço cumpre o oráculo

- **V1/V2.** `escreverVersionado(ctx, escrever)` abre uma única `prisma.$transaction(async tx => …)`. É o cliente
  **estendido**, não o `prismaBase`, porque sem ele a `audit-extension` não via as escritas. A tx faz, por ordem:
  1. tranca a versão mais recente: `SELECT "id" … WHERE "tenantId" = $1 ORDER BY "numero" DESC LIMIT 1 FOR UPDATE`.
     É a mesma linha que o `validarVersao` tranca, o que serializa os escritores entre si e com a validação;
  2. corre as escritas singulares;
  3. relê o vivo **na tx** e cria a versão `n+1` `PENDING` se `mudou(instantâneo da última, instantaneoDe(vivo))`.

  Sem mudança não há escrita: o `editarRubrica` só escreve os campos diferentes, o `mapearConta` para a mesma rubrica
  devolve o actual e o `definirContasCaixa` com o mesmo conjunto não toca em nada.
- **V3.** O `validarVersao` faz, na tx:
  1. `SELECT "id" … WHERE "id" = $1 AND "tenantId" = $2 FOR UPDATE`. Sem linha, dá 404 sem escrita;
  2. lê o estado depois da tranca;
  3. recusa com `VERSAO_DESACTUALIZADA` se não for a mais recente;
  4. faz um único `update`, só com `estado`, `validadoPorId`, `validadoEm` e `observacao ?? null`.
- **I10.** A conta resolve-se por `findFirst({ id, tenantId })`, a rubrica por `findFirst({ id, tenantId,
  deletedAt: null })`, e o `definirContasCaixa` confere a contagem de `findMany({ id: { in } })`. Só depois se
  escreve, e `update`/`delete` só por `id` já confirmado.
- **Auditoria.** Nenhum `upsert`/`*Many`: o `definirContasCaixa` faz `delete`/`update`/`create` linha a linha.
  Confirmado na base: `AuditLog` com `MapeamentoContaFluxo UPDATE ×2`, `VersaoMapeamentoFluxo CREATE ×2` e
  `UPDATE ×1`, exactamente as escritas do smoke.

## Decisões (não fixadas pelo oráculo nem pelo ADR; para o REVIEW)

Códigos novos em `ERROS_DFC`, todos `BusinessRuleError`. A propriedade do oráculo não gera nenhum destes casos:

| Código | Quando |
|---|---|
| `VERSAO_JA_VALIDADA` | Validar a versão mais recente quando ela já está `VALIDATED`. O oráculo diz que é caso sem especificação. Recusar protege o parecer já dado: revalidar reescreveria quem validou e quando. |
| `RUBRICA_INATIVA` | Mapear para uma rubrica desactivada. Simétrico do MINOR-2: uma rubrica inactiva nunca tem contas. |
| `RUBRICA_CODIGO_DUPLICADO` | Código já usado no tenant. Faz-se pré-verificação e o `P2002` também se traduz: uma rubrica apagada continua a ocupar o `@@unique`. Sem isto o utilizador veria «Erro interno». |
| `RUBRICA_CAIXA_UNICA` | Criar uma rubrica `CAIXA`, ou mudar a actividade de ou para `CAIXA`. O E2 e o `definirContasCaixa` pressupõem **uma** rubrica de caixa. |

Mais três escolhas:

- `RUBRICA_DE_SISTEMA` passa também a recusar a mudança de **código** de uma rubrica SISTEMA. A actividade e o
  sinal de uma SISTEMA editam-se: o IAS 7 deixa escolher, por exemplo, juros em OP ou FIN, e isso é decisão do
  contabilista.
- `mapearConta`/`desmapearConta` aceitam contas de caixa e o destino `CAIXA`, e o resultado é coerente com o E2.
  Na UI, as contas de caixa só se mexem em «Contas de caixa», e o «Mapear» não oferece a rubrica `CAIXA`.
- A página de rubricas abre com `:leitura`, **só de leitura**. As rotas de escrita pedem `:configurar`, e
  `/validar` pede `:validar`. Com a matriz de E5 isto dá: FINANCEIRO configura e não valida, ADMIN faz as duas,
  GESTOR e LEITURA só vêem, OPERADOR fica em «Sem permissão».

## Achados

- **Link sem página + prefetch = página que nunca assenta.** O fio de Ariadne do topo (`Breadcrumbs.tsx`) liga
  todos os segmentos do caminho. `/contabilidade/fluxo-caixa` não tinha página: o prefetch RSC dele dava 404 e
  ficava pendente em produção, e o `networkidle` nunca chegava. O diagnóstico registou os pedidos da página, e só
  este ficava pendente.
  - A correcção é uma `page.tsx` que redirecciona. Depois dela, `networkidle` em ~0,7 s.
  - Qualquer rota nova com um segmento intermédio sem página tem o mesmo defeito. Fica como sugestão ao
    orquestrador (dívida transversal, fora do grafo).
- **Prefetch em massa.** A página lista 435 contas mapeadas. Pus `prefetch={false}` nas ligações por conta e por
  rubrica, para não disparar centenas de prefetches de rotas dinâmicas. Não era esta a causa do timeout, mas
  continua a ser o custo certo.

## Smoke (Playwright ad-hoc, apagado no fim)

Build de produção servido em `next start -p 3010`, com `NEXTAUTH_URL`/`AUTH_URL`/`APP_URL` para `:3010` e o
`KEYCLOAK_CLIENT_SECRET` de dev só nesse processo, como no `fatia`. Login no nosso `/auth/login`, contra o Keycloak
real, com `networkidle` antes de cada interacção. **23/23 OK**, 0 erros de consola ou de página:

- **admin**:
  - a DFC tem «Configurar rubricas» e a faixa «… versão 1»;
  - a 421 está na OP-05 e «Reatribuir» leva a `/mapear?contaId=…`;
  - vê «Validar versão actual».
- **reatribuir 421 → OP-09**:
  - a 421 aparece na OP-09;
  - a DFC mostra **«Mapeamento por validar · versão 2»**;
  - a articulação continua a **0,00 MT**.
- **validar a v2** com observação, em `/validar` (rota com formulário, não `AlertDialog`): a **faixa desaparece**
  da DFC.
- **repor 421 → OP-05** com `&voltar=/contabilidade/dfc`:
  - depois de gravar vai para `/contabilidade/dfc`;
  - a faixa volta, com **«… versão 3»**;
  - a 421 está de volta à OP-05;
  - o histórico mostra a v2 `Validado`, por «Administrador Demo», com a observação, e a v3 `Por validar`.
- **financeiro@**:
  - vê «Nova rubrica»;
  - **não** vê «Validar versão actual», nem nas rubricas nem nas versões;
  - `/validar` dá «Sem permissão», sem botão.
- **operador@**: as rubricas dão «Sem permissão».

Screenshots em `/private/tmp/claude-502/-Users-xavier-dev-code-workspace-2026-gespro/970104f2-f985-483d-bacf-948d15748124/scratchpad/`:
`config-01-rubricas-admin.png` … `config-09-validar-financeiro.png`. O `playwright/.auth/admin.json` não foi
reescrito.

## Estado da base (tenant `demo`) — LER ANTES DO PRÓXIMO `pnpm check`

- As versões 2 e 3 criadas pelo smoke original foram **limpas pelo orquestrador** depois do PV: a base tem só a
  **v1 `PENDING`**, como a sentinela `verificarSentinelas` (`helpers/dfc-golden.ts`) exige. O FIX da volta 1 não
  correu smoke nenhum que escreva, por isso continua assim.
- Qualquer smoke ou E2E futuro que grave configuração volta a criar versões e põe a golden da DFC a falhar com
  «a base tem resíduos». O E2E 10.1 cria versões por construção: tem de limpar no fim, ou a sentinela tem de
  tolerar versões posteriores com o mesmo instantâneo (decisão do `verificador-fluxo-caixa`).

## Para o `pagina`

- O «Mapear» dos impedimentos deve ligar a
  `/contabilidade/fluxo-caixa/rubricas/mapear?contaId=<id>&voltar=<caminho da DFC, url-encoded>`, com `contaId` em
  `ContaNaoMapeada.conta.id`. O `voltar` passa por `voltarSeguro` (ver FIX m3): tem de começar por
  `/contabilidade/`, continuar dentro de `/contabilidade/` depois de normalizado por `new URL`, e não trazer
  `..`, `\`, `://`, caracteres de controlo nem `%` no caminho. Um `voltar` com datas em query-string
  passa e sai normalizado (sem fragmento); tudo o resto é ignorado e vale o destino por omissão.
- Depois de mapear, a DFC mostra a faixa da versão nova. A página não precisa de fazer nada.
- A ligação «Configurar rubricas» da DFC já existe, e o painel completo de impedimentos é do `pagina`.

## FIX — volta 1 de 3 (revisão «APROVAR COM NITS»)

Oráculos inalterados: `dfc-config.test.ts` + `duplo-config-dfc.autoteste.test.ts` 67/67 (56 + 11).

- **m1 — concorrência** (`dfc.service.ts`). O `FOR UPDATE` sobre a última versão não serializava todos os
  escritores e, num tenant sem versão nenhuma, não trancava linha alguma. `escreverVersionado` e `validarVersao`
  começam agora por `trancarMapeamento(tx, ctx)`:
  `SELECT pg_advisory_xact_lock(hashtextextended('dfc-mapeamento:' || $tenantId::text, 0))` por `$executeRaw`
  (a função devolve `void`; o `$queryRaw` teria de desserializá-lo). Tranca por tenant, libertada no fim da tx;
  tenants diferentes não se esperam. O `FOR UPDATE` que o oráculo afirma mantém-se, a seguir. O duplo
  `duplo-config-dfc` aceita o SQL do advisory lock (regista-o como tranca `ADVISORY`); não foi alterado. SQL
  confirmado no Postgres local com `PREPARE`/`EXECUTE` dentro de `BEGIN … ROLLBACK` (sem escrita).
  Rede de segurança, também aplicada: um P2002 no `create` da versão n+1 (`@@unique([tenantId, numero])`)
  traduz-se em `BusinessRuleError('MAPEAMENTO_ALTERADO_EM_SIMULTANEO', 'A configuração foi alterada por outra
  pessoa entretanto. Tente de novo.')` — código novo em `ERROS_DFC`. Com a tranca não deve acontecer.
- **m3 — redireccionamento aberto** (`lib/validations/fluxo-caixa.ts`, `voltarSeguro`). A verificação textual
  deixava passar `/contabilidade/%2e%2e/vendas`, que o parser de URL (WHATWG) resolve para `/vendas`. Agora são
  duas camadas: (1) texto em bruto — prefixo `/contabilidade/`, sem `\`, `://`, `..` nem caracteres de
  controlo (antes do parser, que apaga CR/LF/TAB em silêncio); (2) normalizado — `new URL(voltar, base)` na
  mesma origem, `pathname` ainda dentro de `/contabilidade/`, sem `//` e sem percent-encoding nenhum no
  caminho (nenhuma rota da contabilidade o usa; ids são cuid/uuid) — cobre `%2e`/`%2f`/`%5c` em qualquer caixa e o
  duplo encoding `%252e%252e`, que só vira `..` à segunda descodificação. A query-string pode ter `%`. Devolve `pathname + search`. Recusa, entre outros, `%2e%2e`, `%2E%2E`, `.%2e`,
  `%2e%2e/%2e%2e//evil.example/x`, `..%2f..%2fvendas`, `%252e%252e`, `%2F%2Fevil`, TAB e DEL, além dos casos antigos.
  Assinatura inalterada.
- **m4 — erros no campo** (`rubrica-form.tsx`). `RUBRICA_CODIGO_DUPLICADO` → `setError('codigo')`, com foco;
  `RUBRICA_COM_CONTAS` ao desactivar → `setError('ativo')` (o campo ganhou `<FormMessage />`). Os códigos
  comparam-se a literais tipados por `import type { CodigoErroDFC }` — o `dfc.interface.ts` é `server-only`.
- **NITs**:
  - comentário de `exigirCodigoLivre` corrigido: a leitura NÃO vê rubricas eliminadas (a `tenant-extension`
    injecta `deletedAt: null`); o caso da eliminada só se apanha no P2002, traduzido por `codigoDuplicado`;
  - `definirContasCaixa` exige a rubrica `CAIXA` activa quando a lista não é vazia, senão `RUBRICA_INATIVA`;
  - `eliminar-rubrica.tsx`: o `AlertDialogAction` fica desactivado quando `temContas`;
  - indentação do `prefetch={false}` em `rubricas/page.tsx`;
  - schemas inline das actions movidos para `lib/validations/fluxo-caixa.ts` (`DesmapearContaSchema`,
    `EliminarRubricaSchema`); o actions deixou de importar `zod` e `idEntidade`;
  - a DFC mostra a ligação ao painel a todos os que a vêem (têm `:leitura`): «Configurar rubricas» a quem
    configura, «Rubricas» aos outros; o painel já é só de leitura para esses. Mesmo `data-testid`.

### Decisões ratificadas

- **`RUBRICA_CAIXA_UNICA`** (uma só rubrica `CAIXA` por tenant; não se cria outra nem se muda a actividade
  de/para `CAIXA`) foi **ratificada pelo orquestrador**. Fica para registar no ADR-0037 na errata humana.

### Dívida (sem código nesta volta)

- **m2 — `AuditLog` fora da tx.** A `audit-extension` grava o trilho fora da transacção da escrita: um rollback
  pode deixar uma linha de auditoria de uma escrita que não aconteceu (e um crash entre commit e auditoria, o
  inverso). Para a **validação**, a fonte do trilho é a própria `VersaoMapeamentoFluxo`
  (`validadoPorId`/`validadoEm`/`observacao`, na mesma tx), não o `AuditLog`.
- **m5 — histórico de versões.** A página de versões carrega todas as versões com o `instantaneo` JSON inteiro
  para contar rubricas/contas. Falta paginar por cursor e obter as contagens sem trazer o JSON (p. ex.
  `jsonb_array_length` em SQL, ou colunas de contagem gravadas no `create` da versão).
