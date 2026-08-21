# Spec 20 — Prontidão para Produção · Tasks

> **Design**: os ADRs [0010–0025](../../../docs/decisions/README.md). Um agente que contrarie o seu ADR
> está errado, mesmo que o código funcione.
> **Coordenação**: [`docs/handoff/execucao-paralela-w8.md`](../../../docs/handoff/execucao-paralela-w8.md).
> **Diagnóstico de origem**: `docs/GestPro-Arquitectura-e-Estado.pdf`, secções 10 a 12.
>
> Convenção: `[BLOCKING]` impede o avanço da fase. Cada task fecha com teste, não com afirmação.

---

## Fase 1 — Ambiente local de referência

### `w8-plataforma-local` · ADR-0026, 0012(local), 0014(local), 0020, 0022 §0

- [ ] 1.1 `[BLOCKING]` `docker-compose.yml` com **Postgres** (arquivo de WAL activo, para o ensaio de restauro)
- [ ] 1.2 `[BLOCKING]` **Keycloak** com versão fixada, base de dados própria, realm importado de ficheiro versionado
- [ ] 1.3 `[BLOCKING]` **Valkey** `8-alpine`, acessível só à rede interna da pilha
- [ ] 1.4 `[BLOCKING]` **MinIO** com bucket criado no arranque — fala a API S3 a sério, e é o que torna a política de POST do ADR-0017 verificável
- [ ] 1.5 `[BLOCKING]` **`grafana/otel-lgtm`** com receptor OTLP (entrega o destino ao `w8-observabilidade`)
- [ ] 1.6 **Mailpit** para apanhar e-mail sem fornecedor
- [ ] 1.7 `[BLOCKING]` **Duas instâncias** da aplicação (`erp-1`, `erp-2`) atrás de proxy — é o que torna verificáveis o limitador partilhado, a sessão entre instâncias e a publicação em duas fases
- [ ] 1.8 **Perfis do Compose**: um mínimo (só `db`) e um completo, para o trabalho de domínio não ter de levantar sete serviços
- [ ] 1.9 `.env.example` actualizado com tudo o que a pilha precisa; segredos em `.env` não versionado
- [ ] 1.10 `[BLOCKING]` Ensaio de cópia e restauro **local** cronometrado, com a BD carregada pelo gerador de volume; `docs/runbooks/ensaio-restauro.md` preenchido **com a nota de que é estimativa optimista**
- [ ] 1.11 Runbooks de restauro da BD e do Keycloak
- [ ] 1.12 `CLAUDE.md` com o arranque local actualizado
- [ ] 1.13 **Não tocar em `infra/live/` nem `infra/modules/`** — fica dormente (ADR-0026 §4). Não apagar, não promover
- [ ] 1.14 Handoff a dizer explicitamente **o que a pilha prova e o que não prova** (ADR-0026 §Consequências)

### `w8-observabilidade` · ADR-0019

- [ ] 2.1 Ligar o exportador OTLP ao serviço `otel-lgtm` da pilha local (logs, métricas, traces)
- [ ] 2.2 Acrescentar `tenantId` como etiqueta; garantir que `userId` e `requestId` **não** são etiquetas de métrica
- [ ] 2.3 Métricas de saúde do Keycloak: disponibilidade, latência do endpoint de token, taxa de falha
- [ ] 2.4 Métricas de saúde do **Valkey** (nomes de métrica `valkey_`, não `redis_`): disponibilidade, latência, contagem de falhas abertas do limitador
- [ ] 2.5 Sinais de negócio: vendas/min, facturas emitidas, webhooks Stripe falhados, tarefas agendadas em falta
- [ ] 2.6 Quatro painéis — visão geral, latência por rota, erros por tenant, sinais de negócio — **provisionados por ficheiro versionado**, nunca clicados
- [ ] 2.7 Alertas de paginação e de aviso, com destino a um **receptor de webhook local**; o destino humano fica para quando houver produção
- [ ] 2.8 `[BLOCKING]` Runbook por cada alerta que pagina; primeiro o de indisponibilidade do Keycloak
- [ ] 2.9 `[BLOCKING]` Disparar um alerta de propósito e confirmar recepção no receptor local
- [ ] 2.11 Garantir que mudar de destino de telemetria é **uma variável de ambiente**, não código
- [ ] 2.10 Confirmar que `/api/ready` **não** passa a depender de Keycloak nem de Valkey

