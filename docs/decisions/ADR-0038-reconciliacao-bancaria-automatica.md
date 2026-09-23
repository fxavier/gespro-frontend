# ADR-0038 — Reconciliação bancária automática

- **Estado**: Proposto
- **Data**: 2026-09-23
- **Contexto**: [RF-XXX (Reconciliação Bancária Automática)](../../.kiro/specs/23-reconciliacao-bancaria-automatica/requirements.md) · substitui o modelo da Spec 04
- **Depende de**: [ADR-0033](./ADR-0033-exercicio-contabilistico.md) (dia fiscal `Africa/Maputo`, lançamentos `LANCADO`), [ADR-0015](./ADR-0015-auditoria-documentos-financeiros.md) (trilho de auditoria), [ADR-0011](./ADR-0011-fronteira-autorizacao.md) (permissões)
- **Relacionados**: [ADR-0018](./ADR-0018-desempenho-capacidade.md) (orçamento de latência), [ADR-0036](./ADR-0036-projecao-tesouraria.md) (a projecção consome o saldo reconciliado)
- **Skills**: `engineering:architecture`, `prisma-conventions`, `domain-modeling`, `tdd`

## Contexto

O módulo actual (`/contabilidade/reconciliacao`, Spec 04) faz matching assistido: gera itens do razão,
importa extracto em CSV, sugere pares por valor e data, e o utilizador aplica-os um a um. Contra a
RF-XXX cumpre um critério de aceitação em oito. Quatro factos verificados no código explicam porquê, e
são eles que condicionam a decisão.

**1. Os movimentos não existem fora de uma reconciliação.**
`ItemReconciliacaoBancaria.reconciliacaoId` é NOT NULL (`financas.prisma:599-626`) e
`gerarItensRazaoNoTx` projecta as partidas com `lancamento.data BETWEEN rec.dataInicio AND rec.dataFim`
(`contabilidade.service.ts:1211-1260`). Um pagamento lançado a 28/09 que o banco só apresenta a 02/10
**nunca** é reconciliado: a reconciliação de Outubro não gera o item de Setembro, e a de Setembro já
fechou. É exactamente o cenário do §8 e do CA04 da RF — e não é um defeito de implementação, é o
modelo a dizer que não.

**2. O estado de um movimento é um booleano.** `conciliado Boolean` não distingue «ainda não
procurado», «em trânsito dentro da tolerância», «o banco tem e a contabilidade não», «os valores
diferem em 500 MT» e «ignorado pelo utilizador». A RF §12 exige nove estados porque são nove decisões
operacionais diferentes.

**3. Não existe entidade de correspondência.** O par vive em `itemParId String?`, um escalar 1:1. Não
suporta N:M (§15), não tem onde guardar a regra que produziu o match, a confiança, a justificação nem
o autor (§18) — e não impede a dupla reconciliação: `marcarItemReconciliado` não verifica
`par.conciliado` antes de sobrescrever `par.itemParId` (`contabilidade.service.ts:1428-1442`), pelo que
dois itens do razão podem apontar para o mesmo item de extracto, corrompendo a diferença em silêncio.

**4. O motor ignora a referência e é O(N×M).** `sugerirMatchesPuro` carrega todos os itens não
conciliados para memória e faz produto cartesiano, casando por `valor` + `natureza` + janela de datas
(`reconciliacao.helpers.ts:113-148`). A RF §6 coloca a referência como prioridade 1 e a §19 proíbe
explicitamente o produto cartesiano. Numa conta com rendas ou salários recorrentes do mesmo montante,
casar por valor sem referência é uma máquina de falsos positivos.

O que está correcto e se aproveita: o invariante de balanceamento com sinal por natureza
(`sinalItem`), a idempotência da importação, o isolamento multi-tenant e `saldoContabilAte`.

## Decisão

### 1. Os movimentos passam a ser entidades de primeira classe, por conta bancária

`MovimentoBancario` e `MovimentoContabilistico` vivem ligados a `ContaBancaria`, não a uma
reconciliação, e têm `estado` próprio e persistente. `PeriodoReconciliacao` deixa de ser dono dos
movimentos e passa a ser uma **vista fechada** sobre eles.

É esta inversão — e só ela — que torna o §8 implementável: um movimento `EM_TRANSITO` sobrevive ao
fecho do período e continua a ser procurado em cada extracto que entrar, até casar ou até a tolerância
expirar.

### 2. A dupla reconciliação é impedida pelo modelo, não por código

Cada movimento tem `correspondenciaAtivaId String?`. Sendo uma coluna escalar, é estruturalmente
impossível um movimento pertencer a duas correspondências activas — a RF §14 passa a ser uma
propriedade do esquema em vez de uma verificação que alguém se pode esquecer de escrever. Reverter põe
a coluna a NULL; as linhas de correspondência ficam, porque são o trilho.

