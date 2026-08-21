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

1. **Topologia multi-tenant: realm único + Organizations.** Um realm `gespro` alberga todos os
   tenants; cada tenant é uma **Organization** do Keycloak. A funcionalidade é GA desde o Keycloak 26
   e entrega nativamente o que precisamos: adesão por convite, fornecedor de identidade próprio por
   organização com correspondência de domínio de e-mail, e decoração do token com o `organization`
   scope.

2. **O `tenantId` viaja como claim.** O token de acesso passa a transportar a organização do
   utilizador; o ERP resolve o `tenantId` a partir dela. A regra inviolável do `CLAUDE.md` mantém-se
   intacta e reforça-se: o `tenantId` continua a **não vir do cliente** — vem de um token assinado
   pelo Keycloak e verificado no servidor, o que é uma garantia mais forte do que a actual.

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

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Keycloak, realm único + Organizations** ✅ | GA desde o Keycloak 26; MFA, federação e políticas prontas; provisionamento por API numa chamada; escala para milhares de tenants sem degradar o arranque; software livre, sem aprisionamento a fornecedor | Um serviço com estado a mais para operar (ver ADR-0012); cadência de actualização exigente; funcionalidade relativamente recente |
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
  A CSP ganha o domínio do Keycloak em `form-action` e `connect-src`.
- A verificação de subscrição bloqueada (`ConfiguracaoFiscal.statusAtivo`) **permanece no ERP**, não
  migra para o Keycloak: é uma regra de negócio sobre o estado da assinatura, não sobre a identidade.
  O utilizador autentica-se com sucesso e o ERP recusa a sessão — o que dá, aliás, melhor mensagem
  de erro do que a recusa silenciosa actual.
- A ambiguidade de login cross-tenant resolve-se por construção: o utilizador escolhe a organização
  no Keycloak, ou é encaminhado por correspondência de domínio de e-mail.

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
- Depender das Organizations é depender de uma funcionalidade com poucos anos. A saída, se necessária,
  é o mapeamento por atributo de utilizador mais um claim próprio — mais trabalho, mas sem perda de
  dados. O risco é gerível.
