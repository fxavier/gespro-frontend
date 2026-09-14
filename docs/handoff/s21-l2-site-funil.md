# S21 · L2 — o site passa a ser só funil

**Lane:** `wt/s21-site-funil` (ramo `s21-site-funil`, de `ws-21`)
**Tarefa:** `tasks.md` 6 (6.1 a 6.5) · **Governa:** ADR-0031 §Decisão 4, ADR-0027 §2
**Ficheiros:** `apps/site/**` — e só. Nenhuma linha em `apps/erp/**`, `packages/**`,
`docs/decisions/**`, `.kiro/**`, `prisma/**`. Sem migrações (não as há neste spec).

## 1. O que foi apagado, e porquê

| Ficheiro | Porquê |
|---|---|
| `src/components/marketing/formulario-registo.tsx` | O formulário mudou de domínio (ADR-0031 §4). Enquanto existisse aqui, a palavra-passe teria de atravessar o servidor do site |
| `src/components/marketing/turnstile.tsx` | O widget acompanha o formulário. A excepção de CSP é da rota `/registo` do ERP, não do site |
| `src/actions/registo.ts` (e a pasta `src/actions/`, que ficou vazia) | Server Action do formulário |
| `src/lib/registo.ts` | Cliente HTTP de `POST /api/publico/registo`. Quem chama a fronteira pública passa a ser o ERP, na mesma origem |
| `src/lib/provincias.ts` | Existia **só** para o campo `provincia` do payload de registo. O ERP tem a sua lista (`apps/erp/src/lib/provincias-mocambique.ts`) |
| `src/lib/validations.ts` — `nuitSchema`, `registoSchema`, `DadosRegisto`, `paraPayloadRegisto` | Um schema de registo deste lado seria uma segunda definição de «válido» |
| `src/lib/__tests__/validations.test.ts` — os dois `describe` do registo | A cobertura vai para onde o registo foi |
| `messages/pt.json` — `comecar.campos.*`, `comecar.erros.*`, `comecar.seccao*`, `submeter`, `aSubmeter`, `aceitacao`, `sucesso*`, e `metadata.comecar` | Texto de um formulário que já não existe |
| `.env.example` — `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Sai do site com o widget |
| `next.config.ts` — `challenges.cloudflare.com` em `script-src`/`frame-src`/`connect-src` | Permissão sem beneficiário: o site deixou de carregar script de terceiros. `frame-src` passa a `'none'` |
| `src/lib/analytics.ts` — `EVENTOS.registoIniciado/registoConcluido/registoFalhado` | A medição do registo passa a ser evento servidor→Plausible a partir do ERP (Requisito 7.1). O browser nunca os dispararia: `/comecar` responde 307 antes de renderizar |
| `e2e/site.a11y.ts` — a rota `/comecar` | Deixou de ser uma página do site. Mantê-la punha o axe a seguir o 307 até um ERP que pode não estar a correr — **isto teria partido `pnpm e2e:a11y`** |

## 2. O que sobreviveu, e porquê

- **`src/components/marketing/campos.tsx`** — inteiro. `Campo`, `CampoTexto`, `CampoSelecao` e
  `Armadilha` são todos usados por `formulario-contacto.tsx`. Nada neste ficheiro era exclusivo do
  registo.
- **`src/lib/rate-limit.ts`** — `api/contacto/route.ts` continua a usar `verificarLimite` e
  `identificarCliente`. O teste `__tests__/rate-limit.test.ts` fica.
- **`src/lib/validations.ts`** — `contactoSchema` e `ASSUNTOS_CONTACTO`.
- **`comecar.titulo` / `subtitulo`** em `messages/pt.json`, mais duas chaves novas
  (`aEncaminhar`, `reserva`): são o «essencial da página de passagem» do `design.md` §3, e é o
  corpo do 307 que as usa.
- **`/comecar` no `sitemap.ts`** — ver *gaps*.

## 3. O encaminhamento (6.1) — e o desvio que ele obrigou

`GET /comecar` responde **307** para `${NEXT_PUBLIC_APP_URL}/registo`, com `plano` e **todos** os
`utm_*` preservados (ordem determinística; tudo o resto é descartado, com um tecto de 200
caracteres por valor). O destino vem do ambiente, com omissão `http://localhost:3000` — nunca do
código. Lógica isolada e testada em `src/lib/funil.ts`.

**Desvio face ao `design.md` §3: `comecar/page.tsx` foi substituído por `comecar/route.ts`.**

O Requisito 2.1 pede as duas coisas — 307 **e** um `<a>` visível como alternativa sem JavaScript.
Uma página não dá as duas, e isto foi **medido em build de produção**, não deduzido:

| Tentativa | Resultado |
|---|---|
| `page.tsx` com `redirect()` | `307` correcto, mas o corpo é do Next (`<html id="__next_error__">`): sem `<a>` nenhum |
| `page.tsx` + `loading.tsx` com a ligação | A resposta passa a **`200`** — o Next transmite o *shell* antes de o `redirect()` resolver, e o encaminhamento passa a depender de JavaScript. Mata o 307, o E2E e os motores de busca |
| Distinguir os dois casos pelo cabeçalho `rsc` | **Impossível:** o Next remove-o antes de chegar ao componente (verificado: o componente vê `accept: */*` numa navegação RSC) |

Um Route Handler devolve as duas: o `Location` que todos os browsers seguem, e um corpo nosso —
que é, à letra, a *«short hypertext note with a hyperlink»* que a RFC 9110 §15.4 manda pôr numa
resposta de encaminhamento. Documento mínimo, traduzido (`getTranslations` com o locale do
segmento), `color-scheme: light dark` para herdar o tema do sistema sem uma única cor escrita à
mão, `noindex`, `Cache-Control: no-store` (o destino depende da query — uma cache intermédia
mandaria toda a gente para a campanha de outra pessoa).

**O que se perde:** `generateMetadata` (canónico/OG de `/comecar`). Não é perda real — numa
resposta 307 esses metadados nunca chegam a ser servidos. Ver *gaps* para o que isto implica no
canónico que o Requisito 2.4 pede à página `/registo` do ERP.

## 4. Auditoria dos limites publicados (6.4)

Catálogo em vigor (ADR-0027 §2): **`utilizadores`** e **`armazens`**. `documentosMes` e `produtos`
foram retirados. O `apps/erp/src/lib/planos.ts` já está alinhado (`LimitesPlano` = `utilizadores`,
`armazens`, `suporte`).

Varridos: `src/**`, `content/**` (MDX de blog, recursos e legal) e `messages/*.json`.

**Nem `documentosMes` nem `produtos` aparecem em superfície nenhuma do site.** Três achados
diferentes, todos corrigidos porque eram só apresentação:

1. **`src/lib/planos.ts` publicava `empresas`** (1 / 1 / ilimitado) nos três planos do catálogo de
   demonstração. Não está no catálogo do ADR-0027 e nada no ERP conta empresas por tenant —
   número publicado que ninguém aplica. **Removido.**
2. **`tabela-precos.tsx` tinha rótulos para `documentosPorMes`, `armazenamentoGb` e `empresas`.**
   Dar nome PT-PT a um limite é tratá-lo como contrato. Lista reduzida ao catálogo (`utilizadores`,
   `armazens`) mais `suporte`, que é o terceiro campo que o endpoint real devolve.
3. **Ilimitado aparecia como «-1».** O catálogo do ERP escreve ilimitado como `-1`; o site só
   traduzia `null`/`""` para `∞`. Quem escolhe um plano lia «-1 utilizadores». Corrigido com um
   predicado `ilimitado()` que aceita as duas convenções.

Além disso, o plano Empresarial do catálogo de demonstração anunciava *«Empresas ilimitadas no
mesmo grupo»* — a mesma promessa, vestida de funcionalidade. Substituída por *«Utilizadores e
armazéns sem limite»*, que é o que o catálogo realmente diz.

## 5. Issues #43 e #44 — fechadas por remoção

Ambas são defeitos de `turnstile.tsx` e `formulario-registo.tsx`, **os dois apagados nesta lane**.
Confirmado ficheiro a ficheiro que nenhum dos dois defeitos sobrevive noutro sítio do site:

- **#43** (o widget desmonta-se a cada render — efeito com as três funções de retorno nas
  dependências, duas delas anónimas escritas no local): o único `useEffect` com esse padrão estava
  em `turnstile.tsx`. `formulario-contacto.tsx`, o único formulário que resta, não tem widget nem
  efeito com funções nas dependências.
- **#44** (sem chave, o schema do site exige `captchaToken` e recusa o registo antes de ele chegar
  ao ERP): `captchaToken` vivia só em `registoSchema`, removido. `contactoSchema` nunca exigiu
  token.

**Nada a corrigir noutro ficheiro.** Quem fecha as issues é o orquestrador, depois do merge — como
substituídas por este spec, não como corrigidas.

> **Para a L3:** os dois defeitos são de desenho, não de descuido. O widget que a `/registo` do ERP
> vier a montar **não deve ser cópia deste componente**: o efeito tem de depender só da chave (as
> funções de retorno em `useRef` ou `useEffectEvent`), e a obrigatoriedade do token tem de seguir a
> presença da chave, com a recusa visível num campo — não um botão que não faz nada.

## 6. Testes (6.5)

