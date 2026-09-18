# Handoff — spec 21, lane L1 (`s21-fronteira`)

Tarefas **1**, **2** e **9.1** do `.kiro/specs/21-entrada-imediata-self-service/tasks.md`.
Governado pelo **ADR-0031**; usa `definirPalavraPasse`/`garantirUtilizador` do ADR-0030 e
mantém intactos o ADR-0013 §2 (Keycloak é a fonte de verdade da identidade) e o ADR-0029
(Direct Access Grant). **Sem migrações Prisma** — o estado de verificação de e-mail vive no
Keycloak, como o ADR manda.

## Contrato publicado — o que L3 e L4 consomem

```ts
// src/server/provisioning/registo-publico.ts
export const CORPO_ILEGIVEL: unique symbol;

export interface ContextoRegisto {
  ip: string;
  idempotencyKey: string;
}

export type ResultadoRegisto =
  | {
      ok: true;
      tenantSlug: string;
      sub: string;          // identidade no Keycloak — para o e-mail de verificação (L4)
      email: string;        // normalizado — para o signIn (L3)
      repetido: boolean;    // true = reentrega idempotente
      mensagem: string;     // corpo de sucesso tal como gravado na chave
    }
  | {
      ok: false;
      code: string;         // códigos de site-provisionamento.md §2, inalterados
      mensagem: string;
      estado: number;
      detalhes?: unknown;   // fieldErrors do Zod, só em VALIDACAO
      retryAfterSec?: number; // só em 429
    };

export function registarTenant(
  entrada: unknown,
  contexto: ContextoRegisto,
): Promise<ResultadoRegisto>;
```

Três acréscimos ao contrato mínimo do `execucao-paralela-21.md`, todos aditivos e nenhum
negociável ao contrário (quem consome só lê o que precisa):

| Acréscimo | Porquê |
|---|---|
| `mensagem` no sucesso | A reentrega idempotente tem de devolver o corpo gravado **verbatim** (contrato publicado). Sem a mensagem no resultado, o adaptador não a sabe reconstruir |
| `detalhes` e `retryAfterSec` na falha | O 422 publicado leva `details.fieldErrors` e o 429 leva `Retry-After`. Sem estes campos o adaptador não podia manter o envelope publicado |
| `CORPO_ILEGIVEL` | Quem lê o corpo é o adaptador, mas «não é JSON» tem de ser recusado **no seu lugar na ordem das defesas** — depois do limite por IP e da `Idempotency-Key`. A sentinela é o que impede a extracção de reordenar as defesas. Quem chama com um objecto (L3) nunca a usa |

`registarTenant()` **não envia e-mail nenhum**. Quem a chama é que envia a verificação, depois
de dar a sessão (ADR-0031 §2) — `sub` e `email` vão no resultado exactamente para isso.

## Decisões

1. **Extracção sem mudança de comportamento (tarefa 1), provada pelo gate.** Os 22 testes de
   `registo-handler.test.ts` passaram **sem uma linha alterada** no fim da tarefa 1 — corridos
   nesse ponto exacto, antes de a tarefa 2 lhes tocar. Para repetir a verificação: reverter as
   alterações da tarefa 2 em `registo-publico.ts` e `onboarding.ts` devolve o ficheiro de teste
   original a verde.
2. **Ordem das defesas intacta**: limite por IP → `Idempotency-Key` → corpo legível → Zod →
   limite por e-mail → captcha → identidade no Keycloak → transacção em Postgres. O captcha
   continua antes de qualquer toque no Keycloak.
3. **`senha` e `confirmacao` são de topo**, não dentro de `admin`. `admin.senha` era o sítio
   pré-ADR-0013 e continua a ser descartado pelo Zod. Mínimo de 10 caracteres e confirmação
   coincidente, iguais a `MudarPalavraPasseSchema` (`plataforma.ts`) — uma regra só, em dois
   sítios; mudar um obriga a mudar o outro (está dito no comentário de ambos… ver *gaps*).
4. **`fingerprint` da idempotência documentado no ficheiro**, com o racional do ADR-0031
   §Consequências: digest de um corpo de alta entropia, não um verificador de credencial.
