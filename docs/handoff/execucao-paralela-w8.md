# Wave 8 — Execução paralela: mapa de conflitos e ordem de merge

> Documento de coordenação da **Wave 8 — Prontidão para Produção**.
> Lê isto **antes** de lançar qualquer agente. O design está nos ADRs 0010–0025; isto é o plano de
> execução: quem toca em quê, o que pode correr em paralelo, e por que ordem se funde.
>
> Data: 2026-08-21 · **Revisão 3** (ver §9) · Origem: `docs/GestPro-Arquitectura-e-Estado.pdf`, secções 10 a 12.

## 1. Princípio de coordenação

Cada ficheiro partilhado tem **um dono por fase**. Não há merge manual de ficheiros disputados: se dois
agentes precisam do mesmo ficheiro, o orquestrador **serializa**. Foi a ausência desta regra que
tornou `pessoas-projetos.prisma` o ficheiro mais conflituoso do programa — e é por isso que o ADR-0025
o separa.

**Migrations Prisma nunca são geradas por agentes.** Só pelo orquestrador, no fecho de cada fase, na
ordem `auth → plataforma → financas → pessoas-projetos`.

## 2. Fases e paralelismo

```
FASE 1 — Ambiente local de referência               (3 agentes em paralelo)
├── w8-plataforma-local ..... ADR-0026, 0012(local), 0014(local), 0020, 0022 §0
├── w8-observabilidade ...... ADR-0019 (pilha Grafana local, por OTLP)
└── w8-desempenho ........... ADR-0018 (6 dos 7 cenários — auth fica para a fase 2)
    GATE: pilha completa a subir com um comando (Postgres, Keycloak, Valkey, MinIO,
          otel-lgtm, Mailpit, 2× app + proxy) · telemetria a chegar · alerta disparado
          e recebido · restauro local cronometrado · baseline-pre-keycloak.json.
          Sem contas, sem custos, sem nuvem.

FASE 2 — Identidade e bloqueadores comerciais       (4 em paralelo + 1 sequenciado)
├── w8-identidade ........... ADR-0010, 0011, 0012(app), 0013  ← dono de auth E plataforma
├── w8-cache ................ ADR-0014 (app)
├── w8-auditoria ............ ADR-0015
├── w8-billing .............. ADR-0021        ← pede alterações a plataforma.prisma
└── w8-anti-abuso ........... ADR-0016        ← arranca após merge de w8-cache
    GATE: E2E verdes contra Keycloak REAL · gate-auditoria verde · re-medição k6
          com o cenário de autenticação → baseline.json · parecer fiscal pedido.

FASE 3 — Consolidação                                (4 agentes em paralelo)
├── w8-armazenamento ........ ADR-0017   ← migração NÃO vazia; vem antes da fase 5
├── w8-correcoes ............ (sem ADR — bugs A a D; CSP_ENFORCE já pode)
├── w8-gates ................ ADR-0024
└── w8-docs ................. ADR-0023
    GATE: E2E 37/37 · 5 gates verdes · tecto de lint a descer · índice de ADR testado.

FASE 4 — Separação de domínio                        (1 agente, sozinho)
└── w8-separacao-dominio .... ADR-0025
    GATE: migração VAZIA · pnpm check + gates + e2e verdes.

────────────────────────────────────────────────────────────────────────────
FASE 5 — Provisionamento                             PARADA por decisão
└── w8-provisionamento ...... bloqueada pelo ADR-0026 §5
    Não arranca sem um ADR que escolha o fornecedor. Leva consigo tudo o que
    só existe em produção: alta disponibilidade, retenção longa, replicação
    de objectos, e o ensaio de restauro que valida o RTO a sério.
```

## 3. Mapa de propriedade de ficheiros

