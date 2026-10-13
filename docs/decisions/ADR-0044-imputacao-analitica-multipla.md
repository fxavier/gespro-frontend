# ADR-0044 — Imputação analítica múltipla das partidas

- **Estado**: Proposto
- **Data**: 2026-10-12
- **Contexto**: Spec 24 (Contabilidade Orçamental) · Épico WS-2
- **Depende de**: [ADR-0043](./ADR-0043-dominio-orcamental-financiamentos.md), [ADR-0033](./ADR-0033-exercicio-contabilistico.md) (`gate-periodo`, imutabilidade do lançado)
- **Relacionados**: [ADR-0045](./ADR-0045-ciclo-despesa-controlo-disponibilidade.md) (a execução lê as imputações), [ADR-0040](./ADR-0040-balancete-verificacao-phc.md)
- **Skills**: `engineering:architecture`, `prisma-conventions`, `tdd`

## Contexto

A única dimensão analítica do razão é `PartidaLancamento.centroCustoId`: **uma** por partida, sem
percentagem. A contabilidade analítica pedida precisa de separar o custo por programa, projecto,
actividade, financiamento e centro de custo. E o alinhamento de 2026-10-12 confirmou que **uma mesma
despesa se reparte** por vários financiamentos e actividades. O caso que obriga a isso é a folha de
salários: um técnico a 60 % no financiamento A e a 40 % no B.

Os leitores actuais de `centroCustoId` são a DRE por centro de custo (`contabilidade.service.ts`, filtro
`centroCustoId`), o `criarLancamento` e o `registarLancamentoContabilistico`. Compras guarda
`centroCustoId` no cabeçalho de requisição, pedido e conta a pagar.

## Decisão

### 1. Tabela `ImputacaoPartida` (N por partida), em `financas.prisma`

```
ImputacaoPartida {
  id, tenantId, partidaId (@relation PartidaLancamento),
  financiamentoId?, actividadeId?, rubricaId?, linhaControloId?,   // escalares → orcamental
  projetoId?, programaId?, centroCustoId?,
  percentagem Decimal(9,6), valor Decimal(18,2), createdAt
}
@@index([tenantId, financiamentoId]) @@index([tenantId, projetoId]) @@index([tenantId, centroCustoId])
@@index([tenantId, partidaId])
```

Fica em `financas.prisma`, junto da partida, porque é parte do lançamento: nasce e morre com ele. As
dimensões orçamentais são FKs escalares para o domínio `orcamental`.

**Invariante `A1`**: Σ `percentagem` = 1,000000 exacto (fracção, mostrada como 100 %); Σ `valor` = `partida.valor` ao cêntimo.
Os valores calculam-se pelo **método do maior resto**, com desempate determinístico por ordem de
entrada. A função pura `repartir(valor, percentagens[])` vive em `src/lib/` e é testada por
propriedade.

**`rubricaId` e `linhaControloId` não vêm do cliente.** São resolvidos por
`orcamentalService.resolverLinha(tx, financiamentoId, actividadeId, contaId, data)` a partir do
mapeamento vigente (ADR-0043 §2). A linha de controlo depende da actividade quando o
`nivelControlo` é `ACTIVIDADE_RUBRICA`. Deixar o utilizador escolher a rubrica produziria a mesma conta em rubricas diferentes
consoante quem lançou, e um relatório ao doador que ninguém consegue defender.

### 2. Um só escritor

`ImputacaoPartida` é escrita **apenas** por `criarLancamento` / `registarLancamentoContabilistico`,
na transacção do lançamento. Enquanto o lançamento é `RASCUNHO`, as imputações editam-se com ele e
não geram movimentos orçamentais (ADR-0045 §3). O `gate-periodo` passa a incluir `imputacaoPartida` na lista de modelos
proibidos fora do `contabilidade.service.ts`. As imputações seguem a imutabilidade do lançamento:
um `LANCADO` não se corrige, estorna-se, e o estorno gera imputações simétricas (mesmas dimensões,
valor por partida espelhada).

