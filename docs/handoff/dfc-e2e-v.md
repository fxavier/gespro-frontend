# Handoff — grafo `dfc`, nó `e2e-v` (ticket 10.1)

- **Data**: 2026-09-26 · **Grafo**: [`.claude/grafos/dfc.md`](../../.claude/grafos/dfc.md) · **Destranca**: `fecho`
- **Agente**: `verificador-fluxo-caixa`, worktree `wt/feat-dfc` (ramo `ws-2-dfc`, base `dc6f411`). Não há código de
  produção, não há migração e não há INSERT/UPDATE directo: todo o estado foi criado pela UI. O grafo não foi marcado.
- **Entregue**: `apps/erp/e2e/18-dfc.spec.ts`. Fica protegido a partir deste nó (regras do grafo).

## O que o spec faz

Há um único teste, `DFC: desmapear → impedimento → Mapear → gerar → validar → alterar → faixa → PDF`, com um
`test.step` por ponto do 10.1. Corre como admin, pelo `storageState` do projecto `setup`.

0. **Escolha do alvo, lida do ecrã e sem ids fixos.** Abre a DFC do intervalo por omissão e percorre as rubricas
   `OP-*` pela ordem da DFC. Pára na primeira conta cujo efeito em N é ≠ 0,00: efeito ≠ 0 implica variação ≠ 0, logo
   movimento. Os ids da conta e da rubrica vêm dos `href` de «Reatribuir» e «Editar» na página de rubricas. No seed
   actual o alvo é a **411 Clientes c/c na OP-04 «Variação de clientes»**. Há uma pré-condição: a DFC por omissão não
   pode ter impedimentos (se tiver, falha com «a base tem resíduos»). Se a designação trouxer a marca de uma corrida
   interrompida, é reposta pela UI antes de o teste começar.
1. **Desmapear.** Clica em «Desmapear» na conta, dentro da rubrica, e confirma no `AlertDialog`. A conta sai da
   rubrica e aparece em «Contas folha sem mapeamento». Na DFC seguem-se três asserções:
   - o painel `dfc-impedimentos` está presente e o `dfc-articulacao` não;
   - existe a linha `dfc-nao-mapeada-<conta>`, com «Intervalo pedido»;
   - o movimento dessa linha é ≠ 0.
2. **«Mapear» a partir do painel.** O `href` de `dfc-mapear-<conta>` tem de ser
   `/contabilidade/fluxo-caixa/rubricas/mapear?contaId=<id>&voltar=/contabilidade/dfc?dataInicio=…&dataFim=…`.
   Ao abrir, o formulário mostra a conta fixada e «Actualmente sem mapeamento.». O teste escolhe a rubrica de origem
   e grava.
3. **Voltar e gerar.** O regresso tem de ir para o `voltar` exacto. Na DFC verifica:
   - sem impedimentos;
   - `dfc-articulacao-diferenca` igual a `0,00 MT`;
   - a conta de novo dentro da rubrica, com a rubrica expandida;
   - a faixa «Mapeamento por validar · versão N», com `dfc-versao` = `Mapeamento vN`.
4. **Validar.** Abre `/rubricas/validar?voltar=<DFC>`, onde `validar-versao-info` tem de mostrar «Versão N». Escreve a
   observação «E2E 10.1 — validação da versão N.» e valida. Depois do regresso à DFC, a faixa desaparece e o
   `dfc-versao` mantém-se `Mapeamento vN`.
5. **Alterar uma rubrica.** Pela UI (rubricas → «Editar»), a designação passa a `<original> (E2E 10.1)`. Na DFC, a
   faixa volta com a versão **N+1** e a rubrica mostra a designação nova.
6. **Exportar o PDF.** Clica em `dfc-exportar-pdf` e verifica:
   - a resposta de `/api/contabilidade/dfc/export` é 200 com `content-type` `application/pdf`;
   - há um download `dfc-*.pdf` que começa por `%PDF-`, e `dfc-exportar-erro` não aparece;
   - o texto do PDF contém «Mapeamento por validar · versão N+1». O extractor está inline no spec (FlateDecode com
     strings WinAnsi hex/literais), no mesmo método que o `pdf-texto.ts` do `export-v`.

