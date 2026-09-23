# RF-XXX — Reconciliação Bancária Automática

## 1. Objetivo

O sistema deve permitir a realização da **reconciliação bancária automática e assistida**, confrontando os movimentos registados na contabilidade/tesouraria da empresa com os movimentos constantes dos extractos bancários.

A reconciliação deve considerar que existe uma diferença temporal entre a data em que uma operação é registada contabilisticamente e a data em que essa operação é efetivamente processada ou refletida na conta bancária.

O sistema não deve considerar automaticamente uma diferença de datas como uma divergência contabilística.

---

## 2. Âmbito

A funcionalidade deve permitir:

* Importar movimentos bancários;
* Registar e consultar contas bancárias da empresa;
* Comparar movimentos bancários com movimentos contabilísticos/financeiros;
* Identificar automaticamente correspondências;
* Considerar diferenças temporais entre contabilidade e banco;
* Identificar movimentos em trânsito;
* Identificar movimentos existentes no banco mas não registados na contabilidade;
* Identificar movimentos contabilísticos ainda não refletidos no banco;
* Identificar diferenças de valor;
* Permitir reconciliação manual;
* Permitir confirmação das correspondências sugeridas;
* Manter histórico e auditoria das reconciliações;
* Produzir um saldo bancário reconciliado.

---

# 3. Conceitos

## 3.1 Movimento contabilístico

Representa uma operação registada no sistema contabilístico.

Exemplo:

```text
Data contabilística: 10/09/2026
Documento: TRF-458
Valor: 100.000 MT
Natureza: Crédito/Débito
Conta: Banco BCI
```

## 3.2 Movimento bancário

Representa uma operação efetivamente apresentada pelo banco no extracto bancário.

Exemplo:

```text
Data bancária: 12/09/2026
Referência: TRF-458
Valor: 100.000 MT
Natureza: Débito
```

## 3.3 Movimento em trânsito

É um movimento que já foi registado contabilisticamente, mas ainda não foi identificado no extracto bancário.

Exemplo:

```text
Contabilidade:
10/09/2026 → -100.000 MT

Banco:
10/09/2026 → inexistente
11/09/2026 → inexistente
12/09/2026 → -100.000 MT
```

Neste caso, o sistema deve classificar o movimento como:

```text
EM_TRANSITO
```

e não como erro contabilístico.

---

# 4. Requisito — Importação de extracto bancário

O sistema deve permitir importar movimentos bancários através de ficheiros disponibilizados pelo banco.

Na primeira versão devem ser suportados, quando disponíveis:

* CSV;
* Excel;
* outros formatos configuráveis.

A arquitetura deve permitir posteriormente suportar formatos bancários estruturados, como MT940/CAMT.053 ou integração direta com instituições financeiras.

Cada movimento importado deve possuir, no mínimo:

```text
id
contaBancaria
dataMovimento
dataValor
referencia
descricao
valor
natureza
saldoAposMovimento
origem
```

---

# 5. Requisito — Separação das datas

O sistema deve distinguir obrigatoriamente:

```text
dataContabilistica
dataMovimentoBancario
dataValor
```

A `dataContabilistica` representa a data em que a operação foi reconhecida no sistema.

A `dataMovimentoBancario` representa a data em que o movimento aparece no extracto bancário.

A `dataValor` representa a data de valor disponibilizada pelo banco, quando existente.

O sistema não deve exigir igualdade entre estas datas para considerar dois movimentos potencialmente correspondentes.

---

# 6. Requisito — Motor de reconciliação

O sistema deve possuir um motor de reconciliação capaz de comparar automaticamente:

```text
Movimentos contabilísticos
        +
Movimentos bancários
        ↓
Motor de Reconciliação
        ↓
Correspondências
```

O motor deve utilizar, por ordem de prioridade configurável:

