# ADR-0010 — Keycloak como fornecedor de identidade

- **Estado**: Proposto
- **Data**: 2026-08-21
- **Contexto**: Spec 20 (Prontidão para Produção) · Wave 8
- **Substitui parcialmente**: [ADR-0001](./0001-stack-e-scaffolding.md) e [ADR-0002](./0002-wave0-enxuta-vs-spec01.md), na parte que fixou autenticação por `Credentials` com hash local
- **Relacionados**: [ADR-0011](./ADR-0011-fronteira-autorizacao.md) (fronteira de autorização), [ADR-0012](./ADR-0012-alojamento-keycloak.md) (alojamento), [ADR-0013](./ADR-0013-migracao-identidade.md) (migração)
- **Skills**: `engineering:architecture`, `api-conventions`

## Contexto

A autenticação do GestPro é hoje inteiramente própria: `Credentials` provider do Auth.js v5, hash
argon2 em `User.passwordHash`, limitação de tentativas em `LoginAttempt`, tokens de recuperação em
`PasswordResetToken`, convites em `UserInvite`, verificação de e-mail em `TokenVerificacaoEmail` e
um segundo provider `handoff` para transferir a sessão do site para o ERP. São **cinco tabelas e
dois providers** dedicados a identidade, todos escritos e mantidos por nós.

Funciona, e está testado. O problema é o que **ainda não existe** e que qualquer cliente empresarial
vai pedir dentro do primeiro ano:

- Autenticação multifactor (TOTP, WebAuthn, códigos de recuperação).
- Federação com o fornecedor de identidade do cliente — Microsoft Entra ID, Google Workspace, LDAP.
  Numa PME moçambicana com Microsoft 365, «entrar com a conta da empresa» é requisito de compra.
- Políticas de palavra-passe por tenant, expiração, histórico, bloqueio administrativo.
- Encerramento de sessão em todos os dispositivos, revogação imediata, sessões visíveis ao utilizador.
- Trilho de autenticação separado do trilho de negócio, com retenção própria.

Construir isto de raiz é meses de trabalho num domínio onde os erros são caros e não diferenciam o
produto. Ninguém compra um ERP pela qualidade do seu ecrã de login.

Acresce que a base actual tem uma fraqueza já registada: **o login é ambíguo quando o mesmo e-mail
existe em tenants diferentes** — o `findFirst` sem `tenantSlug` devolve o primeiro que encontrar.
É um problema de suporte à espera de acontecer assim que houver clientes com colaboradores partilhados.

O sistema **nunca esteve em produção** e não tem utilizadores reais. Esta é, por isso, a janela mais
barata que alguma vez haverá para trocar o fornecedor de identidade: não há migração de palavras-passe,
não há sessões activas a invalidar, não há clientes a reeducar.

## Decisão

**Adoptar o Keycloak como fornecedor de identidade do GestPro**, com o ERP e o site a actuarem como
clientes OIDC.

1. **Topologia multi-tenant: realm único, e as Organizations ficam para depois.** Um realm `gespro`
   alberga todos os tenants. A versão inicial deste ADR fazia de cada tenant uma **Organization** do
   Keycloak; essa parte é **adiada** — ver ponto 2 e a nota de revisão no fim desta secção.

   Realm por tenant continua rejeitado, e por uma razão que não muda: o Keycloak carrega todos os
   realms em memória, e acima de algumas centenas o arranque e o consumo degradam-se. É incompatível
   com um SaaS que provisiona tenants sem intervenção humana.

2. **O `tenantId` é resolvido do `User` local, não de um claim.** O token do Keycloak transporta a
   identidade — `sub`, `email`, `name`, `email_verified` — e o ERP resolve `sub → User → tenantId`.
   A regra inviolável do `CLAUDE.md` mantém-se: o `tenantId` continua a **não vir do cliente**. Vem
   de uma linha em Postgres, alcançada a partir de um `sub` que veio num token assinado pelo Keycloak
   e verificado no servidor.

3. **Fluxo de autorização com PKCE**, sem exposição de segredo no navegador. O Auth.js v5 mantém-se
   como biblioteca cliente, com o provider `keycloak` a substituir os dois providers `Credentials`.

4. **O Keycloak passa a ser dono de**: palavras-passe e respectiva política, MFA, recuperação de
   palavra-passe, verificação de e-mail, convites de utilizador, detecção de força bruta, sessões e
   respectiva revogação, e federação. As tabelas `PasswordResetToken`, `UserInvite`,
   `TokenVerificacaoEmail` e `LoginAttempt` são descontinuadas (ver ADR-0013).

5. **O modelo `User` permanece**, reduzido a espelho local da identidade: `keycloakSub` (identificador
   estável do Keycloak, único), `email`, `nome`, `tenantId`, `ativo`, `deletedAt`, e as relações de
   papéis. Deixa de ter `passwordHash`. Continua a ser a chave estrangeira de tudo o que no domínio
   referencia um utilizador — 231 Server Actions gravam `userId` e não podem passar a depender de
   uma chamada de rede para resolver quem agiu.

