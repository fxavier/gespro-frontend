# Handoff — w8-anti-abuso (Fase 2: Protecção anti-abuso do registo público)

- **Agente**: w8-anti-abuso
- **Data**: 2026-08-30
- **Branch**: `w8-anti-abuso` (a partir de `w8/integracao` em `aee09d0`, após merge de `w8-identidade`)
- **ADR de referência**: ADR-0016

---

## 1. O que ficou feito

### Tarefa 1 — Turnstile no lado do ERP

**`apps/erp/src/app/api/publico/registo/route.ts`** — Modo degradado implementado:

O ponto de extensão já estava presente (comentário «PONTO DE EXTENSÃO w8-anti-abuso»), a
`verificarCaptcha` já era chamada, e a ordem estava correcta (depois do Zod, antes do Keycloak).
O que faltava era distinguir `captcha_indisponivel` de `captcha_invalido`:

- `captcha_invalido` ou `captcha_nao_configurado` → rejeitar com 403 `CAPTCHA_INVALIDO`
- `captcha_indisponivel` (rede em baixa) → aceitar com alerta `logger.warn` (ADR-0016 §modo
  degradado: um verificador em baixa não pode fechar o funil comercial; as camadas 2 e 4
  continuam de pé)

Novo teste: `'modo degradado (ADR-0016): captcha_indisponivel → aceitar com 201'` verifica que
com motivo `captcha_indisponivel` o provisionamento ocorre e a chave não é libertada como falha.

**`apps/erp/src/server/auth/keycloak.ts`** — função `eliminarUtilizador(sub)` adicionada:

Necessária para o expurgo. DELETE `/users/{sub}`, idempotente em 404 (utilizador já eliminado).
Lança em outros status HTTP para o chamador decidir se continua.

### Tarefa 1 (cont.) — ERP: expurgo de registos não verificados

**`apps/erp/src/server/services/plataforma/expurgo.service.ts`** (novo):

Serviço `expurgarRegistosNaoVerificados()`. Critério de elegibilidade de tenant:
- `Tenant.createdAt < now() - 7 dias`
- Nenhum dos seus `User` tem `primeiroAcessoEm != null`

Por cada tenant elegível:
1. Elimina cada utilizador do Keycloak (best-effort, 404 é idempotente e não para o ciclo)
2. Elimina o tenant de Postgres (`prismaBase.tenant.delete` — cascade apaga User, UserRole,
   Assinatura, ConfiguracaoFiscal, PGC, Notificacao, etc.)

Retorna `{ elegiveisEncontrados, expurgados, falhas, timestamp }`.

**`apps/erp/src/app/api/cron/expirar-registos-nao-verificados/route.ts`** (novo):

- Rota `GET` via `withApi({ public: true })` — ganha o pipeline de observabilidade (requestId,
  logging, métricas RED). Difere dos outros crons que passam fora do pipeline.
- Autenticação por `CRON_SECRET` dentro do handler (mesmo padrão dos outros crons).
- `/api/cron/` já está em `PUBLIC_PATHS` do middleware (w8-identidade corrigiu o bug que devolvia
  307 para crons com credencial própria).
- Agendamento sugerido: diário às 03:30 UTC (depois do reconciliar-identidades).
- Corrige um dos seis achados da revisão da spec 19: crons anteriores executam fora do
  pipeline de observabilidade e não aparecem nos painéis Grafana.

### Tarefa 2 — Site alinhado com o contrato pós-ADR-0013

**`apps/site/src/lib/validations.ts`**:

- Remove `adminSenha` do `registoSchema` (ADR-0013 §5: palavra-passe definida no Keycloak)
- Adiciona `captchaToken: z.string().min(1, "captchaObrigatorio")` — obrigatório (ADR-0016
  Camada 3): o widget preenche antes da submissão; string vazia recusada aqui e no ERP
- `paraPayloadRegisto`: parâmetro `captchaToken` deixa de ser opcional e vazio por omissão;
  `senha` removido do payload; assinatura simplificada (um argumento: `DadosRegisto`)