| Ficheiro / área | Dono | Fase | Nota |
|---|---|---|---|
| `docker-compose.yml`, `Dockerfile`, `docker-entrypoint.sh`, `infra/local/**` | `w8-plataforma-local` | 1 | — |
| `infra/live/**`, `infra/modules/**` | **ninguém** | — | **dormente** (ADR-0026 §4): não apagar, não promover |
| `src/server/observability/**`, `instrumentation.ts` | `w8-observabilidade` | 1 | — |
| `perf/**`, `prisma/seed/volume/**` | `w8-desempenho` | 1 (e re-medição na 2) | — |
| `src/lib/auth.ts`, `middleware.ts`, `prisma/schema/auth.prisma`, `src/server/auth/**`, `infra/keycloak/realm-gespro.json` | `w8-identidade` | **2 (exclusivo toda a wave)** | — |
| **`prisma/schema/plataforma.prisma`** | **`w8-identidade`** | **2 (exclusivo)** | remove `TokenVerificacaoEmail`, reduz `TokenHandoff`. `w8-billing` **pede**, não escreve |
| `src/server/security/rate-limiter.ts` + adaptador Valkey | `w8-cache` | 2 | — |
| `src/server/db/audit-extension.ts`, `scripts/gate-auditoria.mjs` | `w8-auditoria` | 2 | campos novos de `AuditLog` **pedidos** a `w8-identidade` |
| `src/server/billing/**`, `src/lib/planos.ts`, `src/lib/fiscalidade-saas.ts` | `w8-billing` | 2 | modelos em plataforma são pedidos |
| `apps/site/src/lib/validations.ts`, widget do site, `api/publico/registo/route.ts` | `w8-anti-abuso` | 2 | — |
| `src/lib/storage/objeto/**`, rotas de presign e download, `DocumentoColaborador` | `w8-armazenamento` | 3 | — |
| `scripts/gate-*.mjs` (excepto auditoria), `eslint.config.mjs`, `eslint-rules/**` | `w8-gates` | 3 | — |
| `docs/**` (excepto `handoff/` e `runbooks/`), `CLAUDE.md` §Referência | `w8-docs` | 3 | — |
| `prisma/schema/pessoas-projetos.prisma` e serviços correspondentes | `w8-separacao-dominio` | **4 (exclusivo)** | — |
| `docs/runbooks/**` | `w8-plataforma-local` e `w8-observabilidade` | 1 | — |

## 4. Conflitos reais e como se resolvem

| # | Conflito | Resolução |
|---|---|---|
| 1 | **`plataforma.prisma` disputado.** `w8-identidade` remove `TokenVerificacaoEmail` e reduz `TokenHandoff`; `w8-billing` quer acrescentar `DocumentoSubscricao` e campos fiscais; ambos na fase 2 | `w8-identidade` é dono exclusivo. `w8-billing` entrega a definição dos modelos que precisa e `w8-identidade` escreve-os. Serializado, não fundido |
| 2 | `AuditLog` ganha `requestId` e `keycloakSub`, mas vive em `auth.prisma`, que é do `w8-identidade` | `w8-auditoria` **pede** as duas colunas. Se `w8-identidade` ainda não tiver fundido, usa `userId` e acrescenta as colunas em PR de seguimento |
| 3 | CSP: `w8-anti-abuso` acrescenta o domínio do Turnstile; `w8-correcoes` activa o modo estrito; `middleware.ts` é do `w8-identidade` | Ordem: `w8-identidade` → `w8-anti-abuso` → `w8-correcoes` activa `CSP_ENFORCE` na fase 3, validado contra **build de produção local** (`pnpm build && pnpm start`), que é onde os problemas de *nonce* aparecem. Não precisa de nuvem |
| 4 | `DocumentoColaborador` gera migração **não vazia**; o ADR-0025 exige migração vazia | Ordem imposta: `w8-armazenamento` na fase 3, `w8-separacao-dominio` na fase 4. **Nunca a mesma janela** |
| 5 | `w8-cache` escreve o adaptador; `w8-plataforma-local` levanta o Valkey | `w8-plataforma-local` entrega o serviço e a variável de ligação na fase 1. As **duas instâncias** da app são o que torna o limite partilhado verificável |
| 6 | `w8-desempenho` encontra consultas más em código de que não é dono | Documenta e entrega ao orquestrador. **Não corrige.** É só-leitura sobre domínio |
| 7 | Cenário k6 de autenticação mede um fluxo que ainda não existe na fase 1 | Fase 1 produz `baseline-pre-keycloak.json` com 6 cenários. Após o merge de `w8-identidade`, `w8-desempenho` volta para uma **re-medição obrigatória** que produz `baseline.json` |
| 8 | `w8-identidade` remove `LoginAttempt`; `w8-cache` poderia querer cobrir o login | Não cobre. O Keycloak trata força bruta nativamente (ADR-0014 §3) |
| 9 | Login ambíguo cross-tenant (achado da spec 19) | Resolvido **por construção** pelo `w8-identidade`. `w8-correcoes` confirma e não duplica |
| 10 | `gate-dominios.mjs` pode falhar em código que outros agentes estão a escrever | Entra na fase 3, depois de 1 e 2 fundirem. Violações são triadas, não silenciadas |
| 11 | Captcha: o ERP já valida; o site é que não envia | `w8-anti-abuso` trabalha em `apps/site`, não no ERP. No ERP só muda `CAPTCHA_PROVIDER` e as chaves |