A alternativa considerada era um índice único parcial (`WHERE revertida = false`) sobre a tabela de
ligação. Foi rejeitada: o Prisma não exprime índices parciais no esquema, o que obrigaria a SQL à mão
numa migração e a `migrate diff` a ver deriva para sempre.

### 3. A correspondência é uma entidade N:M com duas tabelas de ligação

`CorrespondenciaBancaria` guarda tipo, regra, confiança, valores dos dois lados, diferença de valor,
diferença de dias, justificação, autor e reversão. Os lados vivem em `LinhaCorrespondenciaBanco` e
`LinhaCorrespondenciaContabilidade` — **duas tabelas, não uma linha polimórfica com dois FK anuláveis**,
para que «linha sem lado» seja irrepresentável e para que cada lado tenha o seu `@@unique` real. Isto
dá 1:N, N:1 e N:M (§15) sem alterações futuras de esquema.

A agregação (§15) fica **desligada por omissão** (`permitirAgregacao`) e com tecto de cardinalidade
(`maxMovimentosAgregacao`, por omissão 5): a soma de subconjuntos é NP-difícil no caso geral e, sem
tecto, é um vector de negação de serviço no motor.

### 4. As três datas são colunas distintas

`MovimentoContabilistico.dataContabilistica`, `MovimentoBancario.dataMovimento` e
`MovimentoBancario.dataValor` (anulável). Nenhuma regra do motor exige igualdade entre elas — a §22 é
a regra de negócio principal e fica codificada em `classificarSemCorrespondencia`, com um property
test que fixa que **nenhuma diferença de datas, por si só, produz `DIVERGENCIA`**.

### 5. A procura é por índice, nunca por produto cartesiano

Cada movimento carrega `referenciaNormalizada` — a referência sem acentos, sem pontuação e em
maiúsculas, derivada e nunca introduzida à mão. Os dois lados ganham dois índices de procura:

```
@@index([tenantId, contaBancariaId, estado, natureza, valor, dataMovimento])  // blocking key
@@index([tenantId, contaBancariaId, referenciaNormalizada])                    // prioridades 1–2 da §6
```

O motor (nó MATCHING) passa a ser um pipeline de passagens que recupera candidatos por estes índices:
`REFERENCIA_EXACTA` → `REFERENCIA_NORMALIZADA` → `DOCUMENTO` → `VALOR_NATUREZA_DATA` →
`VALOR_TOLERANCIA` → `DESCRICAO`. A ordem de declaração do enum `RegraCorrespondencia` **é** a ordem
de prioridade da §6.

### 6. A configuração é por conta bancária

As tolerâncias e interruptores da §11 são colunas de `ContaBancaria`, não uma tabela de configuração:
é por conta que os bancos diferem em pontualidade e em qualidade de referência, a cardinalidade é
baixa e o motor lê-as em todas as corridas. Acrescentam-se `limiarConfianca`, `permitirAgregacao` e
`maxMovimentosAgregacao` aos campos que a RF nomeia.

`autoReconciliacao` é **falso por omissão**. Um motor que confirma sozinho numa conta cuja qualidade
de referência ainda não foi observada produz correspondências erradas que alguém terá de desfazer uma
a uma — e a reversão custa mais do que a confirmação manual teria custado.

### 7. Idempotência em duas camadas

Ao nível do ficheiro, `ImportacaoExtracto` tem `@@unique([tenantId, contaBancariaId, hashFicheiro])`.
Ao nível da linha, `MovimentoBancario.chaveIdempotencia` é determinística: quando o banco fornece
referência, ela domina; caso contrário é o tuplo (data, valor, natureza, descrição normalizada) **mais
um ordinal dentro do tuplo**. O ordinal não é decorativo: sem ele, duas comissões iguais no mesmo dia
colapsariam numa só e a importação perderia dinheiro sem erro nenhum.

### 8. Reconciliar é reversível, e a reversão é auditada

Nenhum estado de movimento é terminal: `RECONCILIADO` volta a `PENDENTE` quando a correspondência é
revertida. A RF §19 exige que nada mude em silêncio — o caminho é reverter (criando registo) e
corresponder de novo, nunca editar a correspondência existente. `CorrespondenciaBancaria` é
append-only, com `revertida`/`revertidaPorId`/`revertidaEm`.

## Saldo reconciliado (§16) — e uma correcção à RF

A aritmética implementada parte do saldo do banco e caminha até ao saldo contabilístico:

```
saldoReconciliado = saldoFinalBanco
                  − Σ sinal·valor  (bancários não contabilizados)
                  + Σ sinal·valor  (contabilísticos não reflectidos: EM_TRANSITO ∪ CONTABILIDADE_SEM_BANCO)
```

