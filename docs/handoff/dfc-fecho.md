# Handoff — grafo `dfc`, nó `fecho` (tickets 10.2 e 10.3 + achados A–D do orquestrador)

- **Data**: 2026-09-26 · **Grafo**: [`.claude/grafos/dfc.md`](../../.claude/grafos/dfc.md) · **Destranca**: `parecer` `[HUMANO]`
- **Agente**: `feat-dfc`, na worktree `wt/feat-dfc` (ramo `ws-2-dfc`, base `4914221`).
  - Sem migrações e sem commit.
  - Nenhum ficheiro protegido foi tocado: `git diff --stat 4914221` sobre a lista do grafo sai vazio.
  - O grafo não foi marcado. A REVIEW fica com o orquestrador.
- **Entrega consolidada do WS-2**: [`feat-22-fluxo-de-caixa.md` § «WS-2 — … entrega»](feat-22-fluxo-de-caixa.md).

## INSPECT

- **O regresso da edição de rubrica falha (achado 1 do `e2e-v`).** Os quatro formulários de escrita do módulo
  (`rubrica-form`, `mapear-conta-form`, `validar-versao-form`, `contas-caixa-form`) faziam
  `router.push(destino); router.refresh()` dentro do `startTransition(async …)`, depois de uma action que já revalida
  `/contabilidade/dfc` e `/contabilidade/fluxo-caixa/rubricas`.
  - O `desmapear-conta` e o `eliminar-rubrica` só fazem `router.refresh()`. Um `refresh` entra na fila do router
    **depois** da action; não a descarta, por isso **não** têm o padrão e ficaram como estavam.
  - A página `/contabilidade/dfc` não tem formulário de escrita.
- **Segmentos intermédios sem página (achado 2 do `e2e-v`).** Só faltava `rubricas/[id]`. O `fluxo-caixa/page.tsx`
  já redireccionava (nó `config`); `contabilidade/`, `dfc/` e `rubricas/` têm página.
- **`gate-periodo`.** A DFC só lê `Lancamento`: 0 escritas em `dfc.service.ts`, nas actions, na rota de export e nas
  páginas.

## PLAN

1. **A** — construir o ciclo de reprodução primeiro (Playwright ad-hoc contra `next start -p 3010`). Pô-lo vermelho,
   formular hipóteses, corrigir na raiz, e provar antes/depois na edição, no mapear e no validar.
2. **B** — criar `rubricas/[id]/page.tsx`, um Server Component que redirecciona para `[id]/editar`.
3. **C** e **D** — registar em `docs/status.md` e no handoff da spec 22.
4. **10.2** — `gate-periodo`. **10.3** — secção WS-2, `status.md`, lacunas.
5. **VERIFY** — `pnpm check && pnpm gates`, build, `18-dfc` sozinho, sentinelas da golden.

## A — regresso depois de gravar

### Ciclo de reprodução

Um script ad-hoc em `apps/erp/e2e/`, apagado no fim, com o `storageState` do `setup`. Por iteração faz o seguinte:

- **edição**: rubricas → «Editar» na OP-04 → alterna a designação entre `<orig>` e `<orig> (R)` → «Guardar» → espera
  até 10 s que o URL volte a `/rubricas`;
- **mapear + validar**:
  - `/rubricas/mapear?contaId=<411>` → alterna a 411 entre OP-05 e OP-04 → «Guardar» → espera o regresso;
  - `/rubricas/validar` → observação → «Validar» → espera o regresso.

N é par, para a 411 acabar na OP-04 e a designação na original. Quando uma iteração falha, o script regista também:
o texto do botão, os toasts, a rede (pedidos RSC, `POST` da action) e, na fase instrumentada, a consola.

### Resultados (servidor `next start -p 3010`, build de produção desta worktree)

| Fluxo | Antes (código de `4914221`) | Depois (entregue) |
|---|---|---|
| Edição de rubrica | **4/18 falhas**, e o `e2e-v` tinha medido 6/20 | **0/40** |
| Mapear conta | 0/40 (não reproduzido) | 0/80 no entregue, e 0 falhas em mais de 200 gravações ao longo de todas as experiências |
| Validar versão | **3/20** e **1/20** | **2/20** · 1/20 · 2/20 — **não corrigido** (ver abaixo e «Bloqueios» no handoff da spec 22) |
| Contas de caixa | não medido | mesma correcção que a edição |

**Sintoma exacto de cada falha.**

- O toast de sucesso aparece e a escrita fica gravada.
- O botão fica em «A guardar…»/«A validar…» **para sempre**: a espera extra de 20 s não muda nada.
- O URL continua no formulário.

Ou seja, a transição do React nunca faz commit.

### Hipóteses e o que as matou

1. **O `router.refresh()` concorrente com o `push`.** Tirado sozinho, a edição continuou a falhar (4/20, 1/20).
   **Falsa.**
2. **O `push` chega enquanto a action ainda está na fila do router.** Lendo o Next 16.0.10:
   - o `server-action-reducer` chama `resolve(actionResult)` antes de a entrada sair da fila;
   - um `navigate` que chega nesse intervalo marca a action como `discarded`;
   - uma action descartada nunca resolve a promessa de estado que já tinha dado ao React.

   A correcção é esperar uma macrotarefa antes do `push`. Levou a edição de ~20 % para **0/40**. **Aceite para a
   edição.** O mecanismo é inferido da leitura do código e confirmado só pelo efeito da correcção: nas corridas
   instrumentadas houve descartes também em iterações que passaram.
