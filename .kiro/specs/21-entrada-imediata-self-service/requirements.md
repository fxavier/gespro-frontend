# Requisitos: Entrada imediata no produto após o registo self-service

## Introdução

O funil público já existe e está implementado: o site de marketing (spec 18, `apps/site`)
com `/precos` e `/comecar`, e a fronteira pública do ERP (spec 19) com
`POST /api/publico/registo`, provisionamento atómico do tenant, catálogo de planos e
faturação Stripe. **O que não existe é a última perna**: quem se regista não entra no
produto — fica no site com «verifique o e-mail» e depende do `execute-actions-email` do
Keycloak para definir a palavra-passe e só então entrar.

Isso é o comportamento desenhado pelo **ADR-0013 §5**, que removeu deliberadamente o
`TokenHandoff`, o campo `senha` do formulário público e a rota `/auth/registo-callback`. O
argumento continua válido no seu próprio contexto — mas o contexto mudou duas vezes desde
então:

- **ADR-0029** trouxe o início de sessão de volta para o ERP (Direct Access Grant). Já não
  há salto de domínio no login, e o ERP já fala com o *token endpoint* do Keycloak.
- **ADR-0030** pôs o ERP a **escrever credenciais** pela Admin API (`reset-password`,
  `temporary: false`) e estabeleceu que uma conta cujo dono responde pelo endereço nasce
  com `emailVerified: true` e sem `VERIFY_EMAIL` pendente — porque o *direct grant*
  **recusa** contas com acções obrigatórias pendentes.

Com essas duas peças no sítio, a entrada imediata deixa de precisar do aparato que o
ADR-0013 §5 rejeitou (segredo de assinatura dedicado, TTL de 60 s, `jti`, consumo atómico,
tabela, rota de callback). Este spec entrega a entrada imediata **sem ressuscitar o
handoff**, ao preço de uma reversão menor e explícita do ADR-0013: o formulário público
volta a ter palavra-passe, e a verificação de e-mail deixa de ser a porta de entrada para
passar a ser um **travão selectivo** sobre o que o tenant pode fazer lá dentro.

Decisões de enquadramento tomadas com o dono do produto (2026-09-14):

| Eixo | Decisão |
|---|---|
| Âmbito | Fechar o gap de entrada. `apps/site` mantém-se; nada de redesenho do funil |
| Entrada | Sessão imediata, verificação de e-mail pendente e a travar operações nomeadas |
| Subscrição | Trial de 14 dias sem cartão. O Checkout Stripe **continua** dentro do ERP |
| Domínios | `gestpro.co.mz` (site) + `app.gestpro.co.mz` (ERP) |

Skills obrigatórias: `api-conventions`, `ui-conventions`, `prisma-conventions`,
`engineering:architecture` (ADR-0031 — Requisito 1), `estado-com-escritor` (Requisito 4).

---

## Requisitos

### Requisito 1 — A sessão nasce na origem do ERP

1. Concluído o registo, o utilizador DEVE ficar autenticado no ERP e ser encaminhado para
   `/dashboard?onboarding=1`, sem escrever credenciais uma segunda vez e sem depender de
   e-mail.
2. O *cookie* de sessão DEVE ser emitido pela própria origem `app.gestpro.co.mz`, com as
   defesas actuais intactas: `SameSite=Lax`, `Secure`, `HttpOnly`. **Não** é aceitável
   relaxar `SameSite` para `None` para permitir que uma origem diferente estabeleça a
   sessão.
3. Em consequência de (2), o **formulário de registo passa a ser servido pelo ERP** em
   `app.gestpro.co.mz/registo`. A palavra-passe nunca atravessa o servidor do site.
4. Esta decisão reverte parcialmente o ADR-0013 §5 e DEVE ser registada num ADR próprio
   (**ADR-0031**), que supersede §4 e §5 do ADR-0013 nos pontos que toca e declara
   explicitamente o que continua a valer (Keycloak como único depósito e verificador de
   credenciais; `TokenHandoff` continua morto).
5. O provisionamento DEVE continuar a ter **uma só implementação** de fronteira pública —
   idempotência, captcha, limitação de tráfego, validação Zod e ordem Keycloak→Postgres —
   partilhada pela Server Action do ecrã e pelo Route Handler `POST /api/publico/registo`,
   que se mantém no contrato publicado em `docs/handoff/site-provisionamento.md`.

### Requisito 2 — O site continua a ser o funil, e só isso

1. `/comecar` DEVE encaminhar (307) para `${NEXT_PUBLIC_APP_URL}/registo`, preservando
   `plano` e os parâmetros `utm_*`, e DEVE manter um `<a>` visível como alternativa sem
   JavaScript.