### `w8-desempenho` · ADR-0018

- [ ] 3.1 `pnpm db:seed:volume` com os volumes do ADR-0018 §2
- [ ] 3.2 Segundo perfil: 50 tenants na mesma base de dados
- [ ] 3.3 **Seis** dos sete cenários k6 do ADR-0018 em `perf/` — o de autenticação fica para a fase 2, porque mede um fluxo que ainda não existe
- [ ] 3.4 `[BLOCKING]` Primeira execução; `perf/baseline-pre-keycloak.json` versionado
- [ ] 3.5 Confirmar ou ajustar os SLOs provisórios, por escrito — **e registar que a medição é local**: vale como grandeza relativa, não como valor absoluto de produção
- [ ] 3.6 `EXPLAIN (ANALYZE, BUFFERS)` nas 20 consultas mais lentas; triar cada varrimento sequencial
- [ ] 3.7 Índices propostos com `CREATE INDEX CONCURRENTLY` escrito à mão
- [ ] 3.8 Job `perf` no CI, cenário reduzido, limiar de 20 % — **sem falhar o merge** enquanto `baseline.json` não existir
- [ ] 3.9 `[BLOCKING]` Produzir o número **tenants por instância** como **ordem de grandeza** e destacá-lo no handoff — é um dos três números que o ADR-0026 §5 exige para escolher fornecedor
- [ ] 3.10 Responder se a cache do ADR-0014 se justifica, com dados

---

## Fase 2 — Identidade e bloqueadores comerciais

### `w8-identidade` · ADR-0010, 0011, 0012(app), 0013

- [ ] 4.1 `[BLOCKING]` Realm `gespro` em `infra/keycloak/realm-gespro.json`, versionado e importado; nunca clicado
- [ ] 4.2 `[BLOCKING]` Serviço Keycloak no `docker-compose.yml`; arranque local documentado no `CLAUDE.md`
- [ ] 4.3 `[BLOCKING]` Provider OIDC com PKCE em `src/lib/auth.ts`; remover os dois providers `Credentials`
- [ ] 4.4 Regras de negócio migradas de `authorize()` para `callbacks.signIn`/`jwt`, do lado do servidor
- [ ] 4.5 `User.keycloakSub` único e não nulo, com índice; remover `passwordHash`
- [ ] 4.6 `[BLOCKING]` Resolução de permissões no `callbacks.jwt` a partir da BD — o pipeline `createSafeAction` **não muda de forma**
- [ ] 4.7 Recusar sessão de utilizador do Keycloak sem `User` local, com mensagem explícita
- [ ] 4.8 Recusar e registar incidente se `tenantId` do token divergir do `User` local
- [ ] 4.9 Sessão de 15 minutos com renovação silenciosa
- [ ] 4.10 `[BLOCKING]` Provisionamento **Keycloak primeiro, Postgres depois**, idempotente por `ChaveIdempotencia`
- [ ] 4.11 Tarefa de reconciliação diária: **reporta, não repara**
- [ ] 4.12 Remover `PasswordResetToken`, `UserInvite` e `LoginAttempt` de `auth.prisma`, e `TokenVerificacaoEmail` de **`plataforma.prisma`**; remover `@node-rs/argon2`
- [ ] 4.12b `[BLOCKING]` És dono de `plataforma.prisma` nesta fase: escreve tu os modelos que `w8-billing` e `w8-auditoria` pedirem
- [ ] 4.13 `TokenHandoff` mantido, reduzido a transportar destino pretendido
- [ ] 4.14 Gestão de utilizadores escreve nos dois sítios, na mesma ordem, de forma idempotente
- [ ] 4.15 CSP com domínio do Keycloak em `form-action` e `connect-src`
- [ ] 4.16 5 utilizadores demo no realm com as mesmas credenciais
- [ ] 4.17 `[BLOCKING]` E2E verdes contra **Keycloak real** da pilha local
- [ ] 4.18 `[BLOCKING]` Cenário E2E novo: expiração e renovação silenciosa de sessão
- [ ] 4.19 Entregar o schema ao orquestrador — **não gerar a migration**