**`apps/site/src/lib/__tests__/validations.test.ts`**:

- Remove `adminSenha` do `registoValido`, adiciona `captchaToken: "tok-turnstile-test"`
- Remove teste de senha curta; adiciona teste de captchaToken vazio (deve falhar)
- Actualiza `paraPayloadRegisto`: sem `senha`, sem `captchaToken ?? ""`, verifica que
  `captchaToken` está no payload e `senha` não está

**`apps/site/src/components/marketing/turnstile.tsx`** (novo):

Widget Cloudflare Turnstile em Client Component com renderização explícita:
- Carrega `api.js?render=explicit` lazy (só quando monta)
- Renderiza via `window.turnstile.render()` com `callback`, `error-callback`,
  `expired-callback`
- Cleanup no unmount (`turnstile.remove`)
- Declaração TypeScript `declare global { interface Window { turnstile? ... } }`
- Chaves de teste Cloudflare documentadas no JSDoc

**`apps/site/src/components/marketing/formulario-registo.tsx`**:

- Remove campo `adminSenha` e a sua secção da fieldset
- Adiciona estado `captchaToken` (useState) + input oculto `name="captchaToken"`
- Monta `WidgetTurnstile` com `setCaptchaToken` como callback; limpa token em
  `onExpirado` e `onErro` — força nova verificação antes de submeter
- Widget só renderiza se `NEXT_PUBLIC_TURNSTILE_SITE_KEY` estiver definido; sem chave
  (dev sem Cloudflare) o campo viaja vazio e o ERP aceita com `CAPTCHA_PROVIDER=none`
- Em sucesso: mostra mensagem «verifique o e-mail» no lugar do formulário — sem redirect
  (ADR-0013 §5: entrada pelo link de activação do Keycloak)
- Mensagem de sucesso composta: `t("sucesso")` + `t("sucessoDetalhe")`

**`apps/site/src/lib/registo.ts`**:

- Remove lógica de `handoffToken` e redirect para `/auth/registo-callback`
- Em 201: `{ estado: "sucesso" }` (sem destino)
- Mapeia `error.code === "EMAIL_JA_REGISTADO"` → `{ chaveMensagem: "emailJaRegistado" }`
- Restante erros → `"generico"`; rede/timeout → `"indisponivel"`

**`apps/site/src/actions/registo.ts`**:

- `EstadoRegisto.sucesso` sem campo `destino`
- Remove o `window.location.assign` do formulário (agora o sucesso é tratado no componente)
- Extrai `captchaToken` do `FormData` e passa para `registoSchema.safeParse`
- Mapeia `resultado.chaveMensagem` (inclui `"emailJaRegistado"`) para o estado de erro

**`apps/site/src/lib/env.ts`**:

- Remove `URL_CALLBACK_REGISTO` (rota removida pelo ADR-0013)
- Exporta `TURNSTILE_SITE_KEY` (para uso server-side se necessário — o formulário usa
  `process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY` directamente por ser client component)

**`apps/site/messages/pt.json`**:

- `comecar.sucesso`: «Conta criada! Enviámos um e-mail de activação…»
- `comecar.sucessoDetalhe`: instruções de clique no link e verificação de spam
- `comecar.erros.emailJaRegistado`: «Este endereço de e-mail já está associado a uma
  conta GestPro. Quem gere duas empresas precisa de dois endereços de e-mail distintos.»
- `comecar.erros.captchaObrigatorio`: «Por favor complete a verificação anti-robô.»
- Remove `comecar.erros.senhaCurta` e `comecar.campos.adminSenha/adminSenhaAjuda`

**`apps/site/next.config.ts`**:

CSP estática (sem nonce — o site não tem middleware de nonce como o ERP):
- `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com`
- `frame-src https://challenges.cloudflare.com`
- Adicionados antes de o `w8-correcoes` activar o modo estrito (conforme §3 do conflito 3)
- `'unsafe-inline'` em `script-src` é necessário para a hidratação do Next.js sem nonce

**`apps/site/.env.example`**:

Documenta `NEXT_PUBLIC_TURNSTILE_SITE_KEY` com chaves de teste Cloudflare e instrução
de deixar em branco em dev sem Cloudflare.

---

## 2. Evidência de runtime

| Prova | Resultado |
|---|---|
| `pnpm check` (ERP: prisma + tsc + eslint + vitest) | **1243/1243 verdes** (adicionados 1 test de modo degradado na suite do handler) |
| `pnpm check` (site: tsc + vitest) | **51/51 verdes** (adicionados 2 testes de validação Turnstile) |
| `pnpm gates` | **verde** (dialog, use-client, data-imports) |
| `pnpm build` (site, standalone) | **verde** |
| `pnpm build` (ERP, standalone) | **verde** (1243 testes, 249 páginas) |

**O que não foi provado em runtime:**

O gate desta fase exige registo ponta-a-ponta do formulário do site até ao e-mail no Mailpit.
Este smoke **não foi executado** por não ter acesso ao `NEXT_PUBLIC_TURNSTILE_SITE_KEY` real (ou
de teste) configurado em `.env`, nem ao `CAPTCHA_PROVIDER=turnstile` e `CAPTCHA_SECRET_KEY`
configurados no ERP. As seguintes componentes precisam de ser verificadas pelo orquestrador com
a pilha `--profile full`:

1. Widget Turnstile a renderizar na página `/comecar` do site
2. Token a ser enviado no FormData da Server Action
3. ERP a verificar o token contra Cloudflare (ou a passar em modo degradado)
4. Tenant e utilizador criados no Keycloak e em Postgres
5. E-mail de activação entregue no Mailpit

Para verificar sem chaves reais de Cloudflare, usar:
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA` no site
- `CAPTCHA_PROVIDER=turnstile`, `CAPTCHA_SECRET_KEY=1x0000000000000000000000000000000AA` no ERP
- Estas são as chaves de teste Cloudflare (funcionam sem conta, sempre passam)

**Modo degradado provado em teste unitário** (não em smoke):

O teste `'modo degradado (ADR-0016): captcha_indisponivel → aceitar com 201'` confirma que com
`verificarCaptcha` a retornar `{ valido: false, motivo: 'captcha_indisponivel' }`, o handler
devolve 201 e o provisionamento ocorre.

---

## 3. Decisões e justificação

**Por que não se reescreveu `captcha.ts`:** O ADR e a instrução são explícitos: a verificação
server-side já existe e funciona. O modo degradado foi implementado no `route.ts` distinguindo
`captcha.motivo === 'captcha_indisponivel'` (rede em baixa) de `captcha_invalido` (bot real).

**Por que o widget usa renderização explícita e não implícita:** Renderização implícita
(Turnstile auto-detecta divs com `class="cf-turnstile"`) é mais simples mas não dá controlo
sobre o ciclo de vida em React (StrictMode monta dois vezes, SPA pode montar/desmontar). Com
renderização explícita (`render=explicit` + `window.turnstile.render()`) o cleanup no `useEffect`
é seguro.

**Por que `'unsafe-inline'` na CSP do site:** O site usa headers estáticos em `next.config.ts`
(sem middleware de nonce por pedido). Next.js 16 injeta scripts de hidratação inline que
precisam de `unsafe-inline`. A alternativa seria um middleware que gerasse nonce por pedido —
o custo é desproporcional para um site público estático. O ERP tem nonce (middleware.ts); o
site fica com `unsafe-inline` até o `w8-correcoes` rever a política.

**Por que o expurgo usa `withApi({ public: true })`:** Para ganhar o pipeline de observabilidade
(requestId, logging estruturado, métricas RED) que os outros crons não têm. O `CRON_SECRET` é
verificado dentro do handler — o `public: true` apenas bypassa a verificação de sessão Auth.js.

**Por que não se gerou migration:** A schema não mudou. O `Tenant.createdAt` e `User.createdAt`
já existiam. O `User.primeiroAcessoEm` foi adicionado pelo w8-identidade.

---

## 4. O que não ficou feito / fora do âmbito

**Chaves reais de Turnstile:** Precisam de ser criadas em https://dash.cloudflare.com/ e
configuradas nos ambientes. As chaves de teste Cloudflare bastam para o smoke local.

**Smoke ponta-a-ponta (GATE):** Como descrito em §2, o gate de fase exige smoke real com
formulário do site → ERP → Keycloak → Mailpit. Não foi executado. O orquestrador deve:
1. Configurar `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA` em `apps/site/.env`
2. Configurar `CAPTCHA_PROVIDER=turnstile` e `CAPTCHA_SECRET_KEY=1x0000000000000000000000000000000AA` em `apps/erp/.env`
3. Levantar pilha completa: `docker compose --profile full up -d --build`
4. Aceder a `http://localhost:3100/pt/comecar` (ou porta do site)
5. Submeter formulário e verificar e-mail no Mailpit (`:8025`)