## 5. Ordem de merge determinística

**Fase 1:** `w8-plataforma-local` → `w8-observabilidade` → `w8-desempenho`
*(a plataforma primeiro: os outros dois precisam da pilha a correr)*
**Fase 2:** `w8-identidade` → `w8-cache` → `w8-auditoria` → `w8-billing` → `w8-anti-abuso` → *(re-medição k6)*
**Fase 3:** `w8-docs` → `w8-armazenamento` → `w8-correcoes` → `w8-gates`
**Fase 4:** `w8-separacao-dominio` sozinho.

Migrations geradas pelo orquestrador ao fim de cada fase. A do ADR-0013 é destrutiva (remove 3 tabelas
de `auth.prisma`, 1 de `plataforma.prisma` e a coluna `passwordHash`) e exige **publicação em duas
fases** (ADR-0022 §6) mais instantâneo prévio (ADR-0020) — o que só é possível a partir da fase 3.
Localmente aplica-se de uma vez; o **procedimento** em duas fases é exercitado contra as duas
instâncias da pilha local, que é onde se prova que funciona.

## 6. Gates de saída por fase

| Fase | Critério | Verificação |
|---|---|---|
| 1 | Pilha local completa sobe com um comando | `docker compose --profile full up -d` |
| 1 | Aplicação de pé nas **duas** instâncias, atrás do proxy; smoke autenticado verde | — |
| 1 | Limitador partilhado verificado **entre instâncias** | teste que excede o limite alternando instâncias |
| 1 | Telemetria a chegar, 4 painéis versionados, alerta disparado e recebido | receptor de webhook local |
| 1 | Restauro **local** cronometrado, com nota de que é estimativa optimista | `docs/runbooks/ensaio-restauro.md` |
| 1 | `perf/baseline-pre-keycloak.json` versionado | 6 cenários |
| 2 | E2E verdes contra **Keycloak real** | `pnpm e2e` com Keycloak em compose |
| 2 | Renovação silenciosa de sessão coberta | cenário E2E novo |
| 2 | `gate-auditoria.mjs` verde nos 4 schemas | `pnpm gates` |
| 2 | `perf/baseline.json` com o 7.º cenário | re-medição pós-Keycloak |
| 2 | Preços Stripe criados, smoke real documentado | capturas no handoff |
| 2 | Procedimento de publicação em duas fases exercitado contra as 2 instâncias | — |
| 3 | E2E 37/37 · 5 gates verdes · tecto de lint · índice de ADR | `pnpm check && pnpm gates && pnpm e2e && pnpm test` |
| 3 | `CSP_ENFORCE=true` validado contra **build de produção local** | `pnpm build && pnpm start` |
| 4 | Migração vazia | `prisma migrate diff` sem SQL |
| 5 | *(parada — ver ADR-0026 §5)* | — |
| **Todas** | parecer do `code-reviewer` sem BLOCKERs | — |

