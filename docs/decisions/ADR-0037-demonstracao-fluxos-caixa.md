# ADR-0037 — Demonstração de Fluxos de Caixa (método indirecto)

- **Estado**: Proposto
- **Data**: 2026-09-21
- **Contexto**: Spec 22 (Fluxo de Caixa) · Épico WS-2
- **Depende de**: [ADR-0033](./ADR-0033-exercicio-contabilistico.md) (período, `FILTRO_LANCAMENTO_MAPA`), [ADR-0035](./ADR-0035-encerramento-exercicio.md) (saldos de abertura transportados), [ADR-0036](./ADR-0036-projecao-tesouraria.md) (`RubricaFluxoCaixa` nasce lá)
- **Relacionados**: [ADR-0034](./ADR-0034-apuramento-iva.md), [ADR-0015](./ADR-0015-auditoria-documentos-financeiros.md)
- **Skills**: `engineering:architecture`, `prisma-conventions`, `fiscalidade-mz`, `fluxo-de-caixa-conventions`

## Contexto

O GestPro produz balancete, razão geral e DRE, e não produz a terceira demonstração financeira
obrigatória. A DFC não é um relatório a mais: é o único mapa que liga o resultado do exercício ao
dinheiro que efectivamente entrou e saiu, e é aquele onde um resultado positivo com tesouraria
negativa se torna visível.

Três factos condicionam o desenho.

**1. A infra-estrutura de cálculo já existe e é reutilizável.** `montarLinhasBalancete` está
isolada como função pura (`contabilidade.service.ts:860`), `gerarDRE` idem (`calcularLinhasDRE:1014`),
e `FILTRO_LANCAMENTO_MAPA` (`:97`) já resolve a pergunta «que lançamentos contam para um mapa». A
DFC indirecta é, mecanicamente, uma diferença entre dois balancetes mais o resultado da DRE.

**2. O plano de contas não classifica fluxos.** `ContaPGC` tem `ClassePGC`, `TipoConta` e
`NaturezaConta` — nenhum deles diz se a variação de uma conta é operacional, de investimento ou de
financiamento. A classe 1 (meios financeiros) identifica o que **é** caixa; nada identifica a
**origem** do movimento. Essa informação não existe no sistema e tem de passar a existir.

**3. Os tenants alteram o plano de contas.** Existe `financas:plano-contas:escrita` e a UI
`/contabilidade/plano-contas`. Qualquer classificação assente em prefixos de código literais
(`"começa por 43" → investimento`) funciona no seed demo e falha no primeiro cliente que criar uma
analítica própria — silenciosamente, porque a conta não mapeada simplesmente desaparece do mapa e
a DFC continua a somar.

**4. A natureza das contas já mordeu uma vez.** A nota das regras invioláveis sobre a classe 4 —
`44331 IVA liquidado` e `421 Fornecedores c/c` com sinal ao contrário do resto da classe, «não há
regra única: é conta a conta» — é precisamente o problema da DFC ampliado. Um mapeamento
hard-coded herda esse defeito sem o tornar visível.

## Decisão

**1. Método indirecto como mapa oficial.** Parte-se do resultado líquido do período (da `gerarDRE`
existente), corrige-se pelos não-caixa (amortizações, provisões, imparidades) e pelas variações de
capital circulante entre dois balancetes, e classifica-se cada variação em operacional, investimento
ou financiamento. Alinha com o IAS 7 §18(b) e é o formato que um revisor moçambicano espera receber.

**2. Classificação por dados, não por código: dois modelos novos.**

```prisma
model RubricaFluxoCaixa {
  id          String            @id @default(cuid())
  tenantId    String
  codigo      String            // OP-01, INV-02, FIN-03
  designacao  String
  atividade   AtividadeFluxo    // OPERACIONAL | INVESTIMENTO | FINANCIAMENTO
  sinal       SinalFluxo        // ENTRADA | SAIDA | VARIACAO
  ordem       Int
  origem      OrigemRubrica     // SISTEMA | TENANT
  ativo       Boolean           @default(true)
  deletedAt   DateTime?
  @@unique([tenantId, codigo])
  @@index([tenantId, atividade, ordem])
}

model MapeamentoContaFluxo {
  id          String   @id @default(cuid())
  tenantId    String
  contaId     String   // → ContaPGC
  rubricaId   String   // → RubricaFluxoCaixa
  @@unique([tenantId, contaId])      // uma conta pertence a UMA rubrica
  @@index([tenantId, rubricaId])
}
```

O `@@unique([tenantId, contaId])` é a decisão estrutural: proíbe por construção que a mesma conta
seja contada em duas actividades. A dupla contagem numa DFC não dá erro — dá um mapa que soma
certo em cada secção e errado no total.

**3. Semeado pelo sistema, editável pelo tenant.** `tenant-bootstrap.ts` cria o conjunto de rubricas
`origem: SISTEMA` e mapeia todas as contas folha do PGC padrão. As rubricas `SISTEMA` não se apagam
(soft delete recusado com `RUBRICA_DE_SISTEMA`); o mapeamento de qualquer conta é reatribuível pelo
tenant com `financas:fluxo-caixa:configurar`. Uma conta criada pelo tenant nasce **não mapeada**, e
é isso que a §4 resolve.

**4. Conta não mapeada é um impedimento, não um zero.** `gerarDFC` executa primeiro
`contasNaoMapeadas(periodo)`; se alguma conta com movimento no período não tiver mapeamento, devolve
`impedimentos: string[]` com a lista e **não produz mapa**. Segue o padrão já estabelecido pelo
`fecharPeriodo` (sete pré-condições devolvidas todas de uma vez). O alternativo — tratar a conta
não mapeada como zero — produz uma DFC que não fecha e obriga a caçar a diferença à mão.

