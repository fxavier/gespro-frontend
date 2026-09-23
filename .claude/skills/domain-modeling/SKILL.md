---
name: domain-modeling
description: Fixar o vocabulario de um dominio antes de escrever codigo - termos, o que cada um NAO e, e onde vive cada conceito. Usar ao abrir um spec novo, ao dar nome a modelos Prisma ou servicos, ou quando duas partes do codigo usam a mesma palavra para coisas diferentes.
---

# Modelação de domínio — GestPro

> Adaptado dos padrões de [mattpocock/skills](https://github.com/mattpocock/skills).

## Porquê antes do código

Um termo ambíguo não produz um erro de compilação: produz duas implementações plausíveis que
discordam em silêncio. Este repositório já tem três coisas diferentes chamadas `saldoAtual` — uma
coluna morta em `ContaBancaria`, um campo calculado no balancete e uma variável do seed de
inventário. Nenhuma delas dá erro; todas dão respostas diferentes à pergunta «qual é o saldo».

## Como se fixa um termo

Para cada conceito, três colunas. A terceira é a que faz o trabalho:

| Termo | É | **Não é** |
|---|---|---|
| Tesouraria | Caixa + saldo contabilístico das contas bancárias | Contas a receber |
| Compromisso | Obrigação ou direito datado, por liquidar | Um lançamento |
| Bucket | Intervalo com entradas, saídas e saldo | Um período contabilístico |

A coluna «não é» apanha a confusão que a definição positiva deixa passar. «Tesouraria é o dinheiro
disponível» soa completo e admite contas a receber — que é exactamente o erro que torna uma
projecção optimista.

## Regras

**Uma palavra, um conceito, em todo o repositório.** Se o mesmo termo significa duas coisas em
contextos diferentes, ou se qualifica (`saldoCaixa` vs `saldoTesouraria`) ou se renomeia um deles.

**O termo do negócio ganha ao termo técnico.** `RubricaFluxoCaixa`, não `CashflowCategory`. O
utilizador é moçambicano, o revisor oficial de contas é moçambicano, e a UI é toda em pt-PT: um
modelo em inglês obriga a uma tradução mental em cada leitura, e é onde os erros de classificação
entram.

**Escreve a tabela no `design.md` antes das assinaturas.** Um spec cujo vocabulário está fixado
produz assinaturas que se lêem sozinhas.

**Um termo que precisa de parágrafo para ser definido está mal recortado.** Parte-o em dois.

## Onde vive

Vocabulário de um domínio → `design.md` §1 do spec respectivo. Convenções duradouras de um domínio →
uma skill em `.claude/skills/`. Regras que já causaram defeitos reais → `CLAUDE.md` §Regras
invioláveis, sempre com a consequência observada, não só a regra.