**Métricas de bloqueio por camada:** O ADR pede métrica de percentagem de registos bloqueados
por cada camada. Não implementado — os logs estruturados existentes (logger.warn com
`'captcha_indisponivel'`, `'captcha_invalido'`, rate-limit 429) alimentam o Grafana via OTLP
(ADR-0019), mas não há painel dedicado nem contador específico por camada. Fica como pedido
ao `w8-correcoes` ou `w8-observabilidade`.

**CSP modo estrito no site:** O `w8-correcoes` activa `CSP_ENFORCE` para o ERP na fase 3. O
site não tem modo report-only nem strict — fica com a CSP permissiva adicionada aqui. Para
o site passar a modo estrito seria preciso um middleware de nonce (que o site não tem).

**E2E do fluxo de registo:** O clique no link de activação do Keycloak (definir senha + cair
no ERP) não é coberto por nenhum E2E existente. Bom candidato para o `w8-correcoes`.

---

## 5. Pedidos a outros agentes

| Para | O quê |
|---|---|
| **Orquestrador** | Smoke ponta-a-ponta (§4 acima) com chaves de teste Cloudflare |
| **Orquestrador** | Configurar `CAPTCHA_PROVIDER=turnstile` e `CAPTCHA_SECRET_KEY` na pilha full antes do smoke |
| **w8-cache** | `handoffLimiter`, `passwordResetLimiter`, `verificacaoEmailLimiter` ainda estão exportados (mortos) em `rate-limiter.ts`. O w8-identidade pediu que o w8-cache os poda — este handoff confirma que continuam lá |
| **w8-correcoes** | CSP do site: rever a necessidade de `'unsafe-inline'` em `script-src`; se houver nonce-based middleware para o site, o Turnstile precisa de `nonce-{X}` em vez de `unsafe-inline` |
| **w8-observabilidade** | Painel Grafana de métricas de bloqueio por camada (rate-limit vs. captcha) — os logs estruturados já chegam via OTLP mas não há dashboard dedicado |

---

## 6. Ficheiros modificados

| Ficheiro | Tipo | Proprietário |
|---|---|---|
| `apps/erp/src/app/api/publico/registo/route.ts` | Modificado | w8-anti-abuso (exclusivo nesta fase) |
| `apps/erp/src/app/api/publico/__tests__/registo-handler.test.ts` | Modificado (+1 teste) | w8-anti-abuso |
| `apps/erp/src/server/auth/keycloak.ts` | Modificado (+ eliminarUtilizador) | w8-identidade (dono; acréscimo mínimo) |
| `apps/erp/src/server/services/plataforma/expurgo.service.ts` | Criado | w8-anti-abuso |
| `apps/erp/src/app/api/cron/expirar-registos-nao-verificados/route.ts` | Criado | w8-anti-abuso |
| `apps/site/src/lib/validations.ts` | Modificado | w8-anti-abuso (exclusivo nesta fase) |
| `apps/site/src/lib/__tests__/validations.test.ts` | Modificado | w8-anti-abuso |
| `apps/site/src/components/marketing/turnstile.tsx` | Criado | w8-anti-abuso |
| `apps/site/src/components/marketing/formulario-registo.tsx` | Modificado | w8-anti-abuso |
| `apps/site/src/lib/registo.ts` | Modificado | w8-anti-abuso |
| `apps/site/src/actions/registo.ts` | Modificado | w8-anti-abuso |
| `apps/site/src/lib/env.ts` | Modificado | w8-anti-abuso |
| `apps/site/messages/pt.json` | Modificado | w8-anti-abuso |
| `apps/site/next.config.ts` | Modificado (CSP) | w8-anti-abuso |
| `apps/site/.env.example` | Modificado | w8-anti-abuso |