### `w8-cache` · ADR-0014

- [ ] 5.1 Adaptador Valkey da porta existente, janela deslizante por chave
- [ ] 5.2 Selecção de adaptador por variável de ambiente, padrão `STORAGE_DRIVER`
- [ ] 5.3 Limites do ADR-0014 §3 — **sem cobrir login nem recuperação** (é do Keycloak)
- [ ] 5.4 Falha aberta com alerta; **registo público falha fechado**
- [ ] 5.5 Teste de integração com Testcontainers para o adaptador Valkey
- [ ] 5.5b `[BLOCKING]` Teste que **excede o limite alternando entre as duas instâncias** da pilha — é a prova de que o contador é partilhado, e o motivo de existir este ADR
- [ ] 5.6 Confirmar que `/api/ready` não depende do Valkey
- [ ] 5.7 **Não escrever nenhuma chave de cache** nesta fase

### `w8-auditoria` · ADR-0015

- [ ] 6.1 `[BLOCKING]` Estender `AUDIT_MODELS` e `CRITICAL_ENTITIES` à lista completa do ADR-0015 §1
- [ ] 6.2 Escrita síncrona e transaccional para tudo o que toca em dinheiro
- [ ] 6.3 `MovimentoStock` e `SaldoStock` em modo assíncrono
- [ ] 6.4 Pedir a `w8-identidade` as colunas `requestId String?` e `keycloakSub String?` em `AuditLog` — **não as escrevas tu**
- [ ] 6.4b Usar os nomes de campo **reais** do modelo: `action`, `entity`, `entityId`, `createdAt`, `data`, `ip` (estão em inglês)
- [ ] 6.5 Diferencial antes/depois com o mesmo mecanismo de redacção do logger
- [ ] 6.6 `[BLOCKING]` `scripts/gate-auditoria.mjs` a percorrer os **quatro** schemas com modelos auditados — `financas`, `plataforma`, `pessoas-projetos` e `inventario` — com exclusões justificadas por linha
- [ ] 6.7 **Estender** o índice existente `@@index([tenantId, entity, entityId])` com `createdAt`, em vez de criar um novo que o duplique
- [ ] 6.8 Interface de consulta do trilho em definições, com exportação CSV por `withApi`
- [ ] 6.9 Política de retenção escrita: 10 anos fiscal, 2 anos acesso e stock

### `w8-billing` · ADR-0021

- [ ] 7.1 `[BLOCKING]` Redigir o pedido de parecer fiscal e entregá-lo ao orquestrador — **no primeiro dia**
- [ ] 7.2 Modelo `DocumentoSubscricao` com série própria via `proximoNumeroSerie`
- [ ] 7.3 Campos fiscais no perfil do tenant, recolhidos no registo (NUIT, morada, regime de IVA)
- [ ] 7.4 `src/lib/fiscalidade-saas.ts` parametrizável, com testes
- [ ] 7.5 Confirmar que `Assinatura` continua sem colunas de dinheiro
- [ ] 7.6 `[BLOCKING]` Criar os 6 preços na Stripe (3 planos × 2 ciclos)
- [ ] 7.7 `[BLOCKING]` Smoke real contra a API da Stripe em modo de teste: checkout, webhook, dunning, portal
- [ ] 7.8 Confirmar compare-and-set dos webhooks sob eventos concorrentes reais
- [ ] 7.9 **Não activar a cobrança**

### `w8-anti-abuso` · ADR-0016 · *arranca após merge de `w8-cache`*

