# ADR-0031 — Entrada imediata: o registo público volta a ter palavra-passe

**Estado:** Proposto
**Data:** 2026-09-15
**Substitui:** ADR-0013 §4 e §5 (o registo público deixa de criar identidades sem credencial e
de depender do e-mail de acções para dar entrada no produto)
**Depende de:** ADR-0010, ADR-0011, ADR-0013 (§2), ADR-0016, ADR-0027, ADR-0029, ADR-0030

## Contexto

Hoje, quem se regista em `gestpro.co.mz/comecar` não entra no produto. O ADR-0013 §5 tirou o
campo de palavra-passe do formulário público e pôs a entrada inteiramente dependente de um
e-mail: identidade criada com `VERIFY_EMAIL` + `UPDATE_PASSWORD` pendentes, `execute-actions-email`
disparado, e o produto só se abre a quem clicar nesse link.

É a mesma premissa que o ADR-0030 já derrubou para o convite de utilizadores — «o convite por
e-mail pressupõe e-mail a funcionar e a chegar» — aplicada ao pior sítio possível para ela ser
falsa: **o primeiro minuto de quem ainda não é cliente**. Quem experimenta um ERP não vai
abrir o webmail da empresa para procurar na pasta de spam; fecha o separador. O tempo-até-valor
de um funil self-service não sobrevive a um salto para o correio.

O ADR-0030 resolveu metade do problema por acidente: já existe `definirPalavraPasse(sub, valor,
{ temporaria: false })`, já existe um ecrã de login nosso por *Direct Access Grant* (ADR-0029),
e já está verificado que uma palavra-passe escrita com `temporary: false` **remove**
`UPDATE_PASSWORD` e faz o *direct grant* funcionar de imediato. Falta decidir **onde vive o
formulário** — e é aí que está a única decisão difícil deste ADR.

O requisito «a sessão tem de existir no fim da submissão» colide com «o *cookie* pertence a
`app.gestpro.co.mz`». O formulário está hoje em `gestpro.co.mz`, outro domínio.

## Decisão

**O formulário de registo passa a ser servido pelo ERP, em `app.gestpro.co.mz/registo`, com
campo de palavra-passe. O site fica só com o funil.**

### Alternativas consideradas

| Opção | Porquê não |
|---|---|
| **Formulário no site, `fetch` *cross-origin* com `credentials: 'include'`** | Obriga a `SameSite=None` no *cookie* de sessão **de todo o ERP**, não só do registo. É uma regressão de CSRF em toda a aplicação para poupar um salto de domínio num ecrã. Recusada sem hesitação |
| **Ressuscitar o `TokenHandoff` do ADR-0013 §5** | Segredo próprio, TTL de 60 s, `jti`, consumo atómico, limitador, rota e componente de *callback* — modelo, migração e ~145 linhas de serviço, para poupar o mesmo salto de domínio. E a palavra-passe continuaria a atravessar o servidor do site, ou a pessoa entraria sem nunca a ter definido |

O ADR-0013 §5 matou o handoff com o argumento de que «um *token* que não concede nada não
precisa de ser protegido». O simétrico é igualmente verdadeiro e é o que decide isto: **um
*token* que concede uma sessão obriga a todo o aparato**, e a única razão para o querer é
manter o formulário noutro domínio. Servir o formulário na origem que emite o *cookie* elimina
o problema em vez de o proteger.

### O que passa a valer

1. `RegistoTenantSchema` ganha `senha` + `confirmacao`, com o mesmo mínimo de 10 caracteres de
   `/auth/mudar-palavra-passe` (ADR-0030). O campo volta ao formulário público — é a inversão
   explícita do ADR-0013 §5.
2. A identidade nasce com `garantirUtilizador({ accoes: [], emailVerificado: false })` e a
   palavra-passe é escrita com `temporaria: false` **antes** da transacção em Postgres. Com
   `VERIFY_EMAIL` pendente o *direct grant* recusaria a sessão e o registo não daria entrada
   nenhuma — que é exactamente o defeito que este ADR existe para corrigir.
2-bis. **Só se escreve credencial em identidade que o próprio pedido criou.** A ordem do ponto
   anterior, lida à letra, abre duas tomadas de conta: `garantirUtilizador` é idempotente por
   e-mail e as recusas `EMAIL_JA_REGISTADO` e `NUIT_JA_REGISTADO` só chegam **dentro** da
   transacção, depois da credencial já estar escrita. Registar com o e-mail de um cliente
   existente trocar-lhe-ia a palavra-passe; registar o e-mail de uma vítima com um NUIT já
   registado deixaria uma identidade com a credencial do atacante, à espera de ser reaproveitada
   quando a vítima se registasse a sério. Portanto: verificação de existência da identidade
   **antes** da escrita, e remoção da identidade que este pedido criou quando a recusa é
   determinística. Numa falha **inesperada** a identidade fica — regra do ADR-0013 §3, e é
   deliberado: apagar por engano a identidade de um cliente real é pior do que deixar uma órfã.