2. `/precos` DEVE continuar a servir o catálogo de `GET /api/publico/planos` e a
   pré-seleccionar o plano por *query string*, sem hardcodar preços nem limites.
3. O componente `FormularioRegisto`, a Server Action `registarEmpresa`, o cliente
   `lib/registo.ts` e as mensagens de erro associadas do `apps/site` DEVEM ser **removidos**
   — não desactivados nem deixados mortos.
4. A página `/registo` do ERP DEVE ser visualmente contínua com o site (mesma marca,
   `packages/brand`) e marcada `noindex`, com canónico a apontar para
   `https://gestpro.co.mz/comecar`.
5. A CSP e os cabeçalhos do ERP DEVEM acomodar a nova página pública — incluindo o widget
   Turnstile — sem alargar a política das rotas autenticadas.

### Requisito 3 — Identidade criada com palavra-passe, sem acções obrigatórias pendentes

1. O formulário DEVE incluir palavra-passe e confirmação, validadas por Zod com o mesmo
   mínimo de `/auth/mudar-palavra-passe` (10 caracteres), e o campo DEVE ser `autocomplete="new-password"`.
2. A ordem do ADR-0013 §2 mantém-se — **Keycloak primeiro, Postgres depois**:
   `garantirUtilizador({ accoes: [], emailVerificado: false })` seguido de
   `definirPalavraPasse(sub, senha, { temporaria: false })`, e só depois a `$transaction`
   do provisionamento.
3. A conta NÃO PODE nascer com `VERIFY_EMAIL` nem `UPDATE_PASSWORD` pendentes: qualquer uma
   delas faz o *direct grant* recusar e tranca o tenant acabado de criar (ADR-0029 §5,
   ADR-0030 §3).
4. Se a escrita da palavra-passe falhar depois de o utilizador existir no Keycloak, o pedido
   DEVE falhar **antes** de tocar em Postgres e ser repetível com a mesma `Idempotency-Key`
   — o estado residual é um utilizador Keycloak sem `User` local, que por ADR-0011 não
   autoriza nada e é o que a reconciliação diária do ADR-0013 §3 já reporta.
5. A palavra-passe NÃO PODE ser escrita em Postgres, em log, em URL, em `respostaJson` da
   `ChaveIdempotencia`, nem em evento de analytics. O `fingerprint` SHA-256 do corpo
   (idempotência) cobre-a por construção e DEVE ser documentado como tal.
6. O modo *convite por e-mail* do ADR-0013 §5-bis e o modo *palavra-passe atribuída* do
   ADR-0030 mantêm-se inalterados para utilizadores criados por um administrador **dentro**
   do tenant. Este requisito aplica-se só ao administrador criado pelo registo público.

### Requisito 4 — A verificação de e-mail deixa de trancar a porta e passa a travar actos

1. Após o provisionamento, e fora da transacção, DEVE ser enviado um e-mail de verificação
   com uma ligação assinada para `GET /api/publico/verificar-email`.
2. A ligação NÃO CONCEDE sessão — o seu único efeito é pôr `emailVerified: true` no Keycloak
   pela Admin API. É idempotente: a segunda visita não é erro. Prazo de validade: 24 horas,
   com reenvio a partir do produto.
3. O estado de verificação DEVE ser lido do claim `email_verified` do *access token* do
   Keycloak, propagado para a sessão na emissão e na re-resolução de 15 minutos do ADR-0011.
   NÃO PODE ser criada uma cópia local do estado nem uma chamada ao Keycloak por pedido.
4. Enquanto não verificado, o tenant DEVE poder explorar, configurar e **pagar**, e DEVE ser
   recusado em exactamente dois actos, cada um verificado no seu próprio serviço (mesmo
   padrão do ADR-0027 §3, sem abstracção partilhada):
   - emitir um documento fiscal;
   - criar ou reactivar um `User`.
   A recusa é `BusinessRuleError` nomeando a causa e o caminho para resolver.
5. Pagar, exportar e verificar NUNCA são travados — pelo mesmo motivo que o estado `LEITURA`
   do ADR-0027 os deixa passar: um estado de onde o cliente não pode sair é uma armadilha.
6. O `/dashboard` DEVE mostrar um aviso persistente com reenvio enquanto a verificação estiver
   pendente, e a checklist de onboarding DEVE ganhar «confirmar e-mail» como primeiro item.
7. Cada travão DEVE ter teste da transição (não-verificado → recusa; verificado → passa),
   conforme a skill `estado-com-escritor`.

### Requisito 5 — Anti-abuso numa superfície que passa a aceitar credenciais

1. Turnstile (ADR-0016) mantém-se, agora servido pelo ERP: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
   passa a ser também variável do `apps/erp`; o segredo continua só no ERP, *fail-closed*
   em produção.