**Reposição (`afterAll`).** Abre um contexto novo com o `storageState` do admin e repõe pela UI o mapeamento vivo
igual ao do seed. A conta volta à rubrica de origem se não estiver lá, e a designação volta à original se for
diferente. No fim confirma que a conta está na rubrica, que a designação é a original e que a DFC por omissão não tem
impedimentos.

## Como correr

A porta 3000 é do checkout principal e não foi tocada. O servidor desta worktree correu numa porta livre, como no nó
`pagina`:

```bash
cd wt/feat-dfc && pnpm --filter erp build
cd apps/erp
KEYCLOAK_CLIENT_SECRET="$(docker exec gespro-keycloak printenv GESPRO_ERP_CLIENT_SECRET)" \
  NEXTAUTH_URL=http://localhost:3010 AUTH_URL=http://localhost:3010 APP_URL=http://localhost:3010 \
  npx next start -p 3010 &
BASE_URL=http://localhost:3010 npx playwright test e2e/18-dfc.spec.ts --project=setup --project=e2e
pkill -f "next start -p 3010"
git checkout -- apps/erp/playwright/.auth/admin.json
```

Contra `pnpm dev` na 3000 basta `npx playwright test e2e/18-dfc.spec.ts --project=setup --project=e2e`, mas não
foi medido assim.

## Resultado

| Verificador | Resultado |
|---|---|
| `18-dfc.spec.ts` sozinho, `setup` + `e2e`, contra `next start -p 3010` | corridas 6, 7, 8 e 9 **verdes**, as 6–8 seguidas; cerca de 9,5 s por corrida |
| sentinela da golden (`dfc.golden` + `dfc.impedimentos-isolamento`) depois das corridas | **23/23 verdes**, antes e depois |
| `tsc -p e2e/tsconfig.json`, `eslint e2e/18-dfc.spec.ts` | 0 |
| `playwright/.auth/admin.json` | reposto com `git checkout` |

```
RUN 6 EXIT 0   ✓ [setup] autenticar como admin (766ms)   ✓ [e2e] 18-dfc.spec.ts:237 … (9.6s)   2 passed (19.0s)
RUN 7 EXIT 0   ✓ [setup] autenticar como admin (659ms)   ✓ [e2e] 18-dfc.spec.ts:237 … (9.7s)   2 passed (18.6s)
RUN 8 EXIT 0   ✓ [setup] autenticar como admin (629ms)   ✓ [e2e] 18-dfc.spec.ts:237 … (9.3s)   2 passed (18.2s)
RUN 9 EXIT 0   ✓ [setup] autenticar como admin (692ms)   ✓ [e2e] 18-dfc.spec.ts:237 … (9.7s)   2 passed (18.8s)
vitest dfc.golden + dfc.impedimentos-isolamento: Test Files 2 passed (2) · Tests 23 passed (23)
```

As corridas 1, 2 e 4 foram vermelhas, com versões anteriores do spec. As causas estão em «Achados».

## O teste discrimina: mutação demonstrada

**Mutante: «alterar uma rubrica não cria versão nova»** (a faixa não voltaria). Para o simular sem tocar em produção,
uma cópia temporária do spec (`e2e/zz-mutante-18.spec.ts`, já apagada) grava no passo 5 a **mesma** designação. O
serviço não escreve nada quando não há mudança, e é exactamente assim que se comportaria uma implementação que se
esquecesse de versionar a edição. Resultado:

```
✘ [e2e] zz-mutante-18.spec.ts:237 … › 5. alterar uma rubrica e ver a faixa voltar
  Error: expect(locator).toBeVisible() failed
  Locator: locator('#main-content').getByTestId('dfc-faixa-por-validar')
  Error: element(s) not found
```

Outras mutações que o spec mata, pela leitura das asserções:
- desmapear sem impedimento: um zero silencioso, contra o I7 (passo 1, `dfc-impedimentos` / `dfc-nao-mapeada-*`);
- «Mapear» sem `voltar`, ou com o intervalo errado (passo 2, regex do `voltar`; passo 3, URL exacto);
- validar sem esconder a faixa (passo 4);
- a faixa com o número da versão anterior (passo 5, `N+1`);
- o PDF sem a marca de versão por validar, ou com o número antigo (passo 6).

