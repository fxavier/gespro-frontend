# Design: Fluxo de Caixa (Spec 22)

> Ler antes: `.claude/skills/fluxo-de-caixa-conventions/SKILL.md`, `prisma-conventions`,
> `api-conventions`, `ui-conventions`. ADRs: [0036](../../docs/decisions/ADR-0036-projecao-tesouraria.md),
> [0037](../../docs/decisions/ADR-0037-demonstracao-fluxos-caixa.md).

## 1. Vocabulário (domain model)

Termos fixados aqui; qualquer desvio no código é um defeito de domínio, não de estilo.

| Termo | Definição | O que NÃO é |
|---|---|---|
| **Caixa** | Numerário físico numa `SessaoCaixa` | Não é o saldo bancário |
| **Tesouraria** | Caixa + saldo contabilístico das contas bancárias | Não inclui contas a receber |
| **Compromisso** | Uma obrigação ou direito datado, ainda não liquidado | Não é um lançamento |
| **Bucket** | Intervalo temporal com entradas, saídas e saldo de fecho | Não é um período contabilístico |
| **Horizonte** | Nº de dias para a frente, a partir de hoje (`Africa/Maputo`) | Não é o exercício |
| **Rubrica** | Linha da DFC, com actividade e sinal | Não é uma conta PGC |
| **Actividade** | Operacional, investimento ou financiamento (IAS 7) | Não é `ClassePGC` |
| **Articulação** | OP+INV+FIN == Δcaixa do período | Não é «bate aproximadamente» |
| **Provisório** | Mapa de período ainda aberto | Não é rascunho |

## 2. Delta de schema (`prisma/schema/financas.prisma`)

Único ficheiro de schema tocado pelos dois épicos. Migrações geradas **apenas pelo orquestrador**.

**WS-1**

```prisma
enum TipoCompromisso      { ENTRADA SAIDA }
enum RecorrenciaCompromisso { UNICA MENSAL TRIMESTRAL ANUAL }

model CompromissoTesouraria {
  id                 String                  @id @default(cuid())
  tenantId           String
  descricao          String
  tipo               TipoCompromisso
  valor              Decimal                 @db.Decimal(18, 2)
  dataPrevista       DateTime
  recorrencia        RecorrenciaCompromisso  @default(UNICA)
  dataFimRecorrencia DateTime?
  rubricaId          String?                 // → RubricaFluxoCaixa (WS-2; nulo até lá)
  contaContabilId    String?                 // → ContaPGC (escalar)
  ativo              Boolean                 @default(true)
  observacoes        String?
  criadoPorId        String
  createdAt          DateTime                @default(now())
  updatedAt          DateTime                @updatedAt
  deletedAt          DateTime?

  @@index([tenantId, dataPrevista, ativo])
  @@index([tenantId, deletedAt])
}
```

**WS-2** — `AtividadeFluxo`, `SinalFluxo`, `OrigemRubrica`, `RubricaFluxoCaixa`,
`MapeamentoContaFluxo` conforme ADR-0037 §2. `CompromissoTesouraria.rubricaId` ganha a relação
nesta wave.

**Ordem determinística de migração:** `22a_compromisso_tesouraria` (WS-1) →
`22b_rubricas_fluxo_caixa` (WS-2). Não invertível: `rubricaId` referencia a tabela da 22b.

## 3. Validações (`src/lib/validations/tesouraria.ts`, `.../fluxo-caixa.ts`)

Ficheiros **novos** — não estender `validations/contabilidade.ts`, que é ponto de conflito com o
spec 04. Ids sempre por `idEntidade()` (nunca `z.string().cuid()` — ver regras invioláveis).

```ts
export const GranularidadeEnum = z.enum(['DIARIA', 'SEMANAL', 'MENSAL']);
export const CenarioEnum       = z.enum(['OTIMISTA', 'BASE', 'PESSIMISTA']);

export const FiltroProjecaoSchema = z.object({
  horizonteDias: z.coerce.number().int().min(0).max(365).default(90),
  granularidade: GranularidadeEnum.default('SEMANAL'),
  cenario:       CenarioEnum.default('BASE'),
}).superRefine((v, ctx) => {
  const tecto = { DIARIA: 90, SEMANAL: 180, MENSAL: 365 }[v.granularidade];
  if (v.horizonteDias > tecto) ctx.addIssue({
    code: 'custom', path: ['horizonteDias'],
    message: `Granularidade ${v.granularidade} admite no máximo ${tecto} dias.`,
  });
});
```

`z.coerce.date()` obrigatório em todas as datas vindas de `searchParams` — o defeito D2 (ADR-0018 §6)
que manteve a DRE morta durante uma campanha inteira nasceu de um `z.string().optional()` sobreposto.