> **Nota de revisão (2026-08-29) — porque é que as Organizations foram adiadas.**
> Este ADR justificava-as com duas coisas. A primeira era o isolamento: «com Groups o isolamento
> passa a ser convenção, não fronteira». Mas o [ADR-0011](./ADR-0011-fronteira-autorizacao.md) fixou
> entretanto que a fronteira de tenant é imposta em **Postgres** — quem existe no Keycloak sem `User`
> local não entra, e um `tenantId` divergente recusa a sessão. O claim da organização seria uma
> verificação redundante, não a fronteira. A segunda era a ambiguidade de login cross-tenant, que
> desapareceu quando se decidiu **uma Identidade por pessoa, com e-mail único em todo o sistema**
> (ver `CONTEXT.md`): `sub → User → tenantId` não tem ambiguidade nenhuma para resolver.
>
> Sobra **um** benefício que nem Groups nem um realm simples dão: **fornecedor de identidade por
> organização com correspondência de domínio de e-mail** — o «entrar com a conta da empresa» do
> Microsoft 365. É real, e é requisito de compra empresarial. Mas é uma hipótese ainda não validada
> por nenhum cliente, e o preço de a comprar já é concreto: provisionar uma organização em cada
> registo, um mapper e um claim a manter, e a tarefa de reconciliação do
> [ADR-0013](./ADR-0013-migracao-identidade.md) §3 a comparar organizações com tenants.
>
> Não vale a simetria com o argumento «fazer agora é o mais barato que será». Trocar de fornecedor
> de identidade mais tarde custa migrar palavras-passe e reeducar clientes — custo que **cresce com
> o sucesso**. Acrescentar Organizations mais tarde é um backfill idempotente a partir de
> `User.tenantId`, que já é fonte de verdade, sem nada visível para o utilizador. Um custo cresce,
> o outro não. Faz-se já o primeiro e adia-se o segundo.
>
> **Gatilho de reabertura:** o primeiro cliente que peça federação com o fornecedor de identidade
> dele. Nessa altura, ADR próprio.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Keycloak, realm único, tenant resolvido em Postgres** ✅ | MFA, federação e políticas prontas; escala para milhares de tenants sem degradar o arranque; software livre, sem aprisionamento; nada depende de funcionalidade recente | Um serviço com estado a mais para operar (ver ADR-0012); cadência de actualização exigente; federação **por tenant** fica por fazer |
| Keycloak, realm único + Organizations | Federação por tenant com correspondência de domínio, pronta a usar; adesão por convite nativa | Compra hoje uma funcionalidade recente para um requisito que nenhum cliente pediu ainda; acrescenta provisionamento, mapper e reconciliação. **Adiada**, não rejeitada — ver nota de revisão |
| Keycloak, realm por tenant | Isolamento máximo — chaves, políticas e federação totalmente independentes | O Keycloak carrega todos os realms em memória: acima de algumas centenas o arranque e o consumo degradam-se de forma conhecida. Incompatível com um SaaS self-service que provisiona tenants sem intervenção |
| Keycloak, realm único + Groups | Funciona em qualquer versão; o mais simples de configurar | O isolamento passa a ser convenção, não fronteira: um erro num mapper expõe cross-tenant. Trocamos uma garantia estrutural por disciplina — exactamente o oposto do que o resto da arquitectura faz |
| Manter autenticação própria | Zero infraestrutura nova; o código já existe e está testado | MFA, federação e políticas por tenant ficam por construir — meses de trabalho não diferenciador, num domínio onde os erros são caros |
| Auth0 / Clerk / WorkOS | Nada para operar; excelente experiência de programação | Custo por utilizador activo mensal, que escala com o sucesso do produto e é cobrado em moeda estrangeira; dados de identidade dos clientes fora da nossa infraestrutura, o que é sensível num ERP com dados fiscais |
| AWS Cognito | Integra-se com a AWS que já usamos; barato | Multi-tenancy fraco (um user pool por tenant tem limites rígidos); personalização de fluxos limitada; federação empresarial menos completa que a do Keycloak |

Racional: o custo real do Keycloak não é a integração — é a operação. Aceitamo-lo porque a
alternativa que evita a operação (SaaS de identidade) transfere dados de identidade de clientes
moçambicanos para fora da nossa infraestrutura e introduz um custo variável em USD por utilizador
activo, num produto cujo preço ainda não foi validado no mercado. Entre construir e alugar,
escolhemos **instalar**: o Keycloak dá-nos federação empresarial de nível comercial sem custo por
utilizador e sem exportar as identidades dos clientes.

## Consequências

**No código da aplicação**

- `src/lib/auth.ts` perde os dois providers `Credentials` e passa a ter um provider OIDC. O
  `authorize()` — hoje com regras de negócio embebidas (e-mail verificado, subscrição bloqueada,
  limitação de tentativas) — desaparece; as regras migram para o `callbacks.signIn` e para o
  `jwt`, mantendo-se **do lado do servidor** (ver ADR-0011).