1. Referência da operação;
2. Número do documento;
3. Valor;
4. Natureza do movimento;
5. Conta bancária;
6. Data;
7. Descrição;
8. Outros identificadores disponíveis.

---

# 7. Regras de correspondência

## 7.1 Correspondência exata

Quando:

```text
valor = valor
natureza = natureza
referência = referência
data = data
```

o sistema deve classificar automaticamente como:

```text
RECONCILIADO
```

---

## 7.2 Correspondência com diferença temporal

Quando:

```text
valor = valor
natureza = natureza
referência = referência
```

mas:

```text
dataContabilistica != dataMovimentoBancario
```

o sistema deve verificar a tolerância de dias configurada.

Exemplo:

```text
Data contabilística: 10/09
Data bancária:       12/09
Diferença:            2 dias
```

Se a tolerância configurada for:

```text
5 dias
```

o sistema deve considerar os movimentos correspondentes.

Resultado:

```text
RECONCILIADO
matchType = DIFERENCA_TEMPORAL
```

---

# 8. Movimentos em trânsito

Quando existir um movimento contabilístico sem correspondente no extracto bancário, o sistema deve verificar se este se encontra dentro do período de tolerância configurado.

Exemplo:

```text
Contabilidade:
10/09 → -100.000 MT

Banco:
Sem movimento correspondente
```

Resultado:

```text
EM_TRANSITO
```

O sistema deve manter o movimento como pendente de reconciliação e continuar a procurá-lo em futuros extractos importados.

Quando o banco apresentar:

```text
12/09 → -100.000 MT
```

o sistema deve automaticamente associar os dois movimentos:

```text
Movimento contabilístico
        ↕
Movimento bancário
```

e alterar o estado para:

```text
RECONCILIADO
```

---

# 9. Movimento bancário sem lançamento contabilístico

Quando existir um movimento no banco para o qual não exista correspondente na contabilidade, o sistema deve classificá-lo como:

```text
BANCO_SEM_CONTABILIZACAO
```

Exemplo:

```text
Banco:
15/09 → -500 MT
Descrição: Comissão bancária
```

Sem lançamento contabilístico correspondente.

O sistema deve apresentar o movimento ao utilizador e, quando existirem regras configuradas, sugerir um lançamento contabilístico.

Exemplo:

```text
Débito:  Gastos bancários       500 MT
Crédito: Banco                  500 MT
```

A criação automática do lançamento deve depender das regras de autorização/configuração da empresa.

---

# 10. Diferenças de valor

Quando a operação possuir correspondência provável, mas apresentar valores diferentes, o sistema deve identificar a diferença.

Exemplo:

```text
Contabilidade: 100.000 MT
Banco:         100.500 MT
Diferença:         500 MT
```

Resultado:

```text
DIFERENCA_VALOR
```

O sistema não deve reconciliar automaticamente a operação caso a diferença ultrapasse a tolerância configurada.

---

# 11. Tolerância de reconciliação

Cada conta bancária deve permitir configurar:

```text
toleranciaDias
toleranciaValor
permitirMatchPorReferencia
permitirMatchPorValor
permitirMatchPorDescricao
autoReconciliacao
```

Exemplo:

```text
Conta: BCI 123456789

Tolerância temporal: 5 dias
Tolerância de valor: 0 MT
Match por referência: SIM
Auto-reconciliação: SIM
```

---

# 12. Estados da reconciliação

O sistema deve suportar, no mínimo:

```text
PENDENTE
RECONCILIADO
EM_TRANSITO
BANCO_SEM_CONTABILIZACAO
CONTABILIDADE_SEM_BANCO
DIFERENCA_VALOR
DIVERGENCIA
RECONCILIADO_MANUALMENTE
IGNORADO
```

---

# 13. Reconciliação manual

O utilizador autorizado deve poder selecionar:

```text
Movimento contabilístico
+
Movimento bancário
```

e confirmar manualmente a correspondência.

