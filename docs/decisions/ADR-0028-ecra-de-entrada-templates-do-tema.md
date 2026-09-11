# ADR-0028 — O ecrã de entrada: templates próprios no tema do Keycloak

- **Estado**: Proposto
- **Data**: 2026-09-11
- **Contexto**: Issue #57 · Wave 8
- **Substitui**: [ADR-0012](./ADR-0012-alojamento-keycloak.md) §8, **apenas** no tecto de personalização. A rejeição do *Direct Access Grant*, no mesmo §8, **mantém-se em vigor**.
- **Relacionados**: [ADR-0010](./ADR-0010-keycloak-fornecedor-identidade.md), [ADR-0011](./ADR-0011-fronteira-autorizacao.md), [ADR-0013](./ADR-0013-migracao-identidade.md), [ADR-0026](./ADR-0026-adiamento-fornecedor-infraestrutura.md)
- **Skills**: `engineering:architecture`, `ui-conventions`

## Contexto

Desde o ADR-0012, `/auth/login` não é um ecrã nosso: é um redireccionamento. O Client Component
dispara `signIn('keycloak')` e o browser salta para o Keycloak, com Authorization Code + PKCE e
cliente confidencial.

O §8 pôs um tecto explícito na personalização: o tema `gespro` estende o `keycloak.v2` e substitui
**apenas** as variáveis CSS derivadas do `packages/brand`, o logótipo e as cadeias em Português.
Os *templates* FreeMarker não se tocam. E o §8 concedeu, por escrito, o que isso implica:

> «Aceita-se que a **disposição** do ecrã seja a do Keycloak; o que não se aceita é que as cores,
> o logótipo e a língua o sejam.»

**O estado real, verificado:** o tema tem 68 linhas de CSS sobre três selectores
(`.pf-v5-c-login`, `.pf-v5-c-background-image`, `#kc-header-wrapper.pf-v5-c-brand`), 17 chaves de
texto e dois logótipos. Está montado pelo `docker-compose.yml` e o realm tem `loginTheme: gespro`.
As cores, o fundo, o logótipo e a língua **já são nossos**. O que não é nosso é a disposição do
cartão de login, que é a do PatternFly v5.

A queixa da issue #57 é de **coerência de marca** — não ausência de salto de domínio, não uma
credencial que o Keycloak não modela. E, feita essa distinção, o que sobra da queixa é
exactamente a peça que o §8 entregou de propósito.

## Decisão

### 1. O tecto do §8 sobe: os *templates* passam a ser nossos

O tema `gespro` passa a substituir quatro *templates* FreeMarker: `login.ftl`,
`login-update-password.ftl`, `login-verify-email.ftl` e `login-reset-password.ftl`.

**Foram considerados dois âmbitos.** Só o `login.ftl` — o ecrã que toda a gente vê todos os dias,
com o custo recorrente de um ficheiro — ou os quatro, cobrindo também o primeiro acesso e a
recuperação. **Escolheram-se os quatro**, aceitando que o custo de revalidação é proporcional ao
número de ficheiros: quatro leituras por subida de versão, não uma. A razão é a coerência — um
utilizador que define a palavra-passe num ecrã e entra noutro, com desenhos diferentes, vê a
costura que este ADR existe para apagar.

### 2. O *Direct Access Grant* continua rejeitado

A opção de manter o formulário no ERP e enviar as credenciais ao Keycloak por trás **não é
adoptada**, e a rejeição do §8 mantém-se pelas razões que lá estão: punha o ERP a receber
palavras-passe outra vez e matava MFA e federação, que são as duas coisas pelas quais se adoptou
o Keycloak (ADR-0010).

Acresce o que o ADR-0013 §2/§5-bis tornou verdade depois: os utilizadores são criados **sem
credencial**, com `VERIFY_EMAIL` e `UPDATE_PASSWORD` pendentes, e o *direct grant* recusa contas
com acções obrigatórias por cumprir. Adoptá-lo obrigaria a reconstruir no ERP o primeiro acesso e
a recuperação de palavra-passe — e a escrever credenciais pela Admin API.

Isto não se reabre por razões estéticas. Reabre-se se aparecer um requisito que o ecrã do Keycloak
não consiga servir de todo: uma credencial que ele não modela, ou a proibição contratual de
qualquer mudança de endereço.

### 3. A versão fica fixada, e a revalidação passa a ser da actualização

