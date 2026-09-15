# Handoff — spec 21, lane L3 (`s21-ecra-registo`), tarefas 3 e 7

Ramo: `s21-ecra-registo`, criado sobre L1 (`registarTenant()`) e L4 (verificação de e-mail).
Governa: **ADR-0031** (§2, §2-bis, §Decisão, §Consequências), ADR-0029 (Direct Access Grant),
ADR-0030, ADR-0016 (Turnstile), ADR-0008 (medição). `design.md` §2, §3, §6, §7, §8.
**Migrations: nenhuma.** Não foi gerada nem era precisa.

Esta é a lane que fecha o funil: até aqui `/comecar` encaminhava para 404.

## 1. O que ficou feito

| Tarefa | Estado |
|---|---|
| 3.1 `/registo` — Server Component + folha cliente, marca, `plano` por query, Turnstile | feito |
| 3.2 `actions.ts` — `registarTenant()` → `signIn` → e-mail → evento → `redirect` | feito |
| 3.3 Falha do `signIn` depois do provisionamento — mensagem própria e alerta | feito |
| 3.4 `/registo` em `PUBLIC_PATHS` (confirmado), `noindex`, canónico | feito |
| 3.4 CSP do Turnstile só nesta rota | **escrita e testada, POR APLICAR** — ver §5.1 |
| 3.5 `.env.example` do ERP | feito |
| 7.1 Evento servidor→Plausible com o domínio do site | feito |
| 7.2 `utm_*` sobrevivem ao salto, zero PII | feito |
| Órfão A — `?verificacao=` no ecrã de login | feito |
| Órfão B — `/comecar` no sitemap vs. canónico | decidido; lado do ERP aplicado (§4) |

Verificação: `pnpm check` verde (97 ficheiros, **1363** testes; 129 avisos de lint = a linha de
base do repositório, inalterada), `pnpm gates` verde, `pnpm build` verde nas duas apps.
Além disso, *smoke* real com `next build && next start` + browser (Playwright), porque três
destas coisas não aparecem em nenhum dos três comandos — ver §6.

**Instabilidade observada, alheia a esta lane:** numa de seis corridas do `pnpm check`, um dos
dois ficheiros com `describe.skipIf(!hasDB)`
(`src/server/services/plataforma/__tests__/{provisionamento-integracao,wave3-integration}.test.ts`)
saltou os seus testes e deu o ficheiro como falhado. Correm contra o Postgres local, partilhado
com o repositório principal. Repetido quatro vezes em conjunto e quatro vezes a suite inteira:
verde em todas. Nenhum dos dois toca em ficheiro desta lane — `src/server/services/**` não é
meu. Fica registado para não parecer descoberto depois.

## 2. Decisões tomadas dentro da lane

1. **A action não passa pelo `createSafeAction`**, como o design manda: aquele começa por
   exigir `auth()` e por resolver um tenant, e aqui não há nem um nem outro. Segue o precedente
   de `/auth/mudar-palavra-passe/actions.ts` (ADR-0030). Toda a defesa — captcha, limites, Zod,
   idempotência, ordem Keycloak→Postgres — continua em `registarTenant()`, que a action não
   duplica nem contorna. A action corre dentro de `runWithRequestContext` para o log ter
   `requestId`, e é esse `requestId` que serve de `traceId`.

2. **«A pessoa ficou com sessão?» lê-se de duas maneiras, e são precisas as duas.** O `signIn`
   do Auth.js v5 com `redirect: false` pode recusar **lançando** ou **devolvendo** a URL da
   página de erro. Ler só a excepção deixava passar por sessão o que não é sessão nenhuma — e o
   ecrã encaminharia para o painel alguém que ia levar com o redireccionamento do middleware de
   volta ao login, sem uma palavra. Há teste para os dois caminhos.