O sistema deve exigir uma justificação para reconciliações manuais.

Exemplo:

```text
Justificação:
"Transferência processada pelo banco dois dias após
o lançamento contabilístico."
```

A operação deve ficar registada no histórico de auditoria.

---

# 14. Prevenção de dupla reconciliação

Um movimento bancário não pode ser associado simultaneamente a mais de um movimento contabilístico, salvo quando a regra de reconciliação explicitamente permita correspondência de múltiplos movimentos.

O sistema deve impedir:

```text
Banco -100.000
       ↓
       ├── Contabilidade -100.000
       └── Contabilidade -100.000
```

quando tal gerar duplicação da reconciliação.

---

# 15. Reconciliação de múltiplos movimentos

O sistema deve permitir, quando configurado, correspondência:

```text
1 movimento bancário
        ↓
N movimentos contabilísticos
```

e:

```text
N movimentos bancários
        ↓
1 movimento contabilístico
```

Exemplo:

```text
Banco:
+100.000 MT

Contabilidade:
+60.000 MT
+40.000 MT
```

O sistema pode sugerir:

```text
60.000 + 40.000 = 100.000 MT
```

A correspondência deve ser confirmada automaticamente apenas quando todas as regras de segurança forem satisfeitas.

---

# 16. Saldo reconciliado

O sistema deve calcular:

```text
Saldo bancário
(-) movimentos contabilísticos em trânsito
(+/-) movimentos bancários ainda não contabilizados
(+/-) diferenças identificadas
=
Saldo bancário ajustado
```

O saldo ajustado deve poder ser comparado com:

```text
Saldo contabilístico
```

Exemplo:

```text
Saldo bancário                         1.000.000 MT
(-) Pagamentos em trânsito                50.000 MT
(+ ) Recebimentos não contabilizados      20.000 MT
                                      --------------
Saldo bancário ajustado                  970.000 MT

Saldo contabilístico                     970.000 MT
```

Resultado:

```text
RECONCILIAÇÃO OK
```

---

# 17. Fecho da reconciliação

O utilizador deve poder fechar uma reconciliação para determinado período:

```text
Conta bancária: BCI 123456789
Período: 01/09/2026 – 30/09/2026
```

O sistema deve apresentar:

```text
Saldo inicial
Total de movimentos bancários
Total de movimentos contabilísticos
Movimentos reconciliados
Movimentos em trânsito
Movimentos não contabilizados
Diferenças
Saldo bancário final
Saldo contabilístico final
Saldo reconciliado
```

O período só deve poder ser marcado como:

```text
RECONCILIADO
```

quando as diferenças estiverem dentro das regras/tolerâncias permitidas ou forem explicitamente justificadas pelo utilizador autorizado.

---

# 18. Auditoria

Todas as operações devem ser auditáveis.

O sistema deve registar:

```text
quem
quando
movimento bancário
movimento contabilístico
regra utilizada
resultado
valor da diferença
justificação
```

Exemplo:

```text
Utilizador: admin
Data: 30/09/2026 17:32
Tipo: Reconciliação manual
Banco: BANK-88932
Contabilidade: JE-100231
Justificação: Transferência processada posteriormente
```

Os registos de auditoria não devem ser eliminados através da interface normal da aplicação.

---

# 19. Requisitos não funcionais

## Performance

O motor deve conseguir processar grandes volumes de movimentos sem comparar todos os movimentos entre si.

Não deve ser implementado um algoritmo O(N × M) para cada reconciliação.

Devem ser utilizados índices/chaves de procura, por exemplo:

```text
account_id
amount
direction
reference
movement_date
```

para reduzir o universo de candidatos.

## Idempotência

A importação do mesmo extracto bancário duas vezes não deve criar movimentos duplicados.

O sistema deve possuir uma chave de idempotência baseada nos identificadores disponíveis do banco.

## Segurança

Apenas utilizadores com permissão de reconciliação devem poder:

* Executar reconciliação;
* Confirmar correspondências;
* Fazer reconciliação manual;
* Fechar períodos;
* Alterar regras de reconciliação.

## Auditabilidade

Nenhuma reconciliação confirmada deve ser alterada silenciosamente.

Alterações devem gerar novos registos de auditoria.

---

# 20. Critérios de aceitação

### CA01 — Match exacto

**Dado** um movimento contabilístico e um movimento bancário com o mesmo valor, natureza, referência e data,

**quando** o motor executar a reconciliação,

**então** os movimentos devem ser automaticamente reconciliados.

---

### CA02 — Diferença temporal

**Dado** um movimento contabilístico de 100.000 MT em 10/09 e um movimento bancário de 100.000 MT em 12/09,

**quando** a tolerância configurada for de 5 dias,

**então** o sistema deve reconciliar automaticamente os movimentos.

---

### CA03 — Movimento em trânsito

**Dado** um movimento contabilístico sem correspondente bancário,

**quando** este estiver dentro da tolerância temporal,

**então** deve ser classificado como `EM_TRANSITO`.

---

### CA04 — Posterior aparecimento no banco

**Dado** um movimento anteriormente classificado como `EM_TRANSITO`,

**quando** o correspondente movimento bancário for importado,

**então** o sistema deve associar os dois movimentos e alterar o estado para `RECONCILIADO`.

---

### CA05 — Movimento bancário não contabilizado

**Dado** um movimento existente no banco sem correspondente contabilístico,

**quando** a reconciliação for executada,

**então** o sistema deve classificá-lo como `BANCO_SEM_CONTABILIZACAO`.

---

### CA06 — Diferença de valor

**Dado** um movimento contabilístico de 100.000 MT e um movimento bancário de 100.500 MT,

**quando** a tolerância de valor for 0 MT,

**então** o sistema não deve reconciliar automaticamente os movimentos.

---

### CA07 — Reconciliação manual

**Dado** dois movimentos que não possam ser reconciliados automaticamente,

**quando** um utilizador autorizado confirmar manualmente a correspondência,

**então** o sistema deve criar a reconciliação e registar a justificação e o utilizador no histórico de auditoria.

---

### CA08 — Idempotência

**Dado** um extracto bancário já importado,

**quando** o mesmo extracto for importado novamente,

**então** o sistema não deve criar movimentos bancários duplicados.

---

# 21. Exemplo de fluxo completo

```text
1. Contabilista regista pagamento
             ↓
2. Lançamento contabilístico criado
             ↓
3. Pagamento ainda não aparece no banco
             ↓
4. Reconciliação identifica CONTABILIDADE_SEM_BANCO
             ↓
5. Sistema classifica como EM_TRANSITO
             ↓
6. Novo extracto bancário é importado
             ↓
7. Motor encontra referência + valor
             ↓
8. Movimento bancário associado
             ↓
9. Estado → RECONCILIADO
             ↓
10. Saldo reconciliado atualizado
             ↓
11. Operação registada no audit log
```

## 22. Regra de negócio principal

> **Uma diferença entre a data contabilística e a data em que o movimento aparece no banco não constitui, por si só, uma divergência. O sistema deve tratar essa situação como diferença temporal e permitir que o movimento seja reconciliado posteriormente, de acordo com as regras e tolerâncias configuradas.**

## 23. Resultado esperado

A funcionalidade deve permitir que o GestPro responda automaticamente a três perguntas:

```text
1. O que foi registado na contabilidade já apareceu no banco?

2. O que apareceu no banco já foi registado na contabilidade?

3. Se os saldos forem diferentes, qual é exatamente a
   razão da diferença?
```

O objetivo final é que o utilizador não tenha de comparar manualmente centenas ou milhares de linhas do extracto bancário, mas possa concentrar-se apenas nas **exceções que o motor não conseguiu reconciliar com segurança**.