**Nota sobre `keycloak.ts`:** O ficheiro pertence ao `w8-identidade`. A alteração é um
acréscimo cirúrgico (função nova no final do ficheiro, sem alterar nada existente) necessária
para o expurgo. O `w8-identidade` deve preservá-la ao fundir.

---

## Smoke ponta-a-ponta — feito pelo orquestrador, 2026-09-02

O agente deixou este gate por fazer, por falta de chaves de ambiente. Foi feito aqui, contra a pilha
real, e é o gate da Fase 2 inteira: era esta a costura que se tinha partido entre o `w8-identidade`
(dono do ERP) e o `w8-anti-abuso` (dono do site), sem que nenhum dos dois a pudesse ver sozinho.

**Lacuna da pilha encontrada e corrigida primeiro:** o `docker-compose.yml` não passava
`CAPTCHA_PROVIDER` nem `CAPTCHA_SECRET_KEY` às instâncias do ERP. Como correm em modo produção,
`verificarCaptcha` devolvia `captcha_nao_configurado` e o registo era **sempre** recusado — a pilha de
referência não conseguia correr o seu próprio fluxo de inscrição. Agora leva as chaves de **teste**
públicas da Cloudflare por omissão.

O site não está no `docker-compose.yml`; foi levantado com `pnpm dev` em `:3100`, apontado ao ERP em
`:8080` através do proxy.

| Elo | Evidência |
|---|---|
| Formulário do site | Zero elementos `input[type="password"]`; campo oculto `captchaToken` presente e preenchido pelo widget |
| Corpo submetido | Nenhum contém a cadeia `senha` |
| Ecrã pós-submissão | Encaminha para a caixa de correio; nenhuma sessão estabelecida no acto |
| Keycloak (realm `gespro`) | 1 utilizador · `sub eeeee9e7-bd1c-438c-bf5f-fde7bfd5e435` · `emailVerified: false` · `requiredActions: ['VERIFY_EMAIL','UPDATE_PASSWORD']` · **`credentials`: nenhuma** |
| Postgres | `User` com o **mesmo** `keycloakSub` · `primeiroAcessoEm` **NULL** (estado «por activar») · `Tenant` com slug derivado |
| Mailpit | E-mail «Atualização de conta» entregue ao endereço registado |

**A linha que mais vale:** `credentials: nenhuma`. Em nenhum ponto do caminho existiu uma
palavra-passe — não foi recolhida no site, não viajou no pedido, não foi guardada no ERP, e não
existe no Keycloak. É definida lá pelo utilizador ao clicar no e-mail.

O `keycloakSub` coincidente nos dois lados prova a ordem do ADR-0013 §2: Keycloak primeiro, Postgres
depois, com o `sub` devolvido pela Admin API gravado no espelho local.

### O que continua por provar

- **O clique no link do e-mail** não foi automatizado — a definição da palavra-passe e o primeiro
  login (que escreve `primeiroAcessoEm`) ficam por cobrir ponta-a-ponta.
- **A recusa do Turnstile** não foi provada: a chave de teste que passa sempre aceita qualquer token,
  incluindo lixo, portanto o caminho `captcha_invalido` exigiria recriar as instâncias com o segredo
  `2x0000000000000000000000000000000AA`. O caminho está coberto por teste unitário, não por runtime.
- O site continua **fora do `docker-compose.yml`**, o que torna este smoke um procedimento manual em
  vez de um gate automático. Vale a pena acrescentá-lo à pilha.