O ADR-0012 §6 impõe **cadência trimestral obrigatória** por calendário, e o próprio §8 usava o
custo dessa cadência como argumento para não tocar nos *templates*.

A cadência passa a ser **disparada pela actualização, não pelo calendário**. A imagem está fixada
em `quay.io/keycloak/keycloak:26.7.0` no `docker-compose.yml`; a versão só sobe quando alguém
decide subi-la, e revalidar os quatro *templates* é **um passo dessa tarefa**, não um compromisso
recorrente à parte.

Isto não afrouxa a segurança: subir por causa de um boletim de segurança continua a ser urgente,
e o procedimento de ensaio do §6 — aplicar em `dev`, correr a suite E2E de autenticação, plano de
reversão escrito antes — mantém-se inteiro.

### 4. O Keycloak passa a ser servido num subdomínio da marca

Em produção, `contas.gespro.mz` (ou equivalente sob o domínio do produto), via `frontendUrl` no
realm — que hoje **não está definido**. Não substitui os *templates* e não estava em causa: arruma
o endereço, que é a parte que o DNS resolve e o CSS não.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Templates próprios no tema** ✅ | Disposição, cores, logótipo e língua nossos, sem perder nada: MFA, federação, *required actions*, SSO e protecção anti-força-bruta ficam onde estão; zero código de autenticação no ERP | O salto de domínio continua visível; quatro ficheiros a revalidar em cada subida de versão |
| *Direct Access Grant* (ROPC) | UI totalmente nossa, sem salto de domínio | Mata federação e reduz o MFA a OTP; o ERP volta a ver palavras-passe; parte o primeiro acesso e a recuperação (ADR-0013); desaconselhado pela [RFC 9700 §2.4](https://www.rfc-editor.org/rfc/rfc9700.html#section-2.4) |
| Híbrido — submeter para `login-actions/authenticate` | Aspecto nosso mantendo o fluxo padrão | *Endpoint* interno sem contrato público; parte em qualquer actualização |
| Só o subdomínio de marca | DNS e configuração, zero código | Arruma o endereço, não a disposição — que é o que resta da queixa |
| Manter o tecto do §8 | Custo zero | Não resolve o requisito |

Racional: a queixa era de marca, e a marca já estava resolvida em tudo menos na disposição. Mudar
o protocolo de autenticação para corrigir uma disposição seria pagar capacidades com estética. O
que este ADR faz é levantar um tecto que existia por medo de um custo recorrente — e, ao prender
esse custo à actualização em vez do calendário, remover a razão pela qual o tecto foi posto.

## Consequências

- **Quatro `.ftl` novos** em `infra/keycloak/themes/gespro/login/`. O `theme.properties` mantém
  `parent=keycloak.v2`: herda-se tudo o que não for substituído.
- **Custo recorrente assumido:** quatro ficheiros a reler em cada subida do Keycloak. É maior do
  que o mínimo possível e foi escolhido de propósito; se doer, reduz-se a `login.ftl` com um ADR novo.
- **O portão de acessibilidade não muda de sítio.** O `a11y.a11y.ts` continua a apontar ao ecrã do
  Keycloak nos dois temas, como o ADR-0012 deixou. O que muda é que o ecrã passa a ser desenhado
  por nós — e portanto os 32/32 WCAG AA passam a ser responsabilidade nossa, não herdada do
  PatternFly.
- **Merece um gate** que falhe se a versão da imagem subir sem que os quatro ficheiros tenham sido
  tocados ou explicitamente revalidados. Sem isso, a decisão do ponto 3 depende de memória.
- **Nada muda no ERP.** Nem `src/lib/auth.ts`, nem o fluxo OIDC, nem o contrato do ADR-0011: a
  re-resolução de 15 minutos e o `kcRefreshToken` ficam intactos. Este ADR não toca em código de
  aplicação — só em tema e em configuração de realm.
- **Correcção de deriva documental:** o ADR-0012 §8 escreve `messages_pt_PT.properties`; o ficheiro
  real é `messages_pt.properties`, e está certo — o realm tem `defaultLocale: pt` e
  `supportedLocales: ["pt"]`. Quem seguir o §8 à letra cria um ficheiro que o Keycloak não lê.
- **O glossário não muda.** «Tema», «template» e «ecrã de entrada» são vocabulário técnico geral,
  não termos do domínio do GestPro. O `CONTEXT.md` fica como está.
