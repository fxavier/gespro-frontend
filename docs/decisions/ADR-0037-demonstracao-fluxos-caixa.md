# ADR-0037 — Demonstração de Fluxos de Caixa (método indirecto)

- **Estado**: Aceite
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

## Emenda 2026-09-25

Origem: sessão de grooming da issue #153, de 2026-09-25 (`docs/agentic/issue-153/intent.md`, decisões Q2, Q4 e
Q6, e uma decisão de produto sobre a exportação). A emenda entra no próprio texto, e não num ADR novo, porque o
ADR ainda estava em `Proposto`. Os parágrafos originais ficam como estavam: esta secção prevalece sobre eles onde
colidem.

**Altera**: §5 (o que é caixa), §6 (limites e comparativo), §7 (formato da exportação) e a definição de `I6`.
**Acrescenta** `V1`–`V4` aos invariantes que trancam a implementação.

**E1. O mapeamento é versionado, e cada versão é validada (Q2).** O parecer do contabilista fica associado à
versão concreta do mapeamento que produziu a DFC. Modelo novo:

```prisma
enum AtividadeFluxo { OPERACIONAL INVESTIMENTO FINANCIAMENTO CAIXA }   // CAIXA: Q6
enum EstadoVersaoMapeamento { PENDING VALIDATED }                        // Q2; nomes em E6

model VersaoMapeamentoFluxo {          // append-only; uma por alteração
  id            String   @id @default(cuid())
  tenantId      String
  numero        Int                    // 1, 2, 3… por tenant
  estado        EstadoVersaoMapeamento @default(PENDING)
  instantaneo   Json                   // rubricas + {contaId, rubricaId}[] desta versão
  validadoPorId String?
  validadoEm    DateTime?
  observacao    String?
  createdAt     DateTime @default(now())
  @@unique([tenantId, numero])
}
```

- `RubricaFluxoCaixa` e `MapeamentoContaFluxo` ficam como na §2 e continuam a ser a cópia de trabalho que o
  `gerarDFC` lê. A versão guarda o instantâneo, para o histórico e para a auditoria.
- O instantâneo é JSON para não duplicar centenas de linhas de mapeamento a cada alteração. O preço é que não se
  consulta por SQL; se um dia for preciso comparar versões na base, passa a tabela filha.
- Cada versão fixa o conjunto de rubricas, a atribuição conta→rubrica e as contas de caixa (E2).
- A DFC diz com que versão foi produzida: o número aparece no ecrã e no PDF.
- Uma versão `PENDING` não impede a DFC. O mapa sai na mesma, com a faixa «Mapeamento por validar».
- Versões e validações nunca se apagam.

Invariantes novos:

- `V1` — O instantâneo da versão mais recente é igual, ao elemento, ao mapeamento vivo.
- `V2` — Qualquer escrita no mapeamento cria a versão `n+1` em `PENDING`, na mesma `$transaction`. Uma escrita
  que não muda nada não cria versão.
- `V3` — Só se valida a versão mais recente. Uma versão anterior recusa com `VERSAO_DESACTUALIZADA`. Validar é a
  **única** escrita permitida sobre uma versão.
- `V4` — Um intervalo com início e fim em exercícios diferentes recusa com `DFC_ENTRE_EXERCICIOS`. (E3)

**E2. Caixa é uma rubrica, não a classe 1 (Q6). Altera §5 e `I6`.** A §5 definia `saldoCaixa(d)` sobre «as contas
de classe 1 mapeadas como meios líquidos», que é uma classificação por código, rejeitada pela §Contexto 3. A Q6
decidiu que não se assume a classe 1 inteira como caixa.

- `AtividadeFluxo` ganha `CAIXA`. A rubrica «Caixa e equivalentes de caixa» tem actividade `CAIXA`.
- As contas de caixa são as contas mapeadas a rubricas de actividade `CAIXA`. É configuração do tenant, registada
  explicitamente. **Nunca se deduz por prefixo**, nem se assume a classe 1 inteira.
- Nova definição: `saldoCaixa(d)` = soma de `saldoContabilAte(d)` sobre as contas mapeadas a rubricas de
  actividade `CAIXA`.
- `I6` passa a ler-se: `OP + INV + FIN == Δcaixa` do período, em `Decimal` exacto, com `Δcaixa` calculado só
  sobre essas contas.
- Como uma conta tem uma só rubrica (§2), uma conta de caixa fica fora das três actividades.
- Coerência com o plano de contas, verificada pelo serviço:
  - **nenhuma** conta `CAIXA` ⇒ **impedimento**: sem elas não há `Δcaixa` e não há articulação;
  - conta `CAIXA` fora da classe 1, de agregação ou inactiva ⇒ **aviso**, que não bloqueia.
- As contas de caixa fazem parte da versão (E1). Alterá-las cria uma versão nova e invalida a validação anterior.

**E3. Limites no mesmo exercício, comparativo homólogo (Q4). Refina §6.**

- O intervalo é um período ou um intervalo de períodos do **mesmo** `ExercicioContabil`. Início e fim em
  exercícios diferentes recusam com `DFC_ENTRE_EXERCICIOS` (`V4`).
- Comparativo N-1: o **período homólogo do exercício anterior**, com a mesma granularidade e o mesmo intervalo
  relativo. 01/04/2026–30/06/2026 compara com 01/04/2025–30/06/2025.
- Sem exercício anterior, a coluna N-1 mostra «—». Não se calcula um N-1 parcial a partir dos saldos de abertura
  do ADR-0035.

**E4. Exportação só em PDF. Altera §7.** O CSV sai. Decisão de produto na sessão de grooming. O PDF, pelo motor do
ADR-0005, leva as colunas N e N-1, o número da versão do mapeamento e as marcas «Provisório» e «Mapeamento por
validar» quando se aplicam. Havendo impedimentos, a rota responde 422 com a lista e sem PDF. O resto da §7
mantém-se: `withApi` em `/api/contabilidade/dfc/export`, `financas:exportar`.

**E5. Quem valida a versão: permissão própria, `financas:fluxo-caixa:validar`.** Decisão do humano na aceitação,
para segregar funções: quem configura o mapeamento não é, por omissão, quem o valida.

- `financas:fluxo-caixa:configurar` cria e altera rubricas, mapeamentos e contas de caixa.
- `financas:fluxo-caixa:validar` valida uma versão (a mais recente, `V3`), com observação opcional.
- Por omissão só o ADMIN, que tem acesso total, recebe `:validar`. O contabilista recebe um papel que a inclua.

**E6. Nomes do estado da versão: `PENDING`/`VALIDATED`.** Decisão do humano na aceitação: é um enum técnico, e
os nomes ficam em inglês como o código. Na UI, «Por validar» e «Validado».

**Invariantes que trancam a implementação, depois desta emenda**: `I6` (com a definição de E2), `I7`, `I8`, `I9`,
`I10`, e `V1`–`V4`.

## Fontes

- IAS 7 *Statement of Cash Flows*, §18(b) (método indirecto) — https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows/
- Decreto 70/2009 de 22 de Dezembro (PGC-NIRF), Boletim da República I Série n.º 50.
- Estado verificado: `contabilidade.service.ts` (`montarLinhasBalancete:860`, `calcularLinhasDRE:1014`,
  `gerarDRE:1083`, `saldoContabilAte:1177`, `fecharPeriodo:1621`), `prisma/seed/data/plano-contas-pgc.json`.