No input do lançamento, cada partida passa a aceitar `imputacoes?: { financiamentoId?, actividadeId?,
projetoId?, centroCustoId?, percentagem }[]` **ou** `chaveReparticaoId`. Nunca as duas.

### 3. Migração do `centroCustoId`

1. Migração de dados: cada partida com `centroCustoId` ganha uma `ImputacaoPartida` a 100 % com esse
   centro de custo.
2. Todos os leitores (DRE por centro de custo incluída) passam a ler `ImputacaoPartida`. Um teste
   compara a DRE por centro de custo antes e depois da migração, sobre o seed, ao cêntimo.
3. `PartidaLancamento.centroCustoId` deixa de ser escrito. A coluna fica um ciclo de releases para
   permitir rollback e depois é removida noutra PR.

**Alternativa rejeitada — colunas na partida (`financiamentoId`, `actividadeId`…).** Não reparte.
O utilizador seria obrigado a partir a linha em N partidas para repartir um salário, o que multiplica
partidas no razão e torna a folha de pagamentos ilegível. Também obriga a mexer na partida sempre que
nasce uma dimensão nova.

**Alternativa rejeitada — `Json` com a repartição.** Não se indexa nem se agrega em SQL com
garantias de tipo, e falha a invariante `A2` silenciosamente.

**Alternativa rejeitada — imputação fora do lançamento (tabela paralela no domínio orçamental, escrita
depois).** Abre uma janela em que o razão tem a despesa e o orçamental não, e o `C1` (ADR-0045) passa
a depender de um processo assíncrono. A ligação à contabilidade geral é o requisito central: tem de
ser transaccional.

### 4. Imputação nos documentos de origem

`ImputacaoDocumento` (em `orcamental.prisma`), com `documentoTipo`, `documentoId` e
`documentoLinhaId?`, guarda a imputação **prevista** em itens de requisição, pedido, conta a pagar e
adiantamento. Quando o documento lança, as suas imputações são passadas ao lançamento. A cópia é
deliberada: o documento pode ser editado enquanto está em rascunho, e o lançamento é imutável.

### 5. Chaves de repartição

`ChaveReparticao` (nome, linhas com percentagem, `desde`/`ate`) e `ChaveReparticaoPessoal`
(colaborador, linhas, vigência). Uma alteração fecha a vigência anterior e abre uma nova; nunca há
`UPDATE` sobre linhas com vigência iniciada. O payroll resolve a chave pelo mês de referência.

### 6. Obrigatoriedade

`ContaPGC.exigeImputacao Boolean @default(false)`. A migração liga-a nas contas de gasto (classe 6)
dos tenants com o módulo activo. Quando o tenant activa o módulo, o bootstrap liga-a nas contas
existentes. Sem o módulo, nada muda: a imputação continua opcional.

## Consequências

**Positivas**
- Os mapas analíticos (por projecto, actividade, financiamento, programa e centro de custo) são uma
  agregação SQL sobre uma tabela, com `FILTRO_LANCAMENTO_MAPA`.
- A execução orçamental e o razão partilham **o mesmo facto**, escrito na mesma transacção.
- O centro de custo ganha repartição sem custo adicional.

**Negativas**
- Mais uma tabela no caminho quente do lançamento. Um lançamento de folha com 200 colaboradores × 3
  imputações dá 600 linhas, inseridas com `createMany`. É uma excepção explícita à regra das escritas singulares, válida porque
  a tabela é append-only e o trilho é o próprio lançamento (ADR-0048 §4).
- A migração do `centroCustoId` toca na DRE, que tem testes golden.

**Riscos**
- **Arredondamento**: uma implementação ingénua (`valor × pct` arredondado por linha) falha o `A1`
  num caso em cada centena. A mitigação é uma função única, `repartir`, com property test sobre
  valores e percentagens aleatórios.
- **Estorno parcial**: este ADR assume que o estorno inverte o lançamento inteiro. Isso tem de ser
  confirmado no `contabilidade.service` antes de `Aceite`. Se houver estorno parcial, as imputações
  do estorno passam a usar o `repartir` sobre o valor estornado, e não a cópia simétrica.
