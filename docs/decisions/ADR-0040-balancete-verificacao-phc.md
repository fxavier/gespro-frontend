# ADR-0040 — Balancete de verificação no modelo PHC: período, acumulado e abertura implícita

- **Estado**: Proposto
- **Data**: 2026-10-01
- **Contexto**: O balancete (`/contabilidade/balancete`) é aritmeticamente correcto mas não tem o formato que os TOC usam (PHC CS Contabilidade)
- **Depende de**: [ADR-0033](./ADR-0033-exercicio-contabilistico.md) (exercício e períodos), [ADR-0018](./ADR-0018-desempenho-capacidade.md) §6 D3 (agregação em SQL)
- **Relacionados**: [ADR-0035](./ADR-0035-encerramento-exercicio.md) (encerramento e abertura — ainda Proposto), [ADR-0037](./ADR-0037-demonstracao-fluxos-caixa.md) (a DFC consome o balancete de movimento)

## Contexto

O balancete actual lista só contas folha, com uma coluna de saldo com sinal orientado pela natureza da
conta, saldo anterior calculado sobre **todo o histórico** e período escolhido por datas livres. Um
contabilista moçambicano espera o modelo do PHC: movimento do período, acumulado do exercício e saldo
repartido em devedor/credor, com a hierarquia do PGC-NIRF e escolha por exercício e período.

A dificuldade está no **acumulado**. No modelo PHC ele começa no início do exercício e inclui a
abertura. O GestPro ainda não gera abertura: o diário `AB` existe em todos os tenants mas nunca foi
escrito, e o ADR-0035, que o cria, está `Proposto`. Num tenant com mais de um exercício, um acumulado
«só do exercício» mostraria as contas de balanço sem os saldos transitados; um acumulado «desde sempre»
somaria às classes 6/7 os resultados de anos nunca encerrados e duplicaria a abertura quando o
ADR-0035 existir.

## Decisão

### 1. Uma função própria; a DFC não muda

O balancete PHC é uma função nova do serviço de contabilidade. `gerarBalancete` (movimento por datas,
saldo com sinal, só folhas) fica intacta, porque a DFC (ADR-0037) e a projecção dependem exactamente
desse contrato.

### 2. Período por exercício, não por datas

Escolhe-se **exercício + período inicial + período final** (`PeriodoContabil.ordem`, 1..12, e 13 se
pedido). O movimento selecciona-se pelo **período do lançamento**, não pela data — o período 13 tem a
mesma data do 12 e só assim se distingue. O modo por datas livres sai do balancete (o razão geral
continua com datas).

### 3. Colunas

- **Movimento do período** — Σ débitos e Σ créditos dos lançamentos dos períodos `[inicial..final]`.
- **Acumulado** — Σ débitos e Σ créditos dos períodos `[1..final]` do exercício, **mais a abertura**.
- **Saldo** — `acumulado D − acumulado C`, mostrado como **Devedor** se positivo, **Credor** se
  negativo. Nunca há valores negativos. A natureza da conta deixa de decidir o sinal; serve só para
  assinalar saldos **contra natureza** (aviso visual, não erro).

### 4. Abertura implícita

Enquanto o exercício **não tiver lançamentos no diário `AB`**, a abertura é calculada, não lida:

- classes 1–5 e 8: o saldo líquido de cada conta antes de `dataInicio` do exercício entra no acumulado
  como débito (se devedor) ou crédito (se credor) — como o lançamento de abertura do ADR-0035 faria;
- classes 6 e 7: o saldo líquido anterior **não** entra conta a conta; a soma entra numa linha
  sintética da classe 8, **«Resultados de exercícios anteriores por encerrar»**, sem conta, marcada
  como implícita, com um aviso de que há exercícios anteriores por encerrar.

Assim as três igualdades fecham em qualquer tenant. Quando o ADR-0035 gerar o lançamento `AB`, a
abertura implícita desliga-se sozinha (o `AB` já está nos períodos do exercício). Nada é escrito na
base.

### 5. Hierarquia e totais

As contas-mãe obtêm-se por **roll-up de débitos e créditos** das folhas via `contaMaeId` (não por
prefixo de código, e não somando saldos com sinal — mãe e filha podem ter naturezas diferentes). Os
totais e as três igualdades — `ΣmovD = ΣmovC`, `ΣacumD = ΣacumC`, `ΣsaldoDevedor = ΣsaldoCredor` —
calculam-se **só sobre folhas** (e a linha sintética), para não contar duas vezes. Filtros de
apresentação (pesquisa, intervalo de contas, nível, «só com saldo») não alteram os totais.

### 6. Desempenho

Agregação em SQL (ADR-0018 D3): `groupBy` por conta e tipo para o movimento, para o acumulado e para a
abertura. O roll-up é em memória sobre as contas (centenas), nunca sobre partidas.

### 7. Razão geral por períodos e com saldo anterior (#297)

O razão geral aceita dois modos, e o drill-down do balancete usa o segundo:

- **Por datas** (`dataInicio`/`dataFim`, como até aqui): movimento = lançamentos com data no intervalo;
  **saldo anterior** = todos os lançamentos com data anterior a `dataInicio`.
- **Por períodos** (`exercicio` + `de`/`ate` + `p13`, as mesmas regras de normalização do balancete):
  movimento = lançamentos dos períodos `[de..ate]` do exercício, pelo **período** do lançamento;
  **saldo anterior** = períodos `[1..de−1]` do exercício **mais**, só nas classes 1–5 e 8 e só enquanto o
  exercício não tiver lançamentos no diário `AB`, os lançamentos anteriores a `dataInicio` do exercício
  (a abertura implícita do §4). Nas classes 6 e 7 o anterior ao exercício não entra — está na linha
  sintética do balancete, não na conta.

Ambos filtram por `FILTRO_LANCAMENTO_MAPA` e assinam o saldo pela natureza da conta (como o razão sempre
fez). Invariante: no modo por períodos, o saldo final do razão de uma folha é o «Saldo» dessa conta no
balancete do mesmo intervalo (Devedor − Credor, com o sinal da natureza), e o movimento é o «Movimento do
período».

## Alternativas consideradas

| Alternativa | Porque não |
|---|---|
| Acumulado só do exercício, sem abertura | Contas de balanço sem saldos transitados em qualquer tenant com mais de um exercício, até o ADR-0035 existir |
| Acumulado desde sempre (semântica actual) | Classes 6/7 acumulam anos nunca encerrados; duplica a abertura quando o `AB` existir |
| Atribuir o resultado anterior à conta `59` | Mostra saldo numa conta real que ninguém lançou (e que hoje nem é folha) |
| Deixar o acumulado desequilibrar | O indicador de equilíbrio passaria a falhar em todos os tenants com histórico, e deixaria de detectar erros verdadeiros |
| Estender `gerarBalancete` | Arrisca o contrato da DFC (golden e duplo de leitura protegidos) por um ganho nulo |

## Consequências

- O balancete deixa de aceitar datas livres; ligações existentes com `dataInicio`/`dataFim` caem no
  exercício corrente.
- Enquanto a #138 (período 13) não entrar, a opção «incluir período 13» não muda os números.
- O drill-down para o razão passa o intervalo de **períodos** (§7, #297); até à #297 convertia-o em datas, e o
  período 13, que partilha a data de 31/12, misturava-se com o 12.
- Quando o ADR-0035 for implementado, esta abertura implícita é o comportamento de transição; o teste
  que fixa «com `AB` não há abertura implícita» é o que garante que não duplica.