- `middleware.ts` continua a ser o único dono dos cabeçalhos de segurança e dos caminhos públicos.
  **A CSP não muda** — a versão inicial deste ADR dizia que ganhava o domínio do Keycloak em
  `form-action` e `connect-src`, e estava errada. O `signIn` submete para a **nossa** origem
  (`form-action 'self'` cobre); o salto para o Keycloak é um **302**, e uma navegação de topo não é
  restringida pela CSP — o `form-action` limita o alvo de uma submissão, não o destino de um
  redireccionamento, e a directiva `navigate-to` foi abandonada da CSP3; a troca do código por tokens
  é feita **servidor-a-servidor**, fora do alcance da CSP do navegador; e o regresso é outra navegação
  de topo para a nossa própria origem, já dentro de `PUBLIC_PATHS`. Importa não alargar por engano:
  a Fase 3 liga `CSP_ENFORCE=true`, e cada origem acrescentada sem necessidade enfraquece de forma
  permanente a política que essa fase torna obrigatória.
- **Não há logout único, e é deliberado.** *Front-channel logout* obrigaria o Keycloak a carregar um
  URL nosso num iframe, que o `frame-ancestors 'none'` bloqueia — e essa directiva fica, porque é o
  que impede *clickjacking* num ERP. *Back-channel logout* precisaria de um sítio onde invalidar a
  sessão, e as nossas sessões são JWT sem estado: exigiria a lista de negação partilhada que o
  ADR-0011 rejeitou. Constrói-se uma peça com invalidação para ganhar 15 minutos sobre uma garantia
  que já temos.

  Portanto o que este ADR prometia como «revogação imediata» lê-se assim: encerrar a sessão SSO no
  Keycloak corta a renovação, e a sessão no ERP cai **na re-resolução seguinte — 15 minutos no
  máximo** (ADR-0011). É a mesma garantia em todo o lado, o que também a torna explicável a um
  cliente sem asteriscos. Se algum dia houver requisito de conformidade que exija corte instantâneo
  em todos os dispositivos, isso reabre a lista de negação e merece ADR próprio.
- A verificação de subscrição bloqueada (`ConfiguracaoFiscal.statusAtivo`) **permanece no ERP**, não
  migra para o Keycloak: é uma regra de negócio sobre o estado da assinatura, não sobre a identidade.
  O utilizador autentica-se com sucesso e o ERP recusa a sessão — o que dá, aliás, melhor mensagem
  de erro do que a recusa silenciosa actual.
- A ambiguidade de login cross-tenant resolve-se por construção, mas por outra via: o e-mail é único
  em todo o sistema e uma Identidade pertence a exactamente um Tenant, portanto não há escolha a
  fazer. Consequência assumida: quem gere duas empresas precisa de dois endereços de e-mail.

**No provisionamento**

- Criar um tenant passa a ser uma transacção distribuída de facto: `Tenant` em Postgres **e**
  Organization no Keycloak. Não há transacção que abranja os dois. O provisionamento passa a ser
  **idempotente e reconciliável** — a chave de idempotência que já existe no registo público
  (`ChaveIdempotencia`) é reutilizada, e uma tarefa de reconciliação detecta e repara divergências.
  Está detalhado no ADR-0013.

**Na operação**

- O login passa a depender de um serviço externo ao contentor da aplicação. Se o Keycloak estiver em
  baixo, **ninguém entra** — mas quem já tem sessão continua a trabalhar, porque a sessão do Auth.js
  é um JWT verificado localmente. A disponibilidade do Keycloak passa a ser um SLO de primeira
  linha (ADR-0019).
- O Keycloak suporta cada versão menor durante cerca de três meses. Actualizar deixa de ser opcional
  e passa a ser cadência trimestral planeada, com ensaio em `dev` antes de `prod` (ADR-0012).

**Na segurança**

- A detecção de força bruta nativa do Keycloak substitui a tabela `LoginAttempt`, o que **reduz o
  âmbito** do limitador de tráfego distribuído do ADR-0014: este deixa de precisar de cobrir o login
  e passa a cobrir apenas o registo público, os convites e as exportações.
- Ganha-se MFA, revogação de sessão e política de palavra-passe por organização sem escrever código.

**Riscos assumidos**

- A rotação de token de renovação no Auth.js v5 tem arestas conhecidas em App Router. Mitiga-se com
  sessão curta e renovação explícita, e o comportamento tem de ser coberto por teste E2E que
  atravesse a expiração — não por inspecção.
- ~~Depender das Organizations é depender de uma funcionalidade com poucos anos.~~ Risco **eliminado**
  ao adiá-las (ver nota de revisão). Em troca assume-se outro, menor e datado: até haver Organizations,
  não há federação empresarial por tenant. Se um negócio se perder por isso antes de a construirmos,
  é esse o sinal de reabertura — e é um sinal que se vê, ao contrário de uma funcionalidade que se
  compra e ninguém usa.