3. **A mesma causa na validação.** Instrumentei o Next (`[DEBUG-dfc]` em `app-router-instance.js` e
   `server-action-reducer.js`, já reposto):
   - a action é aplicada e sai da fila (`handleResult … discarded=false`);
   - o `navigate` é despachado com a fila vazia e resolvido;
   - **o React não faz commit**.

   Duas experiências:
   - com o `push` fora da transição (`setTimeout` sem `await`), as falhas foram 3/20 e 1/20;
   - **sem `push` nenhum**, 1/40: a transição da própria action pendura.

   A navegação simples `/editar → /rubricas` («Cancelar», sem action) deu **0/60**. **A causa da validação não está
   na navegação.**
4. **`redirect()` no servidor para a validação** (`validarVersaoEVoltarAction`), para a resposta trazer a árvore do
   destino numa só entrada da fila: 5/60. **Falsa.** Revertido.

Foram três voltas de correcção na validação, e nenhuma ficou verde. Parei, como manda a regra do grafo. O que fica
por explorar está no handoff da spec 22, em «Bloqueios»: instrumentar o **React**, para saber em que `thenable` a
raiz suspende.

### O que foi entregue

- `apps/erp/src/lib/navegar-depois-da-accao.ts` — `navegarDepoisDaAccao(router, destino)`: espera uma macrotarefa e
  faz `push`. O comentário tem o mecanismo e diz o que **não** cobre, que é a validação.
- Os quatro formulários (`rubrica-form`, `mapear-conta-form`, `validar-versao-form`, `contas-caixa-form`) passam de
  `router.push(destino); router.refresh()` a `await navegarDepoisDaAccao(router, destino)`, dentro do
  `startTransition(async …)`, para que o `isPending` mantenha o botão desactivado.
- O `refresh` era redundante e saiu: com `revalidate`, o router já invalida a cache inteira.

**Semente de regressão.** Não há costura barata. O defeito só aparece no browser, com `next start`, e é
intermitente: um teste repetido 20× custa ~1 min e escreve 20 versões na base por corrida. Fica o ciclo acima,
descrito para quem o quiser repor. O `18-dfc` (protegido) prova a escrita da edição pelo toast e pela página relida,
não pelo regresso (decisão do `e2e-v`).

**Fora do módulo.** O mesmo padrão de `router.push` logo a seguir a uma action que revalida existe no «padrão da
casa» do CLAUDE.md (`EstornarForm`, `RegistarPagamentoForm`). Não foi medido nem alterado.

## B — `rubricas/[id]`

`apps/erp/src/app/(dashboard)/contabilidade/fluxo-caixa/rubricas/[id]/page.tsx` é um Server Component que
`redirect`a para `/rubricas/<id>/editar`. A autorização e o 404 de uma rubrica alheia ficam com a página de edição.

- Verificado por script ad-hoc: `goto /rubricas/<id>/editar` chega a `networkidle` em 925 ms, sem nenhum 404, e
  `/rubricas/<id>` acaba em `/editar`.
- No build aparece `ƒ /contabilidade/fluxo-caixa/rubricas/[id]`.
- Não há outros segmentos intermédios sem página no módulo.

## C e D

- **C** — o contraste a 4,47:1 ficou como dívida transversal em `docs/status.md`, na secção da DFC.
- **D** — dívidas consolidadas na tabela «Dívida aberta» do handoff da spec 22.

## 10.2 e 10.3

- **10.2** — `node scripts/gate-periodo.mjs` dá `OK: nenhum ficheiro fora de contabilidade.service.ts escreve
  directamente em Lancamento/PartidaLancamento.`, e o `pnpm gates` também.
- **10.3** — ficaram escritos:
  - a secção WS-2 em `feat-22-fluxo-de-caixa.md`: entrega por nó com commits, oráculos, como correr, dívidas, e o que
    o `parecer` precisa (tabela 4.1 em `dfc-seed.md` e prompt PH);
  - a entrada «Bloqueios»;
  - a linha de estado;
  - `docs/status.md`;
  - `docs/sistema/08-lacunas-conhecidas.md`: «DFC sem UI» deixa de ser lacuna, e a #153 fica aberta até ao parecer.

## VERIFY

| Gate | Resultado |
|---|---|
| `pnpm check` (raiz) | `prisma validate` · `tsc` · `eslint` com 0 erros. vitest: **149/150 ficheiros, 2091 testes verdes**. Único vermelho: `projecao.golden.test.ts`, «a base tem resíduos», `compromissosManuais` 1 vs 0 (o aceite) |
| `pnpm gates` (raiz) | 5/5 OK, com `periodo` a zero |
| `pnpm --filter erp build` | verde, depois de reposto o `node_modules` do Next |
| `e2e/18-dfc.spec.ts` sozinho, `next start -p 3010` | **5 corridas: 1 vermelha, depois 4 verdes seguidas** (≈18,7 s cada) |
| `dfc.golden` + `dfc.impedimentos-isolamento` no fim | **23/23 verdes** |
| `playwright/.auth/admin.json` | reposto com `git checkout` |

**A corrida vermelha do `18-dfc`.** A primeira corrida falhou no passo 5: `editarDesignacao` → clique em «Editar» na
lista, e o URL não mudou em 30 s. O defeito é da mesma família: uma transição que não faz commit. Já tinha aparecido
uma vez no ciclo de reprodução, antes do B, por isso não foi introduzido por este nó. O `afterAll` repôs o
mapeamento, e as sentinelas ficaram verdes.

## Estado da base (tenant `demo`)

- O mapeamento vivo está igual ao do seed: a 411 na OP-04, a designação «Variação de clientes».
- As versões são append-only: há **561**, das quais **376 `VALIDATED`**. Quase todas vêm dos ciclos de reprodução
  deste nó, com observações «Repro nó fecho (achado A), iteração N.».
- Isto agrava o m5 (o histórico de versões não pagina).
- A sentinela da golden aceita estas versões: a mais recente tem o instantâneo da v1.
