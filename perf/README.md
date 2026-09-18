# perf/ — campanha de desempenho e capacidade (ADR-0018)

Primeira medição de comportamento sob carga do GestPro. Vive ao lado de `e2e/`
e é propriedade do fluxo `w8-desempenho`.

> **A medição é local (ADR-0026).** Os números valem como **grandeza
> relativa** — que consulta é 10× mais lenta, se um índice melhorou, se um PR
> causou regressão — e **não** como valores absolutos de produção. O número
> «tenants por instância» sai daqui como **ordem de grandeza** para dimensionar
> e precificar, e é reconfirmado quando houver produção.

## Estrutura

```
perf/
├── k6/
│   ├── lib/               # sessão (login Credentials), server actions, utilitários
│   ├── scenarios/         # os 6 cenários da fase 1 (ADR-0018 §3)
│   └── ci-smoke.js        # cenário reduzido do gate de CI (10 VUs, 2 min)
├── scripts/
│   ├── discover-actions.mjs   # extrai IDs de Server Actions do build (.next)
│   ├── run-baseline.mjs       # corre a campanha e consolida o JSON de linha de base
│   └── compare-baseline.mjs   # gate de 20 % (permissivo sem baseline.json)
├── sql/
│   ├── reset-stats.sql        # limpa o pg_stat_statements antes da campanha
│   ├── top-queries.sql        # top-20 de consultas capturadas (ADR-0018 §5)
│   └── proposed-indexes.sql   # índices propostos (CREATE INDEX CONCURRENTLY, à mão)
├── explain/               # saídas de EXPLAIN (ANALYZE, BUFFERS) versionadas
├── baseline-pre-keycloak.json # linha de base da fase 1 (6 cenários)
└── baseline.json              # (fase 2, pós-Keycloak) referência do gate de CI
```

## Pré-requisitos

1. **Base de dados com volume** (lento — dezenas de minutos; nunca no arranque
   de dev normal):

   ```bash
   pnpm db:seed:volume                       # perfil pme: 1 tenant, volumes do ADR-0018 §2
   VOLUME_PROFILE=multi pnpm db:seed:volume  # 50 tenants (VOLUME_TENANTS/VOLUME_SCALE ajustam)
   VOLUME_PROFILE=ci pnpm db:seed:volume     # subconjunto para o gate de CI
   ```

   O seed é **idempotente** (IDs determinísticos + `ON CONFLICT DO NOTHING`) e
   escreve `perf/.generated/seed-manifest.json` com credenciais e amostras de
   IDs para os cenários. Os tenants de carga chamam-se `perf-001`…`perf-NNN`
   (`admin@perf-001.mz` / `perf1234`).

   **Nota de honestidade:** os valores financeiros são sintéticos e sem
   consistência cruzada garantida — servem para medir desempenho, nunca para
   validar contabilidade.

2. **Build de produção a correr** (dev server não se mede):

   ```bash
   cd apps/erp && pnpm build
   node perf/scripts/discover-actions.mjs        # IDs das Server Actions → .generated/actions.json
   ```

   Na fase B da Wave 8, o alvo é o **proxy da pilha local** (2 instâncias).

3. **k6** — binário local ou o contentor `grafana/k6` (o `run-baseline.mjs`
   usa o contentor automaticamente se `K6_BIN` não estiver definido).

## Correr

```bash
# Um cenário, em smoke (1 VU, 3 iterações — validação):
PROFILE=smoke BASE_URL=http://localhost:3000 k6 run perf/k6/scenarios/balancete-razao.js

# Campanha completa de linha de base:
PROFILE=baseline BASE_URL=http://localhost:3000 node perf/scripts/run-baseline.mjs

# Top-20 de consultas capturadas (depois da campanha):
psql "$DATABASE_URL" -f perf/sql/reset-stats.sql   # antes
psql "$DATABASE_URL" -f perf/sql/top-queries.sql   # depois
```

Variáveis: `BASE_URL`, `PROFILE` (`smoke`|`baseline`|`ci`), `TENANT_INDEX`
(tenant de carga a usar), `VUS`, `DURATION`, `RUN_OFFSET` (payroll: evita
colisão de meses entre campanhas na mesma BD).

## Os 6 cenários (fase 1)

| Cenário | Ficheiro | SLO provisório (p95) |
|---|---|---|
| Venda POS ponta-a-ponta | `pos-venda.js` | < 1 500 ms |
| Movimentos de stock (cursor, 400k linhas) | `movimentos-stock.js` | < 800 ms |
| Balancete + razão (250k partidas) | `balancete-razao.js` | < 3 000 ms |
| Emissão de factura + PDF | `fatura-pdf.js` | < 1 200 ms / PDF < 3 000 ms |
| Processamento salarial (80 colab.) | `payroll.js` | lote — limiar generoso, a rever |
| Exportação XLSX | `export-xlsx.js` | < 3 000 ms · **tecto real: 5 000 linhas** (achado) |

O 7.º cenário (autenticação) **só existe na fase 2**, contra Keycloak real —
medi-lo contra o `Credentials` actual produziria um número inválido no dia em
que a identidade fundir (ADR-0018, «duas linhas de base»).

## Estado — fase A triada

A campanha local de instância única correu e está triada: as 20 consultas mais
lentas têm `EXPLAIN (ANALYZE, BUFFERS)` versionado em `perf/explain/`
(pares `-antes`/`-depois` para as afectadas pelos índices propostos) e os
índices testados vivem em `perf/sql/proposed-indexes.sql`. A triagem completa,
os defeitos de domínio encontrados (D1–D7) e a resposta preliminar à cache do
ADR-0014 estão em **`docs/handoff/w8-desempenho.md`**. Atenção: o p95 da razão
de conta da fase A é **inválido** (a página devolvia erro com HTTP 200) e o
balancete correu sem filtro de datas — ver o handoff antes de citar números.

## Gate de CI

`.github/workflows/perf.yml` — cenário reduzido (`ci-smoke.js`) contra o
perfil `ci` do seed, build de produção standalone. O
`compare-baseline.mjs` falha o job se o p95 degradar > 20 % face a
`perf/baseline.json` — e corre em **modo permissivo** enquanto esse ficheiro
não existir (só nasce na re-medição pós-Keycloak). Alterar uma linha de base
versionada exige PR com justificação.