- `src/lib/__tests__/funil.test.ts` — 6 casos: destino, `plano`, todos os `utm_*` por ordem
  determinística, parâmetros que **não** são do funil (incluindo `redirect` e `email`) descartados,
  valores vazios/repetidos, tecto de comprimento.
- `e2e/encaminhamento.funil.ts` (projecto Playwright novo, `funil`, script
  `pnpm --filter site e2e:funil`) — 4 casos: o 307 e o seu `Location`; `plano` + `utm_*`
  preservados; o botão da tabela de preços a levar o plano até ao fim; e o corpo do 307 a trazer a
  ligação de reserva e **nenhum** `<form>` nem `challenges.cloudflare.com`.

O teste lê o `Location` em vez de abrir o ERP: até a L3 fundir, `/registo` não existe, e a suite do
site não pode depender disso.

## 7. Verificação

| Gate | Resultado |
|---|---|
| `pnpm check` (raiz → ERP) | `prisma validate` ✓ · `tsc` ✓ · `eslint` ✓ · **1263 testes ✓**. Um único ficheiro falha — `venda-integracao.test.ts`, que precisa de `DATABASE_URL` e o worktree não tem `.env` (não o criei: `apps/erp/**` não é meu). Corrido com o `DATABASE_URL` do repositório principal: **3/3 ✓** |
| `pnpm gates` (raiz) | dialog ✓ · use-client ✓ · data-imports ✓ |
| `pnpm --filter site gate:cores` | ✓ zero literais — **verde depois das remoções**, confirmado e não assumido |
| `pnpm --filter site build` | ✓ (`/[locale]/comecar` dinâmico) |
| `typecheck` · `lint` · `test` do site | ✓ · ✓ · 48/48 ✓ |
| `e2e:funil` | 4/4 ✓ |
| `e2e:a11y` (tema claro) · `movimento-reduzido` | 10/10 ✓ · 7/7 ✓ |
| `e2e:a11y` (tema escuro) | **10 falhas, herdadas e alheias a esta lane** — ver *gaps* |

## 8. Gaps

1. **Ordem de merge.** Esta lane funde **depois da L3**. Até `/registo` existir no ERP, o 307 aponta
   para 404. É motivo para o orquestrador segurar o merge, não para segurar o trabalho.
2. **`pnpm e2e:funil` não está na raiz.** O `turbo.json` e o `package.json` da raiz não são meus.
   Para o CI correr este projecto é preciso uma entrada `"e2e:funil": { "cache": false }` no
   `turbo.json` e o script correspondente na raiz — ou acrescentá-lo ao `e2e:a11y` existente.
3. **`/comecar` responde 307 e continua no `sitemap.xml`.** Um URL que encaminha num sitemap é um
   aviso no Search Console. Não o removi porque o Requisito 2.4 manda a `/registo` do ERP apontar o
   canónico para `https://gestpro.co.mz/comecar` — canónico para um URL que encaminha é, por sua
   vez, um cheiro de SEO. **As duas decisões têm de ser tomadas em conjunto**, e a segunda é da L3.
4. **O site nunca vê o catálogo real.** `GET /api/publico/planos` devolve
   `{ data: { planos, trialDias } }` (envelope do `withApi`); `src/lib/planos.ts` valida
   `{ planos }` no topo e, ao falhar, degrada **sempre** para `PLANOS_DEMONSTRACAO`. É por isso que
   a auditoria do ponto 4 incidiu sobre o catálogo de demonstração: é o que está no ar. Não o
   corrigi de propósito — desembrulhar `data` faz a página passar a mostrar o catálogo do ERP, que
   **não traz `funcionalidades`** (a lista «Inclui» desapareceria) e traz `suporte` como texto.
   É uma decisão de contrato entre a spec 18 e a 19, não desta lane. Fica nomeada para os tickets
   do ADR-0027 (#31–#39).
5. **Tema escuro falha o contraste AA em todas as páginas** (`.bg-primary.text-accao-texto` e o
   logótipo do cabeçalho). **Verificado como pré-existente**: com as minhas alterações guardadas em
   *stash* e um build limpo do `ws-21`, `Termos (tema escuro)` falha na mesma. Já corrigido em
   `w8/integracao` pelo commit `0bf526f` («o primário do tema escuro falhava o contraste AA»), que
   ainda não chegou a esta base. Chega pelo rebase, não por trabalho aqui.
6. **A CSP do site não tem o host do Plausible.** Com `NEXT_PUBLIC_PLAUSIBLE_DOMINIO` definido, o
   `script-src 'self'` bloqueia o script de analytics. Pré-existente e fora da tarefa 6; ganha
   relevância com a tarefa 7 (medição), porque a medição do funil passa a importar a sério.
