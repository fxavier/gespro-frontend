# Execução paralela — spec 21 (Entrada imediata no produto após o registo self-service)

Governa: **ADR-0031** (escrito antes de qualquer lane; tarefa 0.2 do `tasks.md`).
Base de todas as lanes: **`ws-21`**, criado de `w8/rotas-em-falta-e-primeiro-acesso`.

## Porquê esta base, e não `w8/integracao`

O spec 21 consome código do **ADR-0030** que ainda não fundiu: `definirPalavraPasse(sub, valor,
{ temporaria })`, `garantirUtilizador({ accoes, emailVerificado })` e o ecrã
`/auth/mudar-palavra-passe`. Vive todo no PR #58. Basear em `w8/integracao` dava um tronco onde
a tarefa 2.2 não compila.

## Tarefa 0.1 — a ordem face ao ADR-0027

O `design.md` §0.1 recomendava **ADR-0027 primeiro**. **Decido o contrário: spec 21 primeiro**,
e a razão é de estado, não de mérito.

Nenhum dos nove tickets do ADR-0027 (#31–#39) arrancou — estão todos em `ready-for-agent`, sem
ramo. O spec 21 toca a superfície contestada em **quatro sítios pequenos e aditivos**; o #33 e
o #37 reescrevem-na. Quem vai segundo rebaseia, e o mais barato a rebasear é quem ainda não
começou.

A superfície contestada, nomeada para quem pegar no ADR-0027 a seguir:

| Ficheiro | Spec 21 faz | ADR-0027 fará | Quem rebaseia |
|---|---|---|---|
| `src/lib/auth.ts` | propaga `email_verified` para o JWT e a sessão (4.4) | #33 acrescenta o estado de acesso em três valores à mesma sessão | #33 |
| `src/server/services/plataforma/user-admin.service.ts` | recusa criar/reactivar `User` sem e-mail verificado (5.2) | #37 recusa criar/reactivar `User` acima do Limite | #37 — **dois travões independentes na mesma função**, e é assim que fica: sem abstracção partilhada (ADR-0027 §3, ADR-0031 §Decisão) |
| emissão de documento fiscal | recusa sem e-mail verificado (5.1) | #33 recusa escritas em Leitura, no pipeline | #33 — camadas diferentes, não colidem, mas os testes de transição precisam de ser lidos em conjunto |
| `src/server/safe-action.ts`, `src/lib/api/with-api.ts` | **não toca** | #33 é o dono | — |

## Tickets que este spec torna inúteis

- **#43** (widget anti-robô remonta-se a cada render) e **#44** (sem chave, o site rejeita o
  registo) são defeitos em `apps/site/src/components/marketing/turnstile.tsx` e
  `formulario-registo.tsx`. A **lane L2 apaga os dois ficheiros**. Corrigi-los é trabalho
  deitado fora — recomendação: fechar como substituídos por este spec quando a L2 fundir.

## Lanes e donos de ficheiro

Regra: **um ficheiro tem um dono por fase.** Quem não é dono não escreve, mesmo que seja uma
linha. Onde dois queriam o mesmo ficheiro, o dono foi antecipado (ver `middleware.ts`).

### Fase 1 — três lanes em paralelo, conjuntos disjuntos

#### L1 · `wt/s21-fronteira` — tarefas 1, 2, 9.1
**Dono de:**
- `apps/erp/src/server/provisioning/registo-publico.ts` *(novo)*
- `apps/erp/src/server/provisioning/__tests__/registo-publico.test.ts` *(novo)*
- `apps/erp/src/app/api/publico/registo/route.ts`
- `apps/erp/src/lib/validations/onboarding.ts`
- `apps/erp/src/app/api/publico/__tests__/registo-handler.test.ts`

**Não toca:** `keycloak.ts`, `auth.ts`, `middleware.ts`, `next.config.ts`, `apps/site/**`,
`src/server/services/**`.

**Gate da tarefa 1.3:** ao fim da tarefa 1, os 22 testes de `registo-handler.test.ts` passam
**sem uma linha alterada**. Só a tarefa 2 os pode tocar, e só para acrescentar `senha` ao corpo.

**Contrato publicado** (L3 e L4 escrevem contra isto, não o negoceiam):

```ts
type ResultadoRegisto =
  | { ok: true; tenantSlug: string; sub: string; email: string; repetido: boolean }
  | { ok: false; code: string; mensagem: string; estado: number };

registarTenant(entrada: unknown, contexto: { ip: string; idempotencyKey: string }):
  Promise<ResultadoRegisto>;
```

`sub` e `email` no sucesso são o que L3 precisa para o `signIn` e L4 para o e-mail de
verificação. `repetido: true` é a reentrega idempotente. Sem `NextResponse` no ficheiro.

#### L2 · `wt/s21-site-funil` — tarefa 6
**Dono de:** `apps/site/**` — e só.
**Não toca:** `apps/erp/**`, `docs/**`, `packages/**`.
Fundir **depois** da L3: até `/registo` existir, o encaminhamento aponta para 404.

#### L4 · `wt/s21-verificacao-email` — tarefa 4
**Dono de:**
- `apps/erp/src/server/auth/keycloak.ts` — acrescenta `enviarEmailVerificacao`,
  `marcarEmailVerificado`. **Não mexe** no que lá está.
- `apps/erp/src/app/api/publico/verificar-email/route.ts` *(novo)*
- `apps/erp/src/lib/auth.ts` — só a propagação de `email_verified`
- `apps/erp/middleware.ts` — **acrescenta as duas entradas de uma vez**:
  `/api/publico/verificar-email` (sua) e `/registo` (da L3, antecipada para não haver segundo
  dono deste ficheiro)
- template de e-mail e o aviso do `/dashboard` com reenvio

**Não toca:** `registo-publico.ts`, `onboarding.ts`, `route.ts` do registo, `next.config.ts`,
`apps/site/**`, serviços de domínio.

### Fase 2 — L3 · `wt/s21-ecra-registo` — tarefas 3, 7
Arranca depois de L1 **e** L4 fundirem: consome `registarTenant()` e `enviarEmailVerificacao`.
**Dono de:** `apps/erp/src/app/registo/**` *(novo)*, `apps/erp/next.config.ts`,
`apps/erp/.env.example`, o emissor de eventos Plausible *(ficheiro novo)*.
**Não toca:** `middleware.ts` (a L4 já lá pôs `/registo`), `onboarding.ts`, `keycloak.ts`,
`auth.ts`, `registo-publico.ts`.

### Fase 3 — L5 · `wt/s21-travoes` — tarefa 5
Arranca depois de L4 fundir: precisa de `email_verified` na sessão.
**Dono de:** o serviço de emissão de documento fiscal, `user-admin.service.ts`, e os testes de
transição nos dois sentidos.
**Não toca:** `safe-action.ts`, `with-api.ts` — são do #33 do ADR-0027.

### Fase 4 — orquestrador
Integração em `ws-21`, tarefas 9.2, 9.3 e 10. `pnpm check`, `pnpm gates` e `pnpm build` nas
duas apps; E2E; *smoke* com Keycloak e Postgres reais; handoff final.

## Migrations

**Este spec não tem nenhuma.** O estado de verificação vive no Keycloak e chega pela sessão.
Se uma lane gerar uma migration, é bug, não iniciativa — e o parecer do `code-reviewer` recusa
o merge.

## Gate de merge

Cada lane termina com `pnpm check` verde no seu worktree e um handoff em `docs/handoff/`.
Merge só depois de parecer do `code-reviewer` sem BLOCKERs.
