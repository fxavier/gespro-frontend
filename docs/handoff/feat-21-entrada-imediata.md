# Entrega — spec 21: entrada imediata no produto após o registo self-service

ADR que governa: **[ADR-0031](../decisions/ADR-0031-entrada-imediata-registo-publico.md)**
(substitui o ADR-0013 §4 e §5). Ramo: `ws-21`. Migrações Prisma: **nenhuma**.
Plano de execução e donos de ficheiro: [`execucao-paralela-21.md`](./execucao-paralela-21.md).

## O que passou a acontecer

Quem se regista **entra no produto na mesma submissão**. Antes, o registo criava uma identidade
sem credencial e a entrada dependia inteiramente de um e-mail de acções — num funil
self-service, um salto para o webmail é onde as pessoas desistem.

O formulário mudou de domínio: vive em `app.gestpro.co.mz/registo`, servido pelo ERP, que é a
origem que emite o *cookie*. Foi essa decisão que dispensou o `TokenHandoff`, o `SameSite=None`
e tudo o resto. O site ficou só com o funil.

## Entregue por lane

| Lane | O que trouxe | Handoff |
|---|---|---|
| L1 · fronteira pública | `registarTenant()` partilhado, palavra-passe no schema, identidade com `accoes: []` | [s21-l1](./s21-l1-fronteira.md) |
| L4 · verificação de e-mail | ligação assinada HMAC sem estado, `email_verified` na sessão, aviso com reenvio | [s21-l4](./s21-l4-verificacao-email.md) |
| L3 · ecrã de registo | `/registo`, `signIn` na mesma submissão, medição sem PII | [s21-l3](./s21-l3-ecra-registo.md) |
| L5 · travões | emissão fiscal e criação de utilizadores recusadas sem confirmação | [s21-l5](./s21-l5-travoes.md) |
| L2 · site → funil | `/comecar` passa a 307; formulário, widget e cliente HTTP removidos | [s21-l2](./s21-l2-site-funil.md) |

## O que o *smoke* apanhou e nenhum teste podia apanhar

**O realm tinha `verifyEmail: true`, e isso trancava toda a gente à porta.** A conta nascia
exactamente como o ADR manda — `requiredActions: []`, `emailVerified: false` — e o *direct
grant* recusava na mesma com «Account is not fully set up». A promessa central do spec não
funcionava.

Pior do que parecia: a recusa **não é passiva**. A primeira tentativa de autenticação carimba
`VERIFY_EMAIL` na conta, que fica trancada mesmo depois de o interruptor ser desligado.
Descobriu-se porque a conta do primeiro *smoke* mudou de `[]` para `['VERIFY_EMAIL']` entre
duas consultas — foi a própria tentativa de login que a trancou.

Os 1426 testes passavam todos. O Keycloak está dublado em todos eles, e um dublê não tem realm.

Corrigido em `infra/keycloak/realm-gespro.json` e registado no ADR-0031 §2-ter. Não enfraquece
o convite por e-mail, que assenta em `requiredActions` e não neste interruptor: o que muda é o
sítio da regra — a exigência de e-mail confirmado sai do **login** e fica nos **travões**.

## Três desvios ao design, todos medidos e todos reproduzidos na revisão

1. **A CSP do Turnstile não pode viver no `next.config.ts`** (o design §3 mandava-a para lá). O
   `middleware.ts` escreve o mesmo cabeçalho por último e um CSP substitui-se, não se
   acrescenta. Está aplicada no `middleware.ts`, que é o único sítio com o `pathname` **e** o
   nonce por pedido.
2. **`/comecar` é Route Handler, não página.** O Requisito 2.1 quer 307 **e** um `<a>` sem
   JavaScript; `redirect()` numa página dá 307 com o shell de erro do Next e zero `<a>`, e
   `page.tsx` + `loading.tsx` degrada para 200 sem `Location`.
3. **`/comecar` sai do `sitemap.xml`** mantendo-se como canónico de `/registo`: um sitemap lista
   URLs indexáveis e um 307 não o é; um canónico numa página `noindex` não é candidatura a
   indexação, é a morada estável do funil.

## Verificação

`pnpm check` **1426 testes** · `pnpm gates` 3/3 · `pnpm build` verde nas duas apps (sem cache) ·
`pnpm --filter erp e2e:a11y` **19/19**, agora com `/registo` nos dois temas.

*Smoke* com Postgres e Keycloak reais: registo `201`; repetição com a mesma `Idempotency-Key`
devolve o mesmo slug e **não** cria segundo tenant nem segunda identidade (confirmado em SQL);
tenant provisionado com **502 contas do PGC e 21 séries**; ligação de verificação enviada
(`verificacao.enviada`); e o *direct grant* abre sessão com `email_verified=false` — ou seja,
com os travões activos, que é exactamente o estado pretendido.

A CSP foi verificada em build de produção: `/registo` traz `challenges.cloudflare.com` com o
nonce; `/auth/login` não traz nada da Cloudflare.

## O que fica por fazer, com dono

| O quê | Onde | Porquê não foi feito aqui |
|---|---|---|
| **Limitação de tráfego distribuída (Redis)** | ADR-0014 | **Pré-requisito de abertura ao público**, não dívida: a superfície pública passou a aceitar credenciais. O limitador actual é por instância |
| **Turnstile *fail-closed* verificado em produção** | tarefa 8.2 | Precisa de chaves reais e de ambiente de produção |
| CSP estrita parte o ecrã de login | [#61](https://github.com/fxavier/gespro-frontend/issues/61) | HTML prerendered não leva nonce por pedido. Decisão de arquitectura, provavelmente com ADR |
| O site nunca vê o catálogo real de planos | [#59](https://github.com/fxavier/gespro-frontend/issues/59) | Contrato spec 18↔19; as duas pontas têm de se mover juntas |
| Contraste AA do tema escuro do site | [#60](https://github.com/fxavier/gespro-frontend/issues/60) | Pré-existente; as 10 falhas do `e2e:a11y` do site são estas |
| E2E do percurso completo (registo → sessão → aviso → verificação → travão) | tarefa 9.2 | Exige Keycloak real e estado que sobrevive entre passos; o percurso foi verificado por *smoke* manual |
| A skill **`estado-com-escritor` não existe** | tarefa 5, design §5, Requisito 8.5 | Três documentos mandam lê-la e ela não está em `.claude/skills/` nem globalmente. Ou se escreve, ou se corrigem as três referências |
| `emailVerificado` devia entrar pelo `Ctx` | #33 (ADR-0027) | Os travões lêem `auth()` dentro do serviço, contra a convenção. Alargar o `Ctx` obriga a tocar no `safe-action.ts`, que é do #33 |

## Para o ADR-0027, que vem a seguir

A tabela da superfície partilhada está em [`execucao-paralela-21.md`](./execucao-paralela-21.md).
O essencial: **`user-admin.service.ts` vai ter dois travões independentes lado a lado** — este
(e-mail por confirmar) e o do #37 (limite de utilizadores do plano). É decisão tomada, não
descuido: sem abstracção partilhada, pelo racional do ADR-0027 §3. Quem fizer o #37 acrescenta
o seu ao lado, não os funde.