**5. O verificador é a articulação, e corre dentro do serviço.** Em todas as execuções:

```
operacional + investimento + financiamento == saldoCaixa(fim) − saldoCaixa(inicio)
```

onde `saldoCaixa(d)` é a soma de `saldoContabilAte` sobre as contas de classe 1 mapeadas como meios
líquidos. Divergência ⇒ `BusinessRuleError('DFC_NAO_ARTICULA')` com o delta no `details`. Um mapa
que não articula não é um mapa com um erro: é um número inventado, e não sai do serviço.

**6. Ancorada ao exercício e ao período (ADR-0033).** Os limites do mapa são `PeriodoContabil`, não
datas livres. Filtra por `FILTRO_LANCAMENTO_MAPA`, dia fiscal via `diaCivilEmMaputo`. Um mapa de um
período aberto sai marcado **provisório** na UI e na exportação.

**7. Exportação e permissões.** Route Handler `withApi` em
`/api/contabilidade/dfc/export` (CSV e PDF pelo motor do ADR-0005). Permissões novas:
`financas:fluxo-caixa:leitura`, `financas:fluxo-caixa:configurar`; a exportação reutiliza
`financas:exportar`.

**8. O método directo fica fora de âmbito, por agora.** A infra-estrutura escolhida não o impede —
`RubricaFluxoCaixa.sinal` e a classificação por conta são exactamente o que um motor directo
consumiria a partir de `MovimentoCaixa` e dos itens reconciliados. Entra quando a reconciliação
bancária tiver cobertura real de extractos nos tenants; antes disso o mapa directo mede a qualidade
da importação de extractos, não a tesouraria.

## Alternativas consideradas

**Mapeamento fixo em código por prefixo de conta PGC.** Rejeitada apesar de mais simples e sem
estado novo: quebra em qualquer plano de contas customizado, e quebra em silêncio — a conta
desconhecida cai fora de todas as secções e o mapa continua a somar. A §4 deste ADR só é possível
com o mapeamento em dados.

**Método directo como mapa oficial.** Rejeitada para já. É mais legível para o gestor, mas não
reconcilia com a DRE sem uma nota de reconciliação que é, ela própria, o método indirecto — e
depende da qualidade da reconciliação bancária, que ainda não tem cobertura real. Ver §8.

**Os dois motores com invariante de convergência.** Rejeitada por custo (≈ 40 % de esforço extra e
um gate adicional no grafo) num épico onde o invariante de articulação da §5 já dá a garantia
essencial. Reavaliar em conjunto com a §8.

**`@@unique([tenantId, contaId, rubricaId])` permitindo N rubricas por conta com peso.** Rejeitada:
a repartição ponderada de uma conta por actividades é um requisito de consolidação de grupo que não
temos, e abre a porta à dupla contagem que a §2 fecha.

## Consequências

**Positivas.** O mapa nunca sai errado sem avisar (§4 e §5 são recusas, não avisos). A DFC passa a
ser configurável sem deploy. O balanço de abertura do ADR-0035 e a DFC partilham a mesma noção de
período, logo não podem divergir de fronteira.

**Negativas e aceites.** Dois modelos e dois enums novos em `financas.prisma`, mais um passo no
`tenant-bootstrap` — que é código crítico partilhado e ponto de conflito de merge conhecido; por
isso o épico WS-2 só arranca depois do WS-1 estar integrado (ver `docs/agentic/grafo-22-fluxo-de-caixa.md`).
A qualidade da DFC fica dependente da qualidade do mapeamento inicial semeado: um mapeamento
sistema errado é tão invisível como um hard-code errado, e é por isso que o seed é coberto por
golden fixtures (spec 22 §Testes).

**Risco explicitamente aceite:** decidiu-se não trancar o merge numa revisão por contabilista
moçambicano. Os oráculos são a articulação (`I6`), as golden fixtures sobre o seed demo e os E2E.
Isto verifica que o mapa **fecha**, não que cada conta está na **actividade certa** face ao Decreto
70/2009. Consequência: antes de o mapa ser apresentado a um cliente real, é obrigatória uma
validação humana da tabela de mapeamento semeada, fora do ciclo agêntico. Está registado como task
`8.4 [HUMANO]` no spec 22 e não é dispensável por nenhum gate verde.

**Invariantes que trancam a implementação:**

- `I6` — Articulação: `OP + INV + FIN == Δcaixa` do período, em `Decimal` exacto. (§5)
- `I7` — Cobertura: toda a conta com movimento no período tem exactamente um mapeamento, ou o
  serviço devolve `impedimentos` e nenhum mapa.
- `I8` — Aditividade: DFC(Jan..Dez) == Σ DFC(mês), para as três actividades.
- `I9` — Coerência com a DRE: o resultado líquido que abre a secção operacional é, ao cêntimo, o
  `resultadoLiquido` de `gerarDRE` para o mesmo período.
- `I10` — Isolamento: rubricas e mapeamentos de outro tenant nunca entram; cross-tenant → `NotFoundError`.

## Fontes

- IAS 7 *Statement of Cash Flows*, §18(b) (método indirecto) — https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows/
- Decreto 70/2009 de 22 de Dezembro (PGC-NIRF), Boletim da República I Série n.º 50.
- Estado verificado: `contabilidade.service.ts` (`montarLinhasBalancete:860`, `calcularLinhasDRE:1014`,
  `gerarDRE:1083`, `saldoContabilAte:1177`, `fecharPeriodo:1621`), `prisma/seed/data/plano-contas-pgc.json`.