## Estado da base no fim (tenant `demo`)

- O mapeamento vivo está igual ao do seed: a 411 está na OP-04, a designação é «Variação de clientes» e não há
  `%E2E%` em rubrica nenhuma.
- A versão mais recente tem o instantâneo da v1, e a sentinela está verde.
- As versões ficam, porque são append-only e a sentinela revista aceita-as.
- **Por corrida limpa são 4 versões novas**: desmapear (PENDING), mapear (validada no passo 4 ⇒ VALIDATED), editar
  (PENDING) e repor a designação (PENDING, igual à v1).
  - Uma corrida que encontre a marca de uma corrida interrompida faz +1 versão, a da reparação.
- Este nó deixou a base com **55 versões** (v1 do seed + 54), das quais 9 `VALIDATED`, com observações
  «E2E 10.1 — validação da versão N.». As 54 decompõem-se assim:

  | Origem | Versões |
  |---|---|
  | corridas 2–9 do spec (a 2 fez 3, v2–v4, e parou antes de repor; a 3 fez 5, com a reparação; as outras 4 cada) | 32 |
  | reprodução do achado 1 | 20 |
  | mutante (desmapear e mapear; nada a repor) | 2 |

- O `AuditLog` guarda as escritas singulares correspondentes.

## Achados

1. **DEFEITO (escalado ao orquestrador, ticket 7.3): «Guardar» na edição de rubrica nem sempre regressa às
   rubricas.**
   - **Comportamento observado.** O `rubrica-form.tsx` faz `router.push(destino); router.refresh()` dentro do
     `startTransition`. A escrita acontece e o toast «Rubrica actualizada.» aparece, mas o utilizador **fica no
     formulário** (`/rubricas/<id>/editar`).
   - **Caso mínimo** (spec temporário, apagado): em `next start`, 20 gravações seguidas pela UI (rubricas → Editar →
     alterar a designação → Guardar), com 10 s de espera por navegação cada. **6 em 20 não navegaram**:
     `0a, 2b, 5a, 5b, 6a, 9a navegou=false … toast=true url=…/editar`.
   - **Consequência.** Também foi a causa da corrida 4 vermelha.
   - **Âmbito.** Não foi medido se o mesmo padrão (`push` + `refresh`) falha no `mapear-conta-form` e no
     `validar-versao-form`. No spec, os regressos desses dois passaram sempre (9/9 cada, contando o mutante).
   - **Decisão no oráculo.** O 10.1 pede «alterar uma rubrica» e não o regresso, por isso o passo 5 prova a escrita
     pelo toast e pela página de rubricas relida, sem depender da navegação. Os regressos do «Mapear» e do
     «Validar» continuam **estritos**, porque o `voltar` faz parte do que o 10.1 e o 7.3 especificam.
   - **Para o orquestrador.** Se quiser um oráculo do regresso da edição, tem de ser um teste próprio (repetido, dado
     que o defeito é intermitente), depois da correcção.
2. **`goto` a `/rubricas/<id>/editar` nunca chega a `networkidle`.** O fio de Ariadne liga a `/rubricas/<id>`, que
   não tem página, e o prefetch fica pendente. É o mesmo defeito que o `config` registou para `/fluxo-caixa`. Uma
   versão anterior do spec pendurou-se aí até ao timeout do `afterAll` (corrida 2). O spec passou a entrar na edição
   por «Editar» (navegação no cliente), e todos os `networkidle` têm tecto de 20 s.
3. **Cópia escondida da árvore suspensa.** Durante o streaming, `getByTestId('dfc-versao-actual')` resolveu a dois
   elementos: um em `#main-content` e outro escondido fora dele. Isso dá violação de strict mode (corrida 1). Todos
   os localizadores do spec partem de `#main-content`; os do toast, do `alertdialog` e das opções do `Select` partem
   da página, porque vivem em portais.