## 7. O que fica explicitamente fora desta wave

Optimização de rota, portal do motorista e eventos assíncronos de transporte · locale inglês ·
custo-hora de produção por centro de trabalho · a camada de cache propriamente dita (o ADR-0014
autoriza a infraestrutura; **onde** aplicar depende dos números do `w8-desempenho`) · imutabilidade
criptográfica do trilho de auditoria · continuidade multi-região.

## 8. Dependências externas

O ADR-0026 eliminou quase todas: **não é preciso conta de nuvem nem de observabilidade**. O que resta:

**Com prazo que não controlamos — arranca no primeiro dia da fase 1:**

1. **Parecer fiscal** do ADR-0021 — contabilista certificado em MZ. Semanas. Sem ele não se cobra.

**Contas gratuitas, antes da fase 2:**

2. **Stripe em modo de teste** — para criar os 6 preços e correr o smoke real. Sem cartão.
3. **Cloudflare** — para as chaves do Turnstile. Escalão gratuito.

**Nada disto bloqueia a fase 1.** Ela corre inteiramente na máquina de quem a executa.

## 9. Revisão 3 — infraestrutura local, fornecedor adiado

O **ADR-0026** adiou a escolha de fornecedor de infraestrutura. O plano passou a ser **local primeiro**:

- A fase 1 deixou de ser «provisionar `dev` na AWS» e passou a ser **construir o ambiente local de
  referência** — sete serviços em Docker Compose, incluindo **duas instâncias da aplicação**, que são o
  que torna verificável o limitador partilhado, a sessão entre instâncias e a publicação em duas fases.
- A fase que criava `prod` saiu do caminho crítico e passou a **fase 5, parada por decisão**, com um
  agente (`w8-provisionamento`) que se recusa a arrancar sem um ADR que escolha o fornecedor.
- As tasks que só existem em produção foram com ela. As que só *pareciam* precisar de produção
  ficaram: a CSP em modo estrito valida-se contra um **build de produção local**, que é onde os
  problemas de *nonce* aparecem.
- O Terraform da AWS fica **dormente** — nem apagado nem promovido.
- `w8-infra` deu lugar a `w8-plataforma-local`.

**Custo em contas e dinheiro: zero.** O que continua por saber está listado sem rodeios no ADR-0026,
§Consequências: IAM, rede real, TLS, arranque a frio, custo e latência para Moçambique. O risco não foi
retirado — foi adiado, e chega-se-lhe com tudo o resto provado.

## 9-bis. Revisão 2 — o que mudou e porquê

A revisão 1 deste plano foi submetida a uma verificação prévia por agente, contra o código real. Foram
encontradas **doze incoerências**, todas confirmadas e todas corrigidas. As estruturais:

- **Não havia fase que criasse `prod`** — e três tasks dependiam dele (multi-AZ, replicação S3, e o
  *smoke* em produção que precede a CSP estrita). Nasceu a **fase 3**, e a consolidação e a separação
  de domínio deslizaram para 4 e 5.
- **`plataforma.prisma` não tinha dono** e era disputado por dois agentes da fase 2.
- **O cenário k6 de autenticação** mediria um fluxo inexistente; passou a haver duas linhas de base.
- **`DocumentoColaborador` já existe** com a forma errada — a migração não é vazia e por isso não pode
  partilhar janela com a separação de domínio.
- **A verificação de captcha já existe no ERP** — o que falta é o widget no site e as chaves.

O detalhe está no `docs/decisions/README.md`, secção «Errata».