2. A limitação de tráfego do registo DEVE passar a **backend distribuído** (Redis, ADR-0014)
   antes da abertura ao público. O limitador em memória multiplica o limite pelo número de
   instâncias — gap 2 de `docs/handoff/feat-19-onboarding.md` §5b — e a superfície passa a
   aceitar palavras-passe, o que a torna também um alvo de enumeração de contas.
3. A resposta de e-mail já registado NÃO PODE distinguir-se em tempo nem em forma da resposta
   de sucesso o suficiente para servir de oráculo de enumeração; a mensagem visível ao
   utilizador mantém-se explícita (`EMAIL_JA_REGISTADO`) por ser requisito de usabilidade
   documentado no CONTEXT.md — a mitigação é a limitação de tráfego por IP, não a ambiguidade.
4. O limite por `Idempotency-Key` reaberta (`EM_CURSO` > 10 min) mantém-se inalterado.

### Requisito 6 — Alinhamento com o modelo comercial em vigor

1. `GET /api/publico/planos` e as páginas do site NÃO PODEM publicar limites que o produto
   não verifica (ADR-0027 §2). `src/lib/planos.ts` já não expõe `documentosMes` nem
   `produtos`; o site DEVE ser auditado para garantir que não os mostra em nenhuma superfície
   (tabela de preços, FAQ, MDX de recursos, `messages/*.json`).
2. Se o estado `LEITURA` do ADR-0027 §6 entrar antes deste spec, a página `/registo` e a
   checklist NÃO PODEM assumir que `TRIAL` é o único estado inicial possível.
3. O ADR-0027 está **Proposto**. Este spec não depende dele, mas a sua aceitação altera
   `EstadoAssinatura` e o pipeline de escrita — a ordem de execução entre os dois DEVE ser
   decidida antes de começar (ver `tasks.md`, tarefa 0).

### Requisito 7 — Medição do funil através da fronteira de domínio

1. A conversão DEVE continuar mensurável de ponta a ponta apesar de `/registo` mudar de
   domínio. O evento de registo concluído DEVE ser emitido **do servidor do ERP** para a API
   de eventos do Plausible, com o domínio do site, sem introduzir script de analytics nem
   *cookies* no ERP (ADR-0008).
2. Os parâmetros `utm_*` DEVEM sobreviver ao salto `site → ERP` e ser registados no evento,
   sem PII: nunca e-mail, nome, NUIT ou IP em claro.

### Requisito 8 — Testes e gates

1. Integração: provisionamento com palavra-passe é atómico — falha em qualquer passo não
   deixa `Tenant` nem `User` local.
2. Integração: a mesma `Idempotency-Key` com o mesmo corpo devolve a mesma resposta e não
   cria um segundo tenant nem uma segunda identidade no Keycloak.
3. Unitário: `garantirUtilizador` com `accoes: []` não pede `VERIFY_EMAIL`; regressão
   explícita contra o valor por omissão.
4. Unitário: a ligação de verificação é idempotente, expira às 24 h e não estabelece sessão.
5. Transição (skill `estado-com-escritor`): os dois travões do Requisito 4.4, nos dois
   sentidos.
6. E2E (`apps/erp`): registo → sessão → `/dashboard?onboarding=1` com aviso de verificação;
   verificar → aviso desaparece e o acto travado passa.
7. E2E (`apps/site`): `/comecar` encaminha para o ERP preservando `plano` e `utm_*`.
8. `pnpm check`, `pnpm gates`, `pnpm build` verdes nas duas apps; o gate de cores hardcoded
   do site mantém-se verde após a remoção do formulário.

### Requisito 9 — Bloqueadores herdados, que este spec não fecha mas não pode ignorar

Nenhum dos pontos abaixo é introduzido aqui; todos passam a estar no caminho crítico da
abertura ao público e DEVEM ter dono e data antes do primeiro cliente real:

1. Migração `19xx_onboarding_provisionamento` por gerar (spec 19, tarefa 1.4 — orquestrador).
2. *Smoke* contra a API real do Stripe por correr; os 6 `Price` em USD por criar no Dashboard
   (spec 19, §5b gap 1).
3. `criarSubscricaoTrial` é *fire-and-forget* e pode não executar em ambiente serverless
   (§5b gap 4).
4. Fiscalidade da própria subscrição por validar — IVA/retenção sobre serviço prestado do
   estrangeiro a cliente moçambicano (ADR-0009, §5b gap 6). **Bloqueante antes de produção.**
5. Sem `passwordPolicy` no realm: o gate efectivo de força continua a ser o Zod do formulário
   (ADR-0030, «O que isto custa»).