- [ ] 8.1 Montar o **widget** do Turnstile em `apps/site` e fazer o `captchaToken` viajar preenchido. A verificação de servidor **já existe** em `src/server/security/captcha.ts` — não a reescrevas
- [ ] 8.1b Fixar `CAPTCHA_PROVIDER=turnstile` e fornecer as chaves; hoje o valor por omissão é `none`
- [ ] 8.2 `captchaToken` deixa de ser opcional **em `apps/site/src/lib/validations.ts`** (hoje `?? ""`); o ERP já exige `min(1)`
- [ ] 8.3 Rate limit do registo a falhar **fechado**
- [ ] 8.4 CSP com domínio do Turnstile em `script-src` e `frame-src`; verificar interacção com o nonce
- [ ] 8.5 Modo degradado: Turnstile inacessível → aceita com alerta
- [ ] 8.6 Tarefa de expurgo de não verificados aos 7 dias, **através de `withApi`**
- [ ] 8.7 Métrica de bloqueios por camada

### `w8-desempenho` · re-medição (ADR-0018) · *após merge de `w8-identidade`*

- [ ] 8.8 Acrescentar o 7.º cenário k6 — autenticação contra Keycloak real
- [ ] 8.9 `[BLOCKING]` Re-medição completa; produzir `perf/baseline.json`, que passa a ser a referência do gate de CI
- [ ] 8.10 Activar o modo de falha do job `perf` (deixa de correr em modo permissivo)

---

## Fase 3 — Consolidação

### `w8-armazenamento` · ADR-0017

- [ ] 9.1 `[BLOCKING]` Migrar presign de PUT para política de POST com `content-length-range`
- [ ] 9.2 Limites por recurso: 10 MB / 25 MB / 2 MB
- [ ] 9.3 Adaptador local acompanha a mudança e impõe o mesmo limite
- [ ] 9.4 `[BLOCKING]` `storage.delete()` ligado a toda a acção `removerDocumento*`, depois do commit do metadado
- [ ] 9.5 Mappers de leitura passam a expor `storageKey`
- [ ] 9.6 Tarefa de reconciliação semanal — **reporta, não apaga**
- [ ] 9.7 Regra de ciclo de vida para expirar prefixo `tmp/` às 24 h
- [ ] 9.8 `DocumentoColaborador` **já existe** em `pessoas-projetos.prisma:517` com a forma errada (`nome`/`url`/`dataUpload`). **Migrar**, não criar: `url` → `storageKey`, mais `nomeOriginal`, `tipoConteudo`, `deletedAt`
- [ ] 9.8b Acções de registo, listagem, remoção e cobertura no download
- [ ] 9.8c A migração **não é vazia** — tem de fundir **antes** da fase 4, nunca na mesma janela
- [ ] 9.9 Métrica de dimensão do bucket por tenant

### `w8-correcoes` · sem ADR

- [ ] 10.1 `[BLOCKING]` Corrigir o interceptor `@panel/(.)[id]` que captura `novo`; painel devolve `null`
- [ ] 10.2 `[BLOCKING]` Verificar os restantes módulos que replicaram o molde
- [ ] 10.3 Fechar as janelas de corrida da emissão de NC em devoluções e trocas com compare-and-set
- [ ] 10.4 Escrever o campo `erro` do webhook Stripe
- [ ] 10.5 Passar a tarefa agendada pelo pipeline `withApi`
- [ ] 10.6 Deixar de guardar o token de handoff em claro na `ChaveIdempotencia`
- [ ] 10.7 Confirmar que o login ambíguo cross-tenant ficou resolvido por `w8-identidade` — não duplicar
- [ ] 10.8 `[BLOCKING]` `CSP_ENFORCE=true`, validado contra **build de produção local** (`pnpm build && pnpm start`) sobre a pilha completa — é aí que os problemas de *nonce* aparecem, não na nuvem. Depende do merge de `w8-anti-abuso` (domínio do Turnstile na política)
- [ ] 10.9 Teste de regressão por cada item acima

### `w8-gates` · ADR-0024

- [ ] 11.1 `[BLOCKING]` `scripts/gate-dominios.mjs` com lista branca justificada para os contratos A e D
- [ ] 11.2 Triar as violações que a primeira execução revelar — corrigir ou justificar, nunca engordar a lista
- [ ] 11.3 Inventariar as ~140 violações de lint por regra e módulo em `docs/handoff/w8-lint.md`
- [ ] 11.4 `[BLOCKING]` Tecto de lint em ficheiro versionado; CI falha se subir
- [ ] 11.5 Fixar TypeScript em versão exacta nas duas aplicações
- [ ] 11.6 Migrar formulários do transporte para `react-hook-form` + `zodResolver`
- [ ] 11.7 Substituir schemas Zod locais da spec 11 pelos de `lib/validations`
- [ ] 11.8 Testes próprios por gate: um caso que passa, um que falha