5. **A palavra-passe faz um salto só**: corpo do pedido → Admin API do Keycloak. Não entra em
   log, URL, Postgres, resultado, nem no `provisionarTenant` (que recebe `{ nome, email }`
   montado à mão, não o `admin` do corpo). Há testes que o fixam nos três sítios.
6. **Nunca se sobrescreve uma credencial que este pedido não criou** — ver o achado abaixo.
7. **Recusa determinística apaga a identidade que este pedido criou**; falha inesperada não —
   ver o achado abaixo.

## Identidade: quem cria, escreve — e só esse

O ADR-0031 §2 manda escrever a palavra-passe **antes** da transacção, mas o `provisionarTenant`
só recusa `EMAIL_JA_REGISTADO`/`NUIT_JA_REGISTADO` **depois** disso e o `garantirUtilizador` é
idempotente por e-mail. A leitura literal abre tomadas de conta; o §2-bis do ADR-0031 codifica
o fecho e esta lane implementa-o. A regra final é uma só: **a credencial só se escreve numa
identidade cujo dono este pedido conhece** — porque a criou (201 do Keycloak), ou porque a
transacção acabou de lhe dar dono.

| Caminho | O que acontecia | Fecho |
|---|---|---|
| **Sobrescrita** | Registar-me com o e-mail de um cliente escrevia-lhe uma credencial nova antes de o `EMAIL_JA_REGISTADO` chegar | A identidade preexistente não cede credencial antes da transacção |
| **Sementeira** | Registar `vitima@x` com um NUIT já registado deixava uma identidade com a **minha** credencial, à espera de a vítima se registar | Recusa determinística apaga a identidade que este pedido criou |
| **Corrida (BLOCKER do parecer)** | `procurarPorEmail`-antes-de-criar é TOCTOU: dois pedidos lêem `null`, partilham o `sub` que o Keycloak deduplica e **ambos se julgam criadores**. O que perdia apagava ou reescrevia a identidade do que ganhou | `garantirUtilizador` devolve `{ sub, criado }`, e `criado` é o **201** do próprio POST. Na corrida só um o recebe |
| **Corrida, segunda volta** | Mesmo com `criado`, quem perde pode cometer o tenant primeiro e quem ganha apanha `EMAIL_JA_REGISTADO` — apagar aí deixava um cliente real com tenant e sem identidade | Guarda-costas antes de apagar: se algum `User` local referencia o `sub`, não se apaga e regista-se a corrida |
| **Apagamento cruzado** | Outro pedido com o mesmo e-mail e um NUIT duplicado é recusado em dezenas de milissegundos, não vê `User` nenhum (a transacção da vítima ainda não cometeu) e apaga o `sub` partilhado. A vítima cometia a seguir — o `keycloakSub` é escalar, sem FK — e ficava com tenant e sem identidade | Auto-cura: um **404** na escrita pós-commit prova que a identidade foi apagada, e ela é recriada com a credencial **de quem se registou**, com o `User` a apontar-lhe |
| **Órfã com credencial alheia** | Uma falha inesperada deixa a identidade para trás com a credencial de quem a semeou. Quem se registasse a seguir herdava o tenant preso a essa credencial — benigno quando é a própria pessoa a repetir, **tomada de conta quando não é** | Depois do commit, e só então, a credencial do pedido corrente sobrepõe-se |

**Porque é que a órfã é tratada depois da transacção, e não antes.** «Sem `User` local» lido
antes do commit não distingue uma órfã de um registo concorrente ainda a meio: quem corresse
contra um registo em curso escrevia depois dele e ficava com o tenant que o outro cometeu — a
mesma tomada de conta por outra porta. Depois do commit a pergunta já não precisa de ser feita:
se a identidade tivesse outro dono, o `provisionarTenant` teria recusado com
`EMAIL_JA_REGISTADO` e não se chegava ali. O preço é que, **nesse** caminho, a credencial é escrita depois do tenant. Se a escrita falhar
por algo que não seja apagamento (503, rede), o que fica **não** é «um tenant sem credencial
utilizável»: a identidade mantém a credencial **anterior** e, quando a órfã foi semeada por
outra pessoa, essa credencial é dela, está viva e serve agora um tenant cometido — até o dono
recuperar a palavra-passe. Exige empilhar duas falhas raras, e por isso é **alerta, não
desfecho aceite**: o log correspondente é para ser tratado como incidente, não como ruído. O caminho normal — identidade criada por este pedido — mantém
a ordem que o ADR exige.

