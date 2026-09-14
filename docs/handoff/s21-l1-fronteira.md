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

## Achado de segurança que o design não previa (e que fechei)

O ADR-0031 §2 manda escrever a palavra-passe **antes** da transacção. Mas o
`provisionarTenant` só recusa `EMAIL_JA_REGISTADO`/`NUIT_JA_REGISTADO` **depois** disso, e o
`garantirUtilizador` é idempotente por e-mail. A leitura literal do design abre dois caminhos
de tomada de conta, ambos triviais:

| Caminho | O que acontecia | Fecho |
|---|---|---|
| **Sobrescrita** | Registar-me com o e-mail de um cliente existente escrevia-lhe uma palavra-passe nova antes de o `EMAIL_JA_REGISTADO` chegar. Eu escolhia a credencial, a recusa vinha depois do estrago | `procurarPorEmail` antes: a credencial só é escrita numa identidade que **este** pedido criou. Se já existia, não se lhe toca e o `provisionarTenant` decide |
| **Sementeira** | Registar `vitima@x` com um NUIT já registado deixava uma identidade com a **minha** palavra-passe e sem `User` local. Quando a vítima se registasse a sério, reaproveitava essa identidade — e eu tinha a credencial | Numa recusa determinística (`AppError`) a identidade criada por este pedido é eliminada (`eliminarUtilizador`, já exportado para o expurgo do ADR-0016) |

Numa falha **inesperada** do provisionamento a identidade **não** é eliminada: não se sabe se a
transacção chegou a comprometer-se, e vale a regra do ADR-0013 §3 — órfã detectável e reparável
é melhor do que um tenant sem forma de entrar. Órfã de falha determinística não existe, porque
é apagada; órfã de falha inesperada tem a palavra-passe do pedido que a criou, logo a
repetição do registo conclui e a sessão abre.

Os quatro casos têm teste em `src/server/provisioning/__tests__/registo-publico.test.ts`.

## Ficheiros tocados

| Ficheiro | O quê |
|---|---|
| `apps/erp/src/server/provisioning/registo-publico.ts` | **Novo.** `registarTenant()` — tudo o que era corpo do Route Handler, mais a identidade com palavra-passe. Sem `NextResponse` |
| `apps/erp/src/app/api/publico/registo/route.ts` | Passa a adaptador HTTP: lê o corpo, delega, mapeia 201/4xx/5xx. Códigos publicados inalterados; 429 continua sem `error.code`, com `Retry-After` |
| `apps/erp/src/lib/validations/onboarding.ts` | `RegistoTenantSchema` ganha `senha` + `confirmacao`; comentário reescrito (dizia «SEM campo senha desde o ADR-0013 §5») |
| `apps/erp/src/server/provisioning/__tests__/registo-publico.test.ts` | **Novo.** 18 testes: resultado discriminado, ordem das defesas, regra da palavra-passe, regressão do `VERIFY_EMAIL`, e as quatro falhas acima |
| `apps/erp/src/app/api/publico/__tests__/registo-handler.test.ts` | Corpos ganham `senha`/`confirmacao`; dublê do Keycloak passa a ter as funções da identidade; o teste do `execute-actions-email` passa a fixar a escrita da palavra-passe antes da transacção (ver *desvios*) |
| `apps/erp/test/integration/registo-publico.test.ts` | **Novo.** Tarefa 9.1 — Postgres real (Testcontainers), Keycloak dublado |
| `docs/handoff/site-provisionamento.md` | Corpo com `senha`/`confirmacao`, nota de revisão de 2026-09-15, `/registo` como entrada de referência |

## Verificação

- `pnpm check` — **verde** (1292 testes, 0 erros de tsc/eslint; os 129 avisos são a linha de
  base do repositório, e são **menos 2** do que antes desta lane).
- `pnpm gates` — **verde**.
- `pnpm test:integration` — os dois testes novos passam com Docker; saltam sem ele. A suite
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

1. **O `POST /api/publico/registo` não envia verificação de e-mail.** `enviarEmailVerificacao`
   é da lane L4 e ainda não existe; `registarTenant()` devolve `sub` e `email` para quem chama
   o fazer. O ecrã `/registo` (L3) fá-lo-á. **Quem integrar tem de decidir se o adaptador HTTP
   também o chama** — hoje quem se registar por este endpoint fica com a conta a funcionar e
   sem ligação de confirmação. Não o resolvi porque exigia tocar em `keycloak.ts`, que não é
   meu nesta fase.
2. **`tenant-provisioning.service.ts` continua a chamar `garantirUtilizador` sem `accoes`**, ou
   seja, com o valor por omissão `['VERIFY_EMAIL','UPDATE_PASSWORD']`. Hoje é inofensivo — a
   identidade já existe quando lá chega, e o `garantirUtilizador` devolve-a sem tocar nas
   acções —, mas é o defeito do ADR-0031 a um `if` de distância, e o serviço não é meu.
   Recomendo que a lane dona do serviço lhe passe `accoes: []` explicitamente, ou que o parâmetro
   deixe de ter valor por omissão. O teste de regressão que deixei (`accoes: []`, nunca
   `VERIFY_EMAIL`) cobre `registarTenant`, **não** cobre esta chamada.
3. **A regra da palavra-passe está em dois schemas** (`onboarding.ts` e `plataforma.ts`), com um
   comentário em cada a apontar para o outro. Não a extraí para um sítio comum porque
   `plataforma.ts` não é meu e porque a regra é a mesma por decisão, não por acaso —
   partilhá-la agora acopla dois formulários que podem divergir (força mínima diferente para
   registo público, por exemplo). Se o ADR-0027 ou outra lane fixar política de palavra-passe,
   é aí que se unifica.
4. **A limitação de tráfego continua em memória.** O ADR-0031 §Consequências diz que o
   distribuído (ADR-0014/Valkey) passa de dívida herdada a **pré-requisito de abertura ao
   público** — é a tarefa 8.1, de outra lane, e não a antecipei.
5. **Nada aqui foi provado contra um Keycloak real.** O teste de integração usa Postgres real e
   Keycloak dublado; o comportamento de `temporary: false` já está verificado pelo ADR-0030, mas
   o percurso completo (registo → sessão na mesma submissão) é o *smoke* da tarefa 10.1, que
   pertence ao orquestrador.