com `sinal(DEBITO) = +1` e `sinal(CREDITO) = −1` na perspectiva da empresa. Os movimentos
correspondidos não entram: contribuem igualmente para os dois saldos e cancelam-se. Daí a propriedade
que o property test fixa — com tudo explicado, `saldoReconciliado == saldoFinalContabil` e a diferença
residual é exactamente zero.

**O exemplo numérico da RF §16 tem um sinal trocado.** Somar 20.000 MT de «recebimentos não
contabilizados» ao saldo do banco duplica um valor que já está dentro desse saldo: se o banco já
creditou, o saldo bancário já o contém, e é o saldo contabilístico que está em falta — logo subtrai-se
para chegar a ele. A conta fecha se os 20.000 MT forem uma **saída** bancária por contabilizar (uma
comissão, por exemplo), não um recebimento. A implementação segue a direcção aritmeticamente correcta;
fica registado aqui para o exemplo da RF ser corrigido antes de servir de teste de aceitação.

## Migração

**Substituição directa, com o corte no fim.** Não há backfill nem dupla escrita: os dados de
reconciliação existentes são de demonstração e não sobrevivem ao corte.

O nó MODEL é **puramente aditivo** — as tabelas novas entram, `ReconciliacaoBancaria` e
`ItemReconciliacaoBancaria` ficam marcadas como depreciadas no esquema mas intactas, para que a árvore
continue verde enquanto o serviço antigo (2052 linhas em `contabilidade.service.ts`) ainda as usa. O
`DROP` das duas tabelas, das suas rotas e do `matching-board` acontece numa única migração no nó
RECONCILIATION, quando o substituto estiver a funcionar. Substituir sem passar por um estado
intermédio verde seria trocar um módulo que funciona mal por nenhum módulo.

Migrações são geradas pelo orquestrador (CLAUDE.md §Migrations), com `migrate diff` não-interactivo.

## Consequências

**Positivas.** O `EM_TRANSITO` sobrevive a períodos, que é o que a RF pede e o que o utilizador
espera. A dupla reconciliação torna-se irrepresentável. O motor passa a ter um plano de execução
legível (índice → candidatos → regra) em vez de um varrimento. A configuração por conta deixa o
sistema afinável sem alterações de código. O saldo reconciliado passa a ter uma propriedade
demonstrável em vez de um número agregado.

**Negativas.** Sete modelos novos e um domínio novo (`src/server/services/reconciliacao/`) contra dois
modelos e um serviço partilhado. `MovimentoContabilistico` é uma projecção materializada de
`PartidaLancamento`, portanto há um trabalho de sincronização que não existia — mitigado pelo
`@@unique([tenantId, partidaId])`, que torna a projecção idempotente e concorrente-segura. E existe
uma janela em que os dois modelos coexistem no esquema.

**Riscos.** (a) `correspondenciaAtivaId` é FK escalar sem integridade referencial ao nível da base —
aceitável porque as correspondências são append-only e nunca apagadas, mas exige disciplina no
serviço. (b) A projecção contabilística pode divergir do razão se um lançamento for estornado; o
estorno gera um lançamento novo e, portanto, um movimento novo — a decisão é **não** apagar o
movimento do lançamento estornado, e deixar os dois visíveis. (c) A confiança do motor é um número
inventado até haver dados reais: `limiarConfianca` por omissão em 90 é uma hipótese, não uma medição.

## Plano de execução (grafo de dependências)

```
        Model ──┬── Matching ──┐
                ├── Import ────┼── Reconciliation ── UI
                └──────────────┘
```

| Nó | Entrega | Depende de |
|---|---|---|
| **Model** | este ADR, `reconciliacao.prisma`, configuração na `ContaBancaria`, máquinas de estado, núcleo de domínio puro e os seus property tests | — |
| **Matching** | motor em passagens com recuperação indexada, classificação de estados, confirmação automática por limiar | Model |
| **Import** | `ParserExtrato` (CSV, XLSX), hash de ficheiro, chave de idempotência, projecção do razão | Model |
| **Reconciliation** | período, mapa de fecho §17, auditoria via `audit-extension`, `DROP` do modelo antigo | Matching, Import |
| **UI** | workspace por estado (lista de excepções), confirmação de sugestões, reconciliação manual com justificação obrigatória | Reconciliation |

## Questões em aberto

1. O sinal do exemplo da §16 (ver acima) — confirmar antes de virar teste de aceitação.
2. Reabertura de um `PeriodoReconciliacao` fechado: por agora é terminal, como no ADR-0033 antes da
   `ReaberturaPeriodo`. Se o negócio exigir, segue o mesmo padrão.
3. Criação automática do lançamento para `BANCO_SEM_CONTABILIZACAO` (§9): o modelo suporta, a regra de
   mapeamento descrição → conta PGC fica para o nó Reconciliation.
4. MT940/CAMT.053: a arquitectura abre caminho (`OrigemExtracto`, `ParserExtrato`), mas nenhum banco
   moçambicano foi ainda verificado como fornecedor destes formatos.