3. **Uma chave de idempotência por TENTATIVA, gerada no cliente.** Estável durante a tentativa
   (protege o duplo envio), renovada quando a tentativa falha. O contrário — chave fixa por
   formulário — daria `IDEMPOTENCY_KEY_REUTILIZADA` em quase todas as correcções, porque o
   `captchaToken` é de uso único, o widget emite outro a seguir a cada recusa, e o token entra
   no `fingerprint` do corpo. **O que isto custa** está na §5.4.

4. **A sentinela do captcha** (`src/app/registo/captcha.ts`). O `RegistoTenantSchema` exige
   `captchaToken` não vazio e é da L1 — esta lane não lhe toca. Sem chave pública não há widget,
   logo não haveria token, e o formulário era recusado pelo **próprio cliente**: o botão que não
   faz nada da issue #44. A regra «a obrigatoriedade do desafio segue a presença da chave»
   cumpre-se submetendo um valor conhecido quando não há chave. Não é porta das traseiras: quem
   decide continua a ser `verificarCaptcha`, que em produção recusa `CAPTCHA_PROVIDER=none` e
   manda a sentinela para a Cloudflare como qualquer outro token — *fail-closed*.

5. **O widget do Turnstile monta uma vez por chave** (issue #43). O efeito de montagem depende
   **só de `siteKey`**; as funções de retorno vivem numa `ref`. A reposição do desafio é
   imperativa (`ref.repor()`), não um contador em estado — um `setState` dentro de um efeito é
   cascata de renders, e o lint deste repositório recusa-o. Confirmado em browser: o id do
   widget não muda depois de se escrever nos campos.

6. **O evento de conversão NÃO leva o IP de quem se regista.** O protocolo do Plausible
   aceita-o em `X-Forwarded-For`, e é assim que o script do browser atribui o visitante; o
   Requisito 7.2 proíbe o IP no evento e não há forma de o mandar «não em claro». **Custo
   assumido**: a métrica de *visitantes únicos* deste evento não é fiável (tudo chega do IP do
   servidor). A **contagem de conversões**, que é o que o Requisito 7.1 manda medir, é exacta.
   Há um teste que acende se alguém acrescentar o cabeçalho «para a atribuição funcionar».

7. **Os `utm_*` viajam na URL do evento, não só nas `props`.** O Plausible lê `utm_*` da própria
   URL para calcular fonte e campanha; pô-los lá é usar o mecanismo do fornecedor em vez de
   duplicar um nosso. A URL do evento é `https://<SITE_URL>/comecar?utm_…` — o domínio do site,
   e a mesma morada do canónico. As duas decisões lêem-se uma à outra.

8. **O emissor recusa PII por construção — nos DOIS canais de saída.** A primeira versão deste
   ficheiro guardava só as `props`; a **URL do evento**, onde viajam os `utm_*`, não passava pelo
   filtro. `utm_content=<endereço do destinatário>` é prática corrente numa campanha de e-mail e
   chegaria ao fornecedor como `ana%40padaria.mz`. Estava tapado só porque `PLAUSIBLE_DOMINIO`
   ainda não está definido — ou seja, o defeito acordava no dia em que alguém ligasse a medição,
   que é o dia em que ninguém está a olhar. Fechado por uma função só (`pareceEndereco`), usada
   pelas `props` **e** pela URL, mais a re-normalização na action (ponto 9).

   Ao fechá-lo apareceu uma **segunda porta, pior**: um `utm` em **array**
   (`utm_content: ['ana@x.mz']`) furava tudo — `['ana@x.mz'].includes('@')` é `false`, porque o
   `includes` de um array compara elementos e não subcadeias, e o `URLSearchParams` escrevia-o na
   mesma. O `Utm` diz que são strings, mas isto atravessa a fronteira de uma Server Action, onde
   o tipo não vale nada em tempo de execução — e `string[]` é a forma **normal** de um parâmetro
   repetido numa query string. `urlEventoRegisto` passou a recusar o que não é texto; quem desfaz
   arrays é o `normalizarUtm`.

9. **O `utm` é re-normalizado na action**, e não só na página: chega no corpo da Server Action,
   logo é entrada de cliente como qualquer outra. Sem isto, um valor de 5000 caracteres ou um
   array entravam sem tecto nem forma.

10. **A medição não conta a reentrega idempotente.** Repetir a mesma chave é o mesmo registo;
   contá-lo duas vezes inflacionava a conversão.

11. **O e-mail de verificação sai DEPOIS da sessão e não a trava** (ADR-0031): SMTP em baixo
    já não tranca ninguém. Sai também no caminho em que o `signIn` falhou — a conta existe e tem
    de ser confirmável.

12. **`?verificacao=` renderizado no cliente, não no servidor.** Fazer `page.tsx` ler
    `searchParams` tornaria `/auth/login` dinâmico; hoje é estático. O aviso exige JavaScript —
    o que não é regressão nenhuma, porque o formulário de login já submete por JavaScript
    (`signIn` do cliente): um ecrã sem JS não iniciava sessão de qualquer maneira. Confirmado em
    browser: o aviso aparece e o e-mail vem preenchido.

13. **O `sem-sessao` substitui o formulário, não o acompanha.** Mostrar outra vez os campos
    convidava a submeter uma segunda vez uma empresa que já existe.

## 3. Ficheiros

**Novos**
- `apps/erp/src/app/registo/page.tsx` — Server Component; `noindex` + canónico; `plano` e
  `utm_*` da query; catálogo de planos e províncias para a folha.
- `apps/erp/src/app/registo/registo-form.tsx` — `'use client'`; RHF + `zodResolver` sobre o
  **mesmo** `RegistoTenantSchema`; `<FormMessage />` em **todos** os campos, `captchaToken`
  incluído; sem modais.
- `apps/erp/src/app/registo/actions.ts` — `registarTenantPublico`.
- `apps/erp/src/app/registo/captcha.ts` — a regra da #44 num sítio testável.
- `apps/erp/src/app/registo/erros-campo.ts` — para onde vai cada chave de um `fieldErrors`.
- `apps/erp/src/app/registo/csp.ts` — a política CSP da rota (**por aplicar**, §5.1).
- `apps/erp/src/components/seguranca/turnstile.tsx` — widget do ERP, com a #43 fechada.
- `apps/erp/src/server/analytics/plausible.ts` — emissor servidor→Plausible.
- `apps/erp/src/app/(auth)/auth/login/aviso-verificacao.tsx` — órfão A.
- Testes: `src/app/registo/__tests__/{actions,captcha,erros-campo}.test.ts`,
  `src/server/analytics/__tests__/plausible.test.ts`,
  `src/server/security/__tests__/csp-registo.test.ts`,
  `src/components/seguranca/__tests__/turnstile-ciclo-vida.test.ts`,
  `src/app/(auth)/auth/login/__tests__/aviso-verificacao.test.ts`.

**Alterados**
- `apps/erp/next.config.ts` — `headers()` com `X-Robots-Tag` em `/registo`, e o registo escrito
  do porquê de a CSP não poder viver ali.
- `apps/erp/.env.example` — §4.
- `apps/erp/src/app/(auth)/auth/login/page.tsx` — monta o aviso dentro de um `<Suspense>` próprio.
- `apps/erp/src/app/(auth)/auth/login/login-form.tsx` — `?identificador=` preenche o e-mail e o
  foco passa para a palavra-passe.

**Confirmado e NÃO tocado**
- `apps/erp/middleware.ts` — `/registo` já está em `PUBLIC_PATHS` (a L4 pô-lo lá, com o
  comentário certo). Verificado, não reescrito.

## 4. Variáveis de ambiente

| Variável | Novidade | Sem ela |
|---|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | nova no ERP (Requisito 5.1) | o formulário **submete à mesma** (#44); quem recusa é o servidor |
| `EMAIL_VERIFY_SECRET` | **da L4, que pediu à L3 para a pôr** | em produção rebenta no primeiro envio de verificação |
| `SITE_URL` | nova | omissão `https://gestpro.co.mz` — canónico e URL do evento |
| `PLAUSIBLE_DOMINIO` | nova | **medição desligada**, sem chamada nenhuma (ADR-0008) |
| `PLAUSIBLE_HOST` | nova | omissão `https://plausible.io` |

`NEXT_PUBLIC_CAPTCHA_SITE_KEY` continua no ficheiro e **não tem leitor no código** — é o nome do
tempo em que o widget era só do site. Fica por enquanto para não partir ambientes que já a
definam; quem fizer a limpeza do `.env.example` que a tire.

## 5. Gaps, com motivo e dono

### 5.1 A excepção de CSP do Turnstile está escrita mas **não aplicada** — e não é aqui que pode ser

O `design.md` §3 e a tarefa 3.4 põem a excepção no `next.config.ts`. **Não funciona.** Medido,
não deduzido: com o cabeçalho declarado em `headers()` para `source: '/registo'`, um
`next build && next start` seguido de `curl -D - /registo` devolve a política do `middleware.ts`.
O middleware escreve o mesmo nome de cabeçalho por último e um CSP substitui-se, não se
acrescenta. O `X-Robots-Tag` da mesma entrada aparece — porque esse nome o middleware não escreve.

Um cabeçalho que nunca chega ao browser é pior do que nenhum: quem o lesse acreditaria nele.
Portanto **não** se emite. A política vive em `src/app/registo/csp.ts`, pronta, com o nonce por
pedido na assinatura, e guardada directiva a directiva por
`src/server/security/__tests__/csp-registo.test.ts`.

**Consequência hoje: nenhuma.** A CSP está em report-only por omissão e não bloqueia nada — o
widget carrega e resolve o desafio (verificado em browser). **Consequência no dia em que
`CSP_ENFORCE=true` for ligado: o Turnstile deixa de carregar em `/registo`.** O browser já o diz
por escrito, em report-only:

```
Loading the script 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
violates … script-src 'self' 'nonce-…'
Framing 'https://challenges.cloudflare.com/' violates … "frame-src 'none'"
```

**Dono:** quem activar a CSP estrita (`middleware.ts` é o dono único dos cabeçalhos de
segurança — CLAUDE.md; a activação é da lane de correcções da Wave 8). **A alteração são três
linhas**, dentro de `middleware()`, a seguir a `buildSecurityHeaders`:

```ts
if (pathname === '/registo') {
  const nome = enforceCSP ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only';
  securityHeaders[nome] = cspRegisto(nonce, isDev);
}
```

Não a fiz porque `middleware.ts` está expressamente fora desta lane (`execucao-paralela-21.md`:
o ficheiro tem um dono por fase, e é a L4). **É o único ponto em que o design não foi cumprido à
letra**, e é por o design estar errado quanto ao mecanismo, não quanto à intenção.

### 5.2 Com `CSP_ENFORCE=true`, o ecrã de login parte — e sem login não há aplicação

Defeito herdado, não deste spec, mas quem aplicar a §5.1 bate nele no mesmo dia. **Medido pelo
revisor**, e a minha primeira redacção deste parágrafo estava errada quanto ao mecanismo — vale
a versão medida:

- **rotas dinâmicas** (quase todo o ERP, `/registo` incluída): o nonce **chega**. Os inline e os
  chunks trazem `nonce=` igual ao do cabeçalho;
- **rotas estáticas** (`/auth/login`, `/auth/mudar-palavra-passe`, `/contactos`, `/` — as do
  `prerender-manifest.json`): 22 scripts, **zero** com nonce. HTML prerendered não pode levar um
  nonce por pedido, por construção;
- e há **um** inline sem nonce mesmo nas rotas dinâmicas: o do **next-themes**.

Ou seja: `CSP_ENFORCE=true` parte o **ecrã de login**, e sem login a aplicação fica inutilizada.
Não é «o nonce nunca chega»; é «não chega onde o HTML é prerendered», que dá no mesmo para quem
tenta entrar. Fica dito com o mecanismo certo porque há um ticket a abrir com base nisto.

### 5.3 O canónico e o `noindex` são contraditórios por ordem do Requisito 2.4

O Requisito 2.4 manda as duas coisas: `noindex` **e** canónico para
`https://gestpro.co.mz/comecar`. O Google desaconselha a combinação e, na prática, o `noindex`
ganha. Apliquei as duas à letra. A leitura que a torna coerente: aqui o canónico não é uma
candidatura a indexação (a página é `noindex`), é a **declaração da morada pública estável do
funil** — a que os anúncios e as partilhas usam.

### 5.4 Uma resposta perdida faz o segundo envio bater em «e-mail já registado»

Consequência directa da decisão 3. Se o provisionamento concluir e a resposta se perder na rede,
a nova tentativa traz chave nova e apanha `EMAIL_JA_REGISTADO`. A mensagem é explícita e o campo
acende no e-mail, mas não diz «a sua conta foi criada, inicie sessão». Fechá-lo a sério é
reconhecer no ecrã que `EMAIL_JA_REGISTADO` logo a seguir a uma submissão pode ser a própria
pessoa — o que exige distinguir «já era cliente» de «acabei de criar», e isso é conhecimento que
`registarTenant()` não devolve. Não inventei o mecanismo; fica para quem decidir o texto.

### 5.5 Sem E2E

A tarefa 9.2 (registo → sessão → aviso → verificação → travão levantado) é do orquestrador na
fase 4, e o `signIn` real precisa de Keycloak e Postgres a sério. O que esta lane provou sem
eles está na §6.

### 5.6 O evento `registo.iniciado` é emitido depois da submissão, não da chegada ao ecrã

O design §7 lista-o entre os eventos estruturados; a leitura natural («abriu o formulário»)
exigiria um evento a partir do cliente, que é precisamente o que o Requisito 7.1 proíbe no ERP
(sem script de analytics, sem cookies). Fica a medir submissões, não visitas — as visitas ao
funil continuam a ser medidas pelo site, em `/comecar`.

## 6. O que o *smoke* provou, e que `pnpm check` não prova

Com `next build && next start` e um browser (Playwright), na rota real:

- `/registo` responde 200, com `X-Robots-Tag: noindex, nofollow`,
  `<meta name="robots" content="noindex, nofollow">` e
  `<link rel="canonical" href="https://gestpro.co.mz/comecar">`;
- `?plano=BASICO` chega ao `Select` **com o rótulo visível** («Básico») — a armadilha do Radix
  do `CLAUDE.md`;
- submeter em branco acende **os sete** erros de campo. Não há botão que não faça nada;
- com `NEXT_PUBLIC_TURNSTILE_SITE_KEY` de teste, o widget monta, resolve, e **o seu id não muda
  depois de se escrever nos campos** — a issue #43, verificada onde ela acontecia;
- `/auth/login?verificacao=ok&identificador=…` mostra o aviso e traz o e-mail preenchido;
- zero `pageerror` em qualquer dos ecrãs.

## 7. Os testes, e a prova de que valem

Cada regra guardada foi **desfeita** e o teste correspondente **acendeu**:

| Regra desfeita | Teste que acendeu |
|---|---|
| `signIn` lido só pela excepção | `actions.test.ts` — «uma URL de erro … conta como falha de sessão» |
| `valorInicialCaptcha` sempre `''` (#44) | `captcha.test.ts` — «SEM chave, o corpo submetido passa o schema» |
| `connect-src` alargado em `/registo` | `csp-registo.test.ts` — «não alarga mais nada» |
| `onToken` nas dependências do efeito (#43) | `turnstile-ciclo-vida.test.ts` |
| um desfecho de verificação sem aviso | `aviso-verificacao.test.ts` |
| `X-Forwarded-For` no evento do Plausible | `plausible.test.ts` — «sem o IP de quem se regista» |
| reentrega idempotente a contar conversão | `actions.test.ts` — «NÃO volta a contar» |
| propriedade com `@` a passar | `plausible.test.ts` — «recusa … pareça um endereço» |
| `utm_*` com `@` a passar no `normalizarUtm` | `plausible.test.ts` — «descarta um utm com forma de endereço» |
| `utm_*` com `@` a passar na URL do evento | `plausible.test.ts` — «NÃO deixa um endereço entrar na URL» |
| `utm_*` em array aceite na URL | `plausible.test.ts` — «o array era a porta de trás» |
| a action não re-normalizar o `utm` | `actions.test.ts` — «re-normaliza os `utm_*` do cliente» |
| `plano` do cliente logado sem validar | `actions.test.ts` — «é uma das três constantes» |
| `sessaoOk` por subcadeia | `actions.test.ts` — «um `error=` dentro do callbackUrl NÃO é falha» |
| chave de grupo sem destino no formulário | `erros-campo.test.ts` — «cobre todas as chaves do `flatten()`» |

**Uma nota de método, porque me mordeu.** A primeira verificação por mutação correu as sete de
seguida num só script; duas deram «acendeu» e era **falso** — um `timeout` matou o lote a meio e
deixou um ficheiro mutado, que a mutação seguinte então usou como base «boa». Refeitas **uma a
uma**, com estado confirmado limpo entre cada, duas não acendiam de facto: o teste do
`callbackUrl` estava com o `error=` codificado (logo a procura por subcadeia também não o via) e
o do array não existia. Ambos corrigidos; foi a correcção do segundo que descobriu a porta dos
arrays. Uma verificação por mutação em lote não é verificação nenhuma.

O teste do ciclo de vida do widget é **estrutural sobre a fonte**, e não de render: este projecto
corre em `environment: node`, sem DOM nem testing-library, e acrescentar jsdom era mexer numa
configuração que não é desta lane. Não substitui um teste de render — apanha a reintrodução, que
é o que aqui interessa. O comportamento em si foi verificado em browser (§6).

## 8. O órfão B — `/comecar` no sitemap vs. o canónico

**Decisão: `/comecar` SAI do `sitemap.xml` do site; o canónico de `/registo` FICA a apontar-lhe.**

Depois da L2, `/comecar` é um `redirect(307)` e mais nada. Um sitemap é uma lista de URLs
canónicos e indexáveis; um redireccionamento não tem conteúdo para indexar, e o Google trata-o
como «página com redireccionamento» — ou seja, anunciamos uma morada para a deitar fora a
seguir. A entrada indexável do funil já está no sitemap e é a certa: `/precos` (prioridade 0.9),
que é a página com conteúdo e com o CTA que leva a `/comecar`.

O canónico fica porque o Requisito 2.4 o manda e porque, com a página em `noindex`, ele não é
uma candidatura a indexação: é a declaração da morada pública estável do funil (§5.3).

**Só o lado do ERP foi aplicado** — `apps/site/**` não é desta lane. **Para o orquestrador
aplicar**, em `apps/site/src/app/sitemap.ts`, remover a linha:

```ts
{ caminho: "/comecar", prioridade: 0.8, frequencia: "monthly" },
```

Se a decisão for a contrária (manter), nada do lado do ERP muda — o canónico é o mesmo. O que
não pode ficar é o meio-termo tácito de hoje, em que o sitemap anuncia um 307 e ninguém decidiu.

## 9. Contra o design

Um ponto, e é o da §5.1: **a excepção de CSP não pode viver no `next.config.ts`**, ao contrário
do que o `design.md` §3 previa. A intenção do design cumpre-se — excepção da rota, sem alargar
as rotas autenticadas — mas o sítio onde ela tem de ser aplicada é o `middleware.ts`, que não é
ficheiro desta lane. Nada mais no ADR-0031 ou no design foi contrariado.