Cada um destes casos tem teste, e **cada teste foi verificado a falhar** com a correcção
desfeita (quatro mutações: `criado` sempre verdadeiro, guarda-costas removido, escrita
pós-commit removida, 409 a fingir-se criador). Um teste que passa nos dois sentidos não prova
nada.

### Auto-cura depois do commit

A escrita da credencial pós-commit deixou de ser a última palavra. Se falhar com **404**, a
identidade foi apagada debaixo dos pés — e o tenant já está cometido, o que é a prova de posse
que autoriza recriá-la: `garantirUtilizador({ accoes: [] })` → `definirPalavraPasse` →
`User.keycloakSub` actualizado (`updateMany` com `tenantId` explícito, que `prismaBase` é o
cliente cru). Renasce com a palavra-passe **de quem se registou**, nunca com a de quem a apagou,
e o `sub` devolvido no resultado passa a ser o novo — é o que a verificação de e-mail vai usar.

A condição de entrada ficou explícita no código e não é alcançável de mais lado nenhum: sem o
commit à frente, isto seria escrita de credencial em identidade alheia. O teste
«a auto-cura só existe depois do commit» fixa-o — um 404 **antes** da transacção não recria nada.

Fechei junto um irmão do mesmo entrelaçamento, que o parecer não nomeia mas tem o mesmo
desfecho: se a identidade for apagada entre a escrita da credencial e a transacção, é o
`provisionarTenant` que cria outra ao reencontrá-la em falta, e o tenant compromete-se a um
`sub` diferente do nosso, sem credencial. A condição do bloco pós-commit passou a incluir
`subCometido !== sub`, e o `provisionarTenant` passa agora `accoes: []` explícito — sem isso, a
identidade que ele criasse nesse caminho nascia com `VERIFY_EMAIL` pendente, que é o defeito do
ADR-0031 de volta pela porta das traseiras (era o *gap* 2 deste handoff, agora fechado).

### `accoes` deixou de ter valor por omissão

`garantirUtilizador` tinha `['VERIFY_EMAIL','UPDATE_PASSWORD']` por omissão — as acções do
convite. Um valor por omissão que **tranca o direct grant** não é conveniência, é armadilha: já
apanhou dois caminhos nesta lane (o `provisionarTenant` e o ramo da identidade substituída a
meio), ambos a funcionar por acidente de ordem. O parâmetro passa a ser **obrigatório** e os
três chamadores escolhem à vista:

| Chamador | Escolha | Porquê |
|---|---|---|
| `registarTenant` (registo público) | `[]` | A sessão tem de abrir na submissão seguinte; com `VERIFY_EMAIL` o direct grant recusa (ADR-0031 §2) |
| `provisionarTenant` | `[]` | Mesmo caminho, mesma razão — só serve o registo público |
| `user-admin.service` · convite por e-mail | `['VERIFY_EMAIL','UPDATE_PASSWORD']` | É o clique no e-mail que prova o endereço de quem foi convidado (ADR-0013 §5-bis) |
| `user-admin.service` · palavra-passe atribuída | `['UPDATE_PASSWORD']` + `emailVerificado: true` | Quem atribui responde pelo endereço; com `VERIFY_EMAIL` a pessoa não entrava com a palavra-passe que recebeu (ADR-0030 §3) |

Confirmei cada escolha contra o que o caminho precisa, não contra o que faz o teste passar: o
convite **quer** a verificação pendente e fica com ela; só deixou de a ter por omissão.