## 4. Serviços

### 4.1 `src/server/services/financas/projecao.service.ts` (WS-1)

`import 'server-only'`. Interface pública em `projecao.interface.ts`:

```ts
export async function projetarTesouraria(f: FiltroProjecaoInput, ctx: Ctx): Promise<ProjecaoTesouraria>;
export async function saldoTesourariaAte(data: Date, ctx: Ctx): Promise<Prisma.Decimal>;
export async function listarCompromissos(f: FiltroCompromissoInput, ctx: Ctx): Promise<Paginacao<CompromissoTesouraria>>;
export async function criarCompromisso(i: CriarCompromissoInput, ctx: Ctx): Promise<CompromissoTesouraria>;
export async function atualizarCompromisso(i: AtualizarCompromissoInput, ctx: Ctx): Promise<CompromissoTesouraria>;
export async function eliminarCompromisso(id: string, ctx: Ctx): Promise<CompromissoTesouraria>; // soft delete

// Funções PURAS, exportadas, testáveis sem base de dados — o núcleo verificável:
export function expandirRecorrencia(c: CompromissoBase, ate: Date): Ocorrencia[];
export function montarBuckets(inicio: Date, horizonte: number, g: Granularidade): Bucket[];
export function distribuirCompromissos(bs: Bucket[], os: Ocorrencia[], cen: Cenario, atraso: PerfilAtraso): Bucket[];
export function acumularSaldos(bs: Bucket[], abertura: Prisma.Decimal): Bucket[];
```

A separação puro/impuro não é estética: `montarBuckets`, `distribuirCompromissos` e
`acumularSaldos` são onde vivem os invariantes `I2`, `I3` e `I5`, e property tests sobre funções
puras correm em milissegundos e geram milhares de casos. Segue o precedente de
`montarLinhasBalancete` e `calcularLinhasDRE`.

**Pipeline de `projetarTesouraria`:**

