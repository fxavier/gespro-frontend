# ADR-0005 — Observabilidade Operacional: Logging, Tracing e Captura de Erros

**Data**: 2026-07-20
**Estado**: Aceite
**Autores**: Spec 14 (feat-observabilidade)
**Skill**: `engineering:architecture`

---

## Contexto

O sistema GestPro não tinha observabilidade operacional: sem logging estruturado, sem tracing distribuído,
sem captura de erros e sem endpoints de saúde. Em produção multi-tenant isto impede diagnosticar latência,
erros e fugas por tenant. A arquitectura é um monólito Next.js 16 com App Router; a instrumentação deve
ser exclusivamente server-side (fronteira RSC — nunca importada em Client Components).

## Decisão

### 1. Logging estruturado — implementação nativa + pino

Adoptamos uma implementação nativa (Node.js built-ins) que produz JSON pino-compatível, sem dependência
runtime obrigatória. O pacote `pino` (v9.x) é adicionado ao `package.json`; quando instalado pelo
orquestrador substitui a implementação nativa com zero alterações de contrato.

**Razão**: Pino é o logger Node.js mais rápido e com melhor integração no ecossistema (OTel, Sentry, Loki).
O fallback nativo garante que `pnpm check` passa antes da instalação das deps.

**Formato**:
- Produção: JSON numa linha por evento — ingestível por Loki/Elastic/CloudWatch.
- Dev: `pino-pretty` (activado via `PINO_PRETTY=1` ou `NODE_ENV=development`).
- Campos obrigatórios por pedido: `time`, `level`, `requestId`, `tenantId`, `userId`, `method`, `url`, `status`, `duration`.

### 2. Correlação de pedidos — AsyncLocalStorage

O `requestId` (UUIDv4) é gerado nos envelopes (`withApi` / `createSafeAction`) e propagado via
`AsyncLocalStorage` em `src/server/observability/context.ts` — o mesmo mecanismo do `TenantContext`.

**Razão da separação**: o contexto de tenant é gerido pelo `tenant-extension.ts` (partilhado com 7
outros workstreams); adicionar `requestId` ao mesmo store introduziria conflito de merge. Stores
separados que coexistem sem interferência.

**Propagação**:
- `withApi` → `runWithRequestContext` → `runWithTenantContext` → handler.
- `createSafeAction` → `runWithRequestContext` → `runWithTenantContext` → handler.
- O logger lê o contexto em cada `write()` — não é necessário passar `requestId` manualmente.
- Resposta HTTP: header `x-request-id`.

**NÃO passa pelo middleware** (spec 17 — edge runtime): o requestId é gerado nos envelopes Node.js.

### 3. OpenTelemetry — carregamento dinâmico em instrumentation.ts

Adoptamos OpenTelemetry JS SDK (`@opentelemetry/sdk-node` v0.57.x) com exporter OTLP HTTP.

**Razão**: standard open-source adoptado pela industria; compatível com Jaeger, Tempo, Honeycomb,
Datadog e qualquer backend OTLP. Evita lock-in de vendor.

**Carregamento**: via `new Function('s', 'return import(s)')` em `instrumentation.ts` — padrão
aprovado para contornar a resolução de módulos TypeScript/Bundler quando os pacotes ainda não estão
instalados. Em runtime Node.js o `import()` nativo funciona sem restrições.

**Activação**: configurável por env:
```
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318/v1/traces
OTEL_SERVICE_NAME=gespro
OTEL_SAMPLE_RATE=0.1  # 10% em produção
```
Se `OTEL_EXPORTER_OTLP_ENDPOINT` não estiver definido, o OTel não é inicializado (modo silencioso).

**Prisma**: `@prisma/instrumentation` instrumenta as queries automaticamente quando instalado.

### 4. Captura de erros — estratégia em camadas

| Camada | Mecanismo |
|--------|-----------|
| Erros `AppError` conhecidos | Log `warn`; devolver `ActionResult`/envelope sem stack |
| Erros inesperados | Log `error` com `stack` (server-side); cliente recebe `{ traceId }` em `details` |
| Erros de runtime RSC | `global-error.tsx` / `error.tsx` (existentes) |
| Erros de infra | OTel spans marcados como `ERROR` |

**Invariante**: nenhuma stack trace chega ao cliente — respeita o contrato `AppError` e o modelo de
segurança do CLAUDE.md.

### 5. Saúde e métricas

- `GET /api/health` — liveness: responde 200 se o processo está de pé.
- `GET /api/ready` — readiness: `SELECT 1` via `prismaBase`; 503 se DB inacessível.
- `GET /api/metrics` — RED metrics (rate/errors/duration) em JSON; protegido por `METRICS_SECRET`.
  Quando `prom-client` (v15.x, em `package.json`) é instalado, substituir pelo formato Prometheus.

Endpoints de saúde são públicos/controlados (`public: true` em `withApi`); em produção a restrição
de rede fica a cargo do spec 17 (middleware/WAF).

## Alternativas Consideradas

| Opção | Razão de exclusão |
|-------|-------------------|
| Sentry SDK | Vendor lock-in; requer configuração extra para mascaramento PII; OTel é standard |
| Winston | Mais lento que pino; API mais verbosa; menos integração com Next.js |
| `console.log` estruturado | Sem níveis, sem redacção automática, sem child loggers |
| Pino importado directamente (sem fallback) | Falha `tsc --noEmit` quando deps não instaladas |
| `@vercel/otel` | Lock-in Vercel; não suportado em infra própria (spec 16) |

## Consequências

**Positivas**:
- Todos os pedidos têm `requestId` correlacionado nos logs e na resposta.
- Segredos/PII nunca aparecem nos logs (redacção por chave, testada com cobertura de casos).
- `pnpm check` + `pnpm gates` passam sem dependência de pacotes externos instalados.
- OTel activável por env sem mudanças de código.

**Negativas / Trade-offs**:
- Métricas em memória (reset por restart); para produção real é necessário `prom-client` + push gateway
  ou substituição por OTel metrics (pendente orquestrador instalar deps).
- Amostragem OTel configurável mas não automática por tenant (trade-off de simplicidade vs. overhead).
- `pino-pretty` adicionado a `dependencies` (não `devDependencies`) por restrição do orquestrador
  (spec 14: só editar bloco `dependencies`).

## Campos Redactados (Política de Privacidade)

Chaves exactas (case-insensitive): `password`, `senha`, `authorization`, `nuit`, `bi`, `apikey`,
`accesstoken`, `refreshtoken`, `privatekey`, `clientsecret`.

Substrings no nome da chave: `token`, `secret`, `password`, `senha`.

Profundidade máxima de redacção: 6 níveis (protecção contra recursão infinita).

## Referências

- [pino docs](https://getpino.io)
- [OpenTelemetry JS](https://opentelemetry.io/docs/languages/js/)
- [Next.js Instrumentation](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation)
- CLAUDE.md — Fronteira Servidor↔Cliente, Regras invioláveis
- Spec 14 design.md — Arquitectura de correlação
- ADR-0001 a ADR-0004 — Stack e decisões anteriores