**O alarme é de compilação, não de execução**: `keycloak.test.ts` chama `garantirUtilizador`
sem `accoes` debaixo de um `@ts-expect-error`. Se alguém repuser a omissão, o directiva fica
sem erro para suprimir e o `tsc --noEmit` do `pnpm check` falha com «unused @ts-expect-error».
Verificado a acender (mutação H). Há também o teste de execução que fixa `accoes: []` a chegar
ao Keycloak como lista vazia, sem substituição pelo caminho.

## Ficheiros tocados

| Ficheiro | O quê |
|---|---|
| `apps/erp/src/server/provisioning/registo-publico.ts` | **Novo.** `registarTenant()` — tudo o que era corpo do Route Handler, mais a identidade com palavra-passe e as regras do §2-bis. Sem `NextResponse` |
| `apps/erp/src/server/auth/keycloak.ts` | `garantirUtilizador` devolve `{ sub, criado }` (`IdentidadeGarantida`): `criado` é o 201 do POST, a única resposta fiável a «fui eu que criei isto?». `accoes` passa a **obrigatório**, sem omissão. Nova `ErroKeycloak` com o estado HTTP, para o 404 poder ser distinguido sem ler mensagens |
| `apps/erp/src/server/services/plataforma/tenant-provisioning.service.ts` | Desestruturação do novo retorno, e `accoes: []` explícito na sua chamada — só serve o registo público, onde `VERIFY_EMAIL` tranca o direct grant |
| `apps/erp/src/server/services/plataforma/user-admin.service.ts` | Desestruturação do novo retorno e escolha explícita das acções nos dois modos de convite |
| Dublês de `garantirUtilizador` em 5 ficheiros de teste de outros domínios | Passam a devolver `{ sub, criado }`; `keycloak.test.ts` ganha a asserção de `criado` nos três caminhos (existente, 201, 409) |
| `apps/erp/src/app/api/publico/registo/route.ts` | Passa a adaptador HTTP: lê o corpo, delega, mapeia 201/4xx/5xx. Códigos publicados inalterados; 429 continua sem `error.code`, com `Retry-After` |
| `apps/erp/src/lib/validations/onboarding.ts` | `RegistoTenantSchema` ganha `senha` + `confirmacao`; comentário reescrito (dizia «SEM campo senha desde o ADR-0013 §5») |
| `apps/erp/src/server/provisioning/__tests__/registo-publico.test.ts` | **Novo.** 26 testes: resultado discriminado, ordem das defesas, regra da palavra-passe, regressão do `VERIFY_EMAIL`, e as quatro falhas acima |
| `apps/erp/src/app/api/publico/__tests__/registo-handler.test.ts` | Corpos ganham `senha`/`confirmacao`; dublê do Keycloak passa a ter as funções da identidade; o teste do `execute-actions-email` passa a fixar a escrita da palavra-passe antes da transacção (ver *desvios*) |
| `apps/erp/test/integration/registo-publico.test.ts` | **Novo.** Tarefa 9.1 — Postgres real (Testcontainers), Keycloak dublado |
| `docs/handoff/site-provisionamento.md` | Corpo com `senha`/`confirmacao`, nota de revisão de 2026-09-15, `/registo` como entrada de referência |

## Verificação

- `pnpm check` — **verde** (1326 testes, 0 erros de tsc/eslint; os 129 avisos são a linha de
  base do repositório, e são **menos 2** do que antes desta lane).
- `pnpm gates` — **verde**.
- `pnpm test:integration` — os **quatro** testes novos passam com Docker; saltam sem ele. A suite
  **já estava vermelha** antes desta lane, por `test/integration/tenant-isolation.test.ts`, que
  falha sozinha e por duas razões alheias ao spec 21: os dois NUITs que gera são o mesmo
  (`String(now)` e `String(now + 1)` partilham os primeiros 9 dígitos, e o campo é único) e o
  `user.create` não passa `keycloakSub`, obrigatório desde o ADR-0013. Não lhe toquei — não é
  ficheiro meu e a correcção não é deste spec.
- Gate 1.3 — 22/22 do handler sem alterar o ficheiro, ao fim da tarefa 1.