3. A lógica pública — captcha, limitação, Zod, idempotência, Keycloak, transacção — vive numa
   **única** função partilhada (`registarTenant`). O Route Handler `POST /api/publico/registo`
   passa a adaptador HTTP, com os códigos de erro publicados inalterados. Isto não é arrumação:
   é o que mantém esta decisão reversível.
4. `/comecar` no site passa a `redirect(307)` preservando `plano` e `utm_*`. O formulário, o
   widget e o cliente HTTP saem do site. **A palavra-passe deixa de poder atravessar o servidor
   do site, porque o servidor do site deixa de ter por onde a receber.**
5. A verificação de e-mail passa a ser nossa: ligação assinada HMAC-SHA256 com
   `EMAIL_VERIFY_SECRET` (distinto do `AUTH_SECRET`), prazo de 24 h, sem tabela e sem consumo
   atómico. O efeito da ligação é pôr um booleano a `true` no Keycloak: é idempotente e **não
   concede sessão nenhuma** — é literalmente o critério do ADR-0013 §5, aplicado a um caso onde
   é verdadeiro.
6. O estado de verificação **não** ganha coluna local. Viaja no *access token* para o JWT e para
   a sessão, na emissão e na re-resolução de 15 minutos do ADR-0011.

### O que a verificação pendente trava

| Acto | Sem verificação | Racional |
|---|---|---|
| Emitir documento fiscal | **Recusado** | É o acto irreversível e com efeito para terceiros. Um registo feito com o e-mail de outra pessoa não emite documentos fiscais em nome dela |
| Criar ou reactivar `User` | **Recusado** | Convidar terceiros a partir de uma conta não confirmada é o vector de abuso que a verificação existe para fechar |
| Configurar, importar, explorar | Passa | É o tempo-até-valor que este ADR existe para reduzir |
| Checkout, Portal, pagar | Passa | Nunca se trava quem quer pagar (ADR-0027 §6) |
| Exportar | Passa | Os dados são do cliente |

Cada travão é verificado **no seu próprio serviço**, com a sua leitura, sem abstracção
partilhada — mesma escolha e mesmo racional do ADR-0027 §3 para os limites de plano.

## Consequências

**Aceites:**

- **O ERP vê a palavra-passe em claro**, agora também num ecrã não autenticado. Não a agrava: é
  a exposição que o ADR-0029 aceitou e o ADR-0030 documentou. Nunca em log, URL, Postgres nem
  corpo de resposta.
- O `fingerprint` da idempotência é SHA-256 de um corpo que passa a incluir a palavra-passe. É
  um digest de um corpo de alta entropia, não um verificador de credencial, e não é reversível.
  Fica dito no ficheiro, porque quem o ler daqui a um ano vai perguntar.
- **Salto de domínio visível a meio do funil.** Já existe hoje no botão «Entrar» do site. O
  custo real é a medição, que passa a evento servidor→Plausible com o domínio do site.
- A superfície pública volta a aceitar credenciais, portanto a **limitação de tráfego
  distribuída (ADR-0014/Redis) deixa de ser dívida herdada e passa a pré-requisito de abertura
  ao público**. Não é dívida deste ADR; é condição de o activar.

**Explicitamente não mudam:**

- `SameSite=Lax` no *cookie* de sessão. É o ponto inteiro da decisão.
- A excepção de CSP para o Turnstile é da rota `/registo`, não do ERP.
- O ADR-0013 §2 (Keycloak como fonte de verdade da identidade) e o ADR-0029 (*direct grant*)
  mantêm-se intactos. O ERP continua a **nunca guardar nem verificar** palavras-passe.

**Reversível:** se a conversão medida mostrar que o salto de domínio custa caro, o handoff do
ADR-0013 §5 volta a estar em cima da mesa — e volta contido na camada de apresentação, porque
a consequência 3 obriga a lógica pública a viver numa só função.

## Verificação

*Smoke* com servidor, Postgres e Keycloak reais: registo → sessão na mesma submissão →
repetição idempotente sem segundo tenant nem segunda identidade → ligação de verificação na
1.ª e na 2.ª visita → prazo expirado com reenvio → travões nos dois sentidos.