### `w8-docs` · ADR-0023

- [ ] 12.1 Mover `DOCUMENTACAO.md` para `docs/historico/DOCUMENTACAO-pre-migracao.md` com aviso no topo
- [ ] 12.2 Identificador canónico `ADR-0005-a/-b/-c` no cabeçalho dos três ficheiros
- [ ] 12.3 `[BLOCKING]` `docs/decisions/__tests__/adr-index.test.ts` verde
- [ ] 12.4 `docs/README.md` com a tabela de encaminhamento; referenciar no README da raiz
- [ ] 12.5 Corrigir `CLAUDE.md` §Referência, que ainda diz «o próximo ADR deve renumerar» — o ADR-0023 decidiu explicitamente **não** renumerar
- [ ] 12.6 Actualizar `docs/status.md` com o estado da Wave 8

---

## Fase 4 — Separação de domínio

### `w8-separacao-dominio` · ADR-0025 · *sozinho, e depois de `w8-armazenamento` fundir*

- [ ] 13.1 `pessoas.prisma` (26 modelos), `projetos.prisma` (16), `producao.prisma` (8)
- [ ] 13.2 Dividir `src/server/services/pessoas-projetos/` em três pastas homónimas
- [ ] 13.3 Relações que atravessam a nova fronteira passam a chaves escalares com índice
- [ ] 13.4 Publicar contrato onde havia acesso directo entre as novas fronteiras
- [ ] 13.5 `[BLOCKING]` **Migração vazia** — `prisma migrate diff` sem SQL além de criação de índice
- [ ] 13.6 Confirmar com `w8-armazenamento` onde nasce o `DocumentoColaborador`
- [ ] 13.7 `[BLOCKING]` `pnpm check` + `pnpm gates` + `pnpm e2e` verdes

---

## Definição de pronto (todas as tasks)

1. `pnpm check` e `pnpm gates` verdes no worktree.
2. Teste que cobre o comportamento — não «verificado por leitura».
3. Handoff em `docs/handoff/w8-<agente>.md` com decisões tomadas, dívida deixada e comandos corridos.
4. Parecer do `code-reviewer` sem BLOCKERs.
5. Para tudo o que toca em UI: smoke autenticado, porque `pnpm check` não apanha erros de runtime RSC.

---

## Fase 5 — Provisionamento · **PARADA por decisão**

### `w8-provisionamento` · bloqueado pelo [ADR-0026](../../../docs/decisions/ADR-0026-adiamento-fornecedor-infraestrutura.md) §5

Não arranca sem um ADR que escolha o fornecedor de infraestrutura. A escolha exige três números que
esta wave produz: **tenants por instância** (task 3.9), **perfil de carga** e **preço por escalão**.

Quando existir essa decisão, o âmbito é:

- [ ] 14.1 Provisionar o ambiente de desenvolvimento no fornecedor escolhido; destruir e recriar uma vez
- [ ] 14.2 Criar **produção** com alta disponibilidade
- [ ] 14.3 Recuperação a um ponto no tempo com retenção longa (ADR-0020 §2)
- [ ] 14.4 Versionamento e replicação de objectos para outra região
- [ ] 14.5 Publicação em **duas fases** da migração destrutiva do ADR-0013, com instantâneo prévio
- [ ] 14.6 Smoke autenticado em produção
- [ ] 14.7 Ensaio de restauro **contra produção** — é este que valida o RTO a sério; o local é estimativa optimista
- [ ] 14.8 Apontar o exportador de telemetria ao destino de produção (uma variável, não código)
- [ ] 14.9 Registar os **custos reais**, fechando o ciclo aberto pelo ADR-0026
- [ ] 14.10 Decidir o destino de `infra/live/` e `infra/modules/`: promover, se a escolha for AWS; ou arquivar, com ADR que o registe