## Desvios face às instruções da lane

**O teste do handler precisou de mais do que «acrescentar `senha` aos corpos».** A instrução
pressupunha que a tarefa 2 não mudava mais nada do handler, e muda: a identidade deixa de ser
criada sem credencial e o `execute-actions-email` desaparece (mantê-lo reporia
`VERIFY_EMAIL`/`UPDATE_PASSWORD` e mandaria à pessoa um e-mail a pedir-lhe que definisse a
palavra-passe que acabou de definir). Em concreto:

- o dublê `vi.mock('@/server/auth/keycloak')` passou a expor `procurarPorEmail`,
  `garantirUtilizador`, `definirPalavraPasse` e `eliminarUtilizador` — sem isto, as funções
  chamadas vinham `undefined` e **todos** os testes rebentavam;
- o teste «dispara o e-mail de acções … a porta de entrada» foi substituído por dois: a escrita
  da palavra-passe com `temporaria: false` antes da transacção, e a palavra-passe fora da
  resposta e fora do provisionamento;
- a asserção da reentrega idempotente passou de «não repete o e-mail de acções» para «não toca
  no Keycloak: nem cria identidade nem reescreve credencial».

Tudo o resto — nomes, corpos, códigos, ordem — está como estava. Nenhum código de erro
publicado mudou.

## Gaps que deixo, e porquê

1. **O `POST /api/publico/registo` não envia verificação de e-mail.** `registarTenant()` não
   envia nada de propósito — devolve `sub` e `email` para quem chama o fazer depois de dar a
   sessão (ADR-0031 §2), e o ecrã `/registo` (L3) é quem o faz. Com a L4 fundida, o
   `enviarEmailVerificacao(sub, email)` já existe e ligá-lo ao adaptador HTTP é uma linha:
   **deixo a decisão ao orquestrador**, porque é escolha de produto (o endpoint é contrato
   público sem consumidor conhecido depois de a L2 apagar o formulário do site) e não uma
   omissão técnica. Hoje, quem se registe por ele fica com a conta a funcionar e sem ligação de
   confirmação.
2. **Fechado por inteiro**: `tenant-provisioning.service.ts` passa `accoes: []` explícito e
   `garantirUtilizador` deixou de ter omissão nesse parâmetro. A assinatura de `registarTenant`
   não mexeu, e a L3 não chama `garantirUtilizador` — não há colisão.
3. **Fica um resto de corrida sem fecho possível sem bloqueio distribuído.** Quem perde uma
   corrida pelo mesmo e-mail escreve a sua credencial depois do commit do vencedor se o seu
   próprio `provisionarTenant` também tiver passado — o que só acontece se o e-mail ainda não
   tivesse `User` local nesse instante. A janela é a da transacção (~1-2 s) e exige cronometrar
   o registo da vítima; fechá-la a sério é reservar o e-mail num índice único antes do Keycloak,
   que é mecanismo novo e não é deste spec.
4. **A regra da palavra-passe está em dois schemas** (`onboarding.ts` e `plataforma.ts`), com um
   comentário em cada a apontar para o outro. Não a extraí para um sítio comum porque
   `plataforma.ts` não é meu e porque a regra é a mesma por decisão, não por acaso —
   partilhá-la agora acopla dois formulários que podem divergir (força mínima diferente para
   registo público, por exemplo). Se o ADR-0027 ou outra lane fixar política de palavra-passe,
   é aí que se unifica.
5. **A limitação de tráfego continua em memória.** O ADR-0031 §Consequências diz que o
   distribuído (ADR-0014/Valkey) passa de dívida herdada a **pré-requisito de abertura ao
   público** — é a tarefa 8.1, de outra lane, e não a antecipei.
6. **Nada aqui foi provado contra um Keycloak real.** O teste de integração usa Postgres real e
   Keycloak dublado; o comportamento de `temporary: false` já está verificado pelo ADR-0030, mas
   o percurso completo (registo → sessão na mesma submissão) é o *smoke* da tarefa 10.1, que
   pertence ao orquestrador.