1. `saldoAbertura` ← `saldoTesourariaAte(hoje, ctx)`: saldo do razão sobre os `contaContabilId`
   **distintos** das contas bancárias activas (§2-bis — não por conta bancária, que conta a dobrar),
   agregado com `FILTRO_LANCAMENTO_MAPA` e **sem delegar** no `saldoContabilAte`, que filtra só
   `LANCADO` (§2, issue #66), + Σ sessões `ABERTA`. Nunca `ContaBancaria.saldoAtual`.
2. Quatro agregações em paralelo (`Promise.all`), cada uma indexada por data:
   facturas a receber · contas a pagar · payroll processado · compromissos manuais.
3. `expandirRecorrencia` sobre os manuais.
4. `perfilAtraso(ctx, dataReferencia)` — atraso médio e desvio sobre facturas liquidadas ≤ 180
   dias, truncado em zero **por observação** e com desvio **amostral** (§10); `< 20` amostras ⇒
   `{ amostraInsuficiente: true }` e `BASE` degrada para `OTIMISTA`. A `dataReferencia` é a mesma
   do passo 1: um só relógio por projecção.
5. `montarBuckets` → `distribuirCompromissos` → `acumularSaldos`.
6. `primeiroDiaNegativo`, `menorSaldoProjetado`.

Tudo em `Prisma.Decimal`; serialização para o cliente por `.toString()` no `createSafeAction`
(`serializarDecimais` já o faz — ver regras invioláveis sobre o retorno das actions).

### 4.1-bis Regras de calendário e de fronteira (ADR-0036 §9–§11)

Fixadas **antes** do L2, porque as golden fixtures do L4 são apuradas à mão contra elas. Sem isto
escrito, o L2 escolhe uma, o L4 apura fixtures contra essa escolha, e ela passa a ser a regra da
casa por omissão — sem nunca ter sido decidida.

| Caso | Regra | Porquê não a alternativa |
|---|---|---|
| Recorrência a partir de dia inexistente no mês (31 → Fev) | `min(diaÂncora, últimoDiaDoMês)`; `diaÂncora` vem da `dataPrevista`, nunca da ocorrência anterior | Normalização JS move para o mês seguinte (Fev vazio, Mar a dobrar); clamp arrastado perde o dia original para sempre (*drift*) |
| 29 de Fevereiro em `ANUAL`/`TRIMESTRAL` | 28 de Fevereiro nos anos comuns | Mesma regra, sem excepção própria |
| Ocorrência em fim-de-semana ou feriado | **Não se desloca.** Dia civil, não dia útil | Exigiria tabela de feriados MZ, que não existe no repositório. Limitação conhecida |
| Fuso | Tudo em `Africa/Maputo`, incluindo a derivação do `diaÂncora` | O servidor corre em UTC; um `getDate()` cru muda o dia de âncora |
| Atraso de cobrança negativo | `max(0, dataPagamento − dataVencimento)`, truncado **por observação** antes de média e σ | Truncar só a média deixa o σ inflado por pagamentos adiantados; não truncar inverte o `I3` |
| Desvio do perfil de atraso | **Amostral** (`n − 1`); `n < 2` ⇒ σ = 0, nunca `NaN` | É uma amostra de que se infere o futuro, não a população; e o σ maior dá um `PESSIMISTA` mais conservador |
| `dataFimRecorrencia < dataPrevista` no núcleo puro | Lança `BusinessRuleError('RECORRENCIA_INVALIDA')` | Devolver vazio é indistinguível de recorrência terminada: o compromisso desaparece em silêncio |

Exemplo canónico, a reproduzir como caso nomeado no teste e na fixture do L4 — compromisso mensal
com `dataPrevista = 2026-01-31`, horizonte 150 dias **inclusive nos dois extremos** (`31 Jan + 150 =
30 Jun`; uma leitura exclusiva do fim daria cinco ocorrências e um exemplo canónico diferente):

```
2026-01-31 · 2026-02-28 · 2026-03-31 · 2026-04-30 · 2026-05-31 · 2026-06-30
```

### 4.2 `src/server/services/financas/dfc.service.ts` (WS-2)

```ts
export async function gerarDFC(f: FiltroDFCInput, ctx: Ctx): Promise<DFC | { impedimentos: string[] }>;
export async function contasNaoMapeadas(periodoId: string, ctx: Ctx): Promise<ContaNaoMapeada[]>;
export async function listarRubricas(ctx: Ctx): Promise<RubricaFluxoCaixa[]>;
export async function mapearConta(i: MapearContaInput, ctx: Ctx): Promise<MapeamentoContaFluxo>;

export function classificarVariacoes(bIni: LinhaBalancete[], bFim: LinhaBalancete[], mapa: MapaConta): VariacaoClassificada[];
export function montarSeccoesDFC(resultado: Prisma.Decimal, vs: VariacaoClassificada[]): SeccoesDFC;
export function verificarArticulacao(s: SeccoesDFC, deltaCaixa: Prisma.Decimal): void; // lança DFC_NAO_ARTICULA
```

`verificarArticulacao` corre **sempre**, em produção, não só em teste. O invariante `I6` é uma
pré-condição de saída do serviço, não uma asserção de suite.

**Ordem de execução de `gerarDFC`:** resolver período → `contasNaoMapeadas` (curto-circuito com
`impedimentos`) → `gerarDRE` → dois balancetes → `classificarVariacoes` → `montarSeccoesDFC` →
`verificarArticulacao` → devolver com `provisorio = periodo.estado !== 'FECHADO'`.

## 5. Actions e Route Handlers

`src/server/actions/tesouraria.actions.ts` e `fluxo-caixa.actions.ts` — ficheiros novos. Todas via
`createSafeAction`. As de consulta declaram `permiteEmLeitura: true` (sem isto o `gate-leitura`
recusa e, pior, o cliente em Leitura não vê o que é seu).

| Action | Permissão | Leitura | Revalidate |
|---|---|---|---|
| `projetarTesourariaAction` | `financas:tesouraria:leitura` | ✅ | — |
| `criarCompromissoAction` | `financas:tesouraria:escrita` | ❌ | `/tesouraria`, `/tesouraria/compromissos` |
| `atualizarCompromissoAction` | `financas:tesouraria:escrita` | ❌ | idem + `/[id]` |
| `eliminarCompromissoAction` | `financas:tesouraria:escrita` | ❌ | idem |
| `gerarDFCAction` | `financas:fluxo-caixa:leitura` | ✅ | — |
| `mapearContaAction` | `financas:fluxo-caixa:configurar` | ❌ | `/contabilidade/fluxo-caixa/rubricas` |

Route Handler: `src/app/api/contabilidade/dfc/export/route.ts` via `withApi`, `GET` (as exportações
passam em modo de Leitura por serem GET).

## 6. UI

Sem modais. `page.tsx` de listagem e detalhe são Server Components; interactividade nas folhas.
Colunas com `render`/`rowHref` em módulo `'use client'`. Datas por `format-date.ts`
(`Africa/Maputo`), dinheiro por `formatMZN`. Zero cores hardcoded.

```
src/app/(dashboard)/tesouraria/
  page.tsx                              SC — projecção; filtros em searchParams
  loading.tsx
  _components/
    grafico-projecao.tsx                'use client' — Recharts, ChartContainer partilhado
    tabela-buckets.tsx                  'use client' — colunas com render
    filtros-projecao.tsx                'use client' — horizonte/granularidade/cenário
    aviso-ambito.tsx                    SC — «não inclui vendas futuras não facturadas»
  compromissos/
    page.tsx · novo/page.tsx · [id]/editar/page.tsx
    _components/compromisso-form.tsx    'use client' — RHF + zodResolver

src/app/(dashboard)/contabilidade/dfc/
  page.tsx                              SC — reutiliza ../_components/seletor-periodo.tsx
  _components/tabela-dfc.tsx · impedimentos-painel.tsx
src/app/(dashboard)/contabilidade/fluxo-caixa/rubricas/
  page.tsx · [id]/editar/page.tsx · _components/mapeamento-tabela.tsx
```

Qualquer `useSearchParams()` numa folha vai envolvido em `<Suspense>` — sem isso o
`output: 'standalone'` parte o prerender e nem `pnpm check` nem `pnpm dev` o apanham.

Navegação: `AppSidebar.tsx` (Tesouraria + DFC no grupo Finanças), `Breadcrumbs.tsx`
(`tesouraria`, `dfc`, `fluxo-caixa`, `compromissos`, `rubricas`), `CommandPalette.tsx`.

## 7. Testes — o oráculo

Três camadas, todas externas ao julgamento do agente.

**7.1 Property tests (fast-check)** — `src/server/services/financas/__tests__/projecao.property.test.ts`
e `dfc.property.test.ts`. Um teste por invariante, nomeado pelo invariante:

| Invariante | Teste | Gerador |
|---|---|---|
| `I1` horizonte zero | `projecao.property` | saldos e contas arbitrários |
| `I2` conservação | `projecao.property` | conjuntos de compromissos arbitrários |
| `I3` monotonia de cenário | `projecao.property` | perfis de atraso arbitrários |
| `I5` idempotência de recorrência | `projecao.property` | datas e recorrências arbitrárias |
| `I6` articulação | `dfc.property` | balancetes arbitrários que somam |
| `I8` aditividade | `dfc.property` | partições de período |

**7.2 Golden fixtures** — `src/server/services/financas/__tests__/fixtures/`. Valores esperados
para o exercício do `pnpm db:seed` (64 produtos, 24 cotações, 20 encomendas, 176 vendas,
104 facturas). Um desvio falha o CI e obriga a justificação escrita no PR: a fixture nunca se
actualiza «para passar». Gerar com `pnpm vitest run -u` está **proibido** neste directório.

**7.3 Integração e E2E** — `test:integration` (Testcontainers) para isolamento multi-tenant
(`I4`, `I10`); `e2e/14-tesouraria.spec.ts` e `e2e/15-dfc.spec.ts` (Playwright) para os fluxos
completos; `e2e:a11y` (axe AA) nas quatro páginas novas, nos dois temas.

**7.4 Fora do ciclo automático.** A articulação prova que o mapa fecha, não que cada conta está na
actividade certa face ao Decreto 70/2009. A validação humana da tabela de mapeamento semeada é a
task `8.4 [HUMANO]` e não é substituível por gate verde nenhum. Ver ADR-0037 §Consequências.

## 8. Desempenho

Cenário k6 `perf/k6/22-projecao.js` e plano em `perf/explain/22-projecao.sql`, contra `perf-medio`
de `pnpm db:seed:volume`. Orçamento p95 < 400 ms (horizonte 90 d, granularidade diária). As quatro
agregações apoiam-se em índices existentes (`[tenantId, dataVencimento, status]` na `Fatura`,
`[tenantId, dataVencimento]` na `ContaPagar`) mais o novo `[tenantId, dataPrevista, ativo]`.
Se o orçamento falhar, corrige-se a query; não se introduz cache (ADR-0036 §Alternativas).

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Conflito de merge em `financas.prisma` entre WS-1 e WS-2 | Sequencial, não paralelo; migrações só pelo orquestrador |
| `tenant-bootstrap.ts` tocado pelo WS-2 (código crítico partilhado) | Delta isolado numa função própria `semearRubricasFluxo()`; teste em `tenant-bootstrap.test.ts` |
| Mapeamento semeado errado — invisível a todos os gates | Task `8.4 [HUMANO]`; golden fixture do seed |
| Projecção conservadora lida como previsão de negócio | `aviso-ambito.tsx` na própria página, não só na documentação |
| `Payroll.dataPagamento` nula em massa | Fallback «último dia útil do mês de referência» em `Africa/Maputo`, testado |
