# ADR-0043 — Domínio orçamental: financiamentos e orçamento versionado

- **Estado**: Proposto
- **Data**: 2026-10-12
- **Contexto**: Spec 24 (Contabilidade Orçamental) · Épico WS-1
- **Depende de**: [ADR-0033](./ADR-0033-exercicio-contabilistico.md) (períodos), [ADR-0025](./ADR-0025-separacao-dominio-pessoas-projetos.md) (fronteira de Pessoas & Projectos), [ADR-0015](./ADR-0015-auditoria-documentos-financeiros.md) (auditoria)
- **Relacionados**: [ADR-0044](./ADR-0044-imputacao-analitica-multipla.md), [ADR-0045](./ADR-0045-ciclo-despesa-controlo-disponibilidade.md), [ADR-0046](./ADR-0046-fundos-cambio-fifo-tranche.md), [ADR-0047](./ADR-0047-reconhecimento-financiamentos.md), [ADR-0048](./ADR-0048-prestacao-contas-evidencia.md)
- **Skills**: `engineering:architecture`, `domain-modeling`, `prisma-conventions`, `api-conventions`

## Contexto

O GestPro não consegue responder a «quanto deste financiamento já gastei, em quê, e quanto me sobra».
Hoje há três peças soltas, e nenhuma responde:

1. `CentroCusto.orcamento` (`financas.prisma`) é um `Decimal?` sem leitor nem regra.
2. `OrcamentoProjeto` → `CategoriaOrcamento` → `ItemOrcamento` (`pessoas-projetos.prisma`) tem versão
   e estado, mas a execução é um **contador mutável** (`valorUtilizado`) que ninguém liga à
   contabilidade. É o anti-padrão que a casa já pagou com `ContaBancaria.saldoAtual`.
3. Não existe a noção de financiador nem de acordo. Um projecto financiado por dois doadores é
   indistinguível de um projecto com fundos próprios.

O alinhamento de 2026-10-12 fixou: os alvos são ONGs **e** empresas com o mesmo motor; o orçamento de
projecto actual é **substituído e migrado**; os relatórios usam um motor genérico com mapeamento.

## Decisão

### 1. Domínio novo `orcamental`, com schema próprio

`prisma/schema/orcamental.prisma`, serviços em `src/server/services/orcamental/`, actions em
`orcamental.actions.ts`. FKs para `Projeto`, `ContaPGC`, `CentroCusto`, `ContaBancaria`,
`Cliente` e `User` são **escalares** (regra da casa). O domínio publica funções de contrato e não
importa internals de outros domínios:

| Contrato publicado | Chamado por |
|---|---|
| `verificarEReservar(tx, pedido, ctx)` | compras, payroll, adiantamentos (ADR-0045) |
| `registarExecucaoEmTx(tx, imputacoes, lancamento, ctx)` | **só** `contabilidade.service` (ADR-0045 §3) |
| `resolverLinha(tx, financiamentoId, actividadeId, contaId, data)` → `{ rubricaId, linhaControloId }` | `contabilidade.service` (ADR-0044) |
| `disponibilidade(linhaControloId, data)` | UI de lançamento, compras |

A dependência é do `orcamental` para `financas`, e não o contrário. A excepção é o
`contabilidade.service`, que recebe o `orcamentalService` **injectado**, como o `faturacaoService`
já é injectado no POS (ADR-0041). Assim não há import circular.

**Alternativa rejeitada — estender `financas.prisma`.** O ficheiro já tem 1 200+ linhas e cinco
ADRs a escrever nele. O orçamento tem ciclo de vida, permissões e utilizadores próprios (gestor de
projecto, oficial de subvenções), e misturá-lo com o razão aumenta o raio de qualquer alteração.

**Alternativa rejeitada — estender `pessoas-projetos`.** Um financiamento cobre vários projectos e
um projecto tem vários financiamentos. Pendurar o orçamento no `Projeto` torna impossível o caso mais
comum nas ONGs, o co-financiamento.

### 2. Modelo

```
Financiador 1─N Financiamento N─M Projeto (FinanciamentoProjeto)
Financiamento 1─N RubricaFinanciador
Projeto 1─N Actividade                      (actividade é do projecto, reutilizável entre financiamentos)
Financiamento 1─N VersaoOrcamento 1─N LinhaOrcamento(actividade, rubrica, centroCusto?, mes, valor)
Financiamento 1─N LinhaControlo(actividade?, rubrica)   (grão da disponibilidade — ADR-0045)
Financiamento 1─N VersaoMapeamentoRubrica 1─N MapeamentoContaRubrica(contaId → rubricaId)
Programa 1─N Projeto                        (agrupador analítico; FK escalar opcional em Projeto)
```

- `Financiamento.moedaAcordo` (ISO 4217) e `montanteAprovado` (moeda do acordo). As **linhas de
  orçamento estão sempre na moeda do acordo**: é a moeda em que o financiador mede o cumprimento. O
  MZN é derivado (ADR-0046).
- `Financiamento.nivelControlo ∈ {ACTIVIDADE_RUBRICA, RUBRICA}`. Alguns acordos só controlam por
  rubrica. A `LinhaControlo` existe sempre e, com `RUBRICA`, tem `actividadeId = null`.
- `Financiamento.toleranciaRealocacao Decimal(9,6)` e `regraBloqueio ∈ {BLOQUEIA_COM_TOLERANCIA,
  ALERTA}`. Por omissão é `BLOQUEIA_COM_TOLERANCIA` (decisão de alinhamento). `ALERTA` fica
  disponível para financiamentos `PROPRIO` de empresas, onde o orçamento é de gestão.
- `Financiamento.ivaNaoDedutivelElegivel Boolean` decide se o IVA não dedutível conta como execução
  do financiamento (ADR-0045 §5).
- `RubricaFinanciador` **copia-se** de um `ModeloRubricas` do tenant. Não se referencia: um acordo
  assinado não muda quando o modelo muda.

### 3. Orçamento: versões completas, nunca deltas

Cada revisão é uma **cópia integral** das linhas, editada. Não é uma lista de diferenças.

- Responder a «qual era o orçamento revisto em Março» é ler uma versão, e não somar deltas por ordem.
- O relatório submetido referencia a versão com que foi gerado (ADR-0048), e essa versão é imutável.
- O custo em linhas é desprezável: um orçamento de ONG tem centenas de linhas, não milhões.

Estados: `RASCUNHO → SUBMETIDO → APROVADO | REJEITADO`. A versão `APROVADO` anterior passa a
`SUBSTITUIDO` na mesma transacção da aprovação seguinte, **antes** de a nova passar a `APROVADO`,
para que o índice único parcial nunca veja duas vigentes. Esta é a única escrita sobre uma versão
aprovada, e está protegida por `TRANSICOES_VERSAO_ORCAMENTO`. A unicidade da vigente faz-se por índice
único parcial (`WHERE estado = 'APROVADO'`) em SQL manual na migração, porque o Prisma não o exprime.

«Aprovado» = versão `INICIAL` aprovada. «Revisto» = versão vigente. As duas colunas do mapa de
execução lêem versões, e não campos.

**Alternativa rejeitada — linhas mutáveis com histórico pela auditoria.** O `AuditLog` diz que algo
mudou, mas não reconstrói o orçamento de uma data sem um replay frágil. E a regra `O2` («não reduzir
abaixo do consumo») precisa de comparar a versão nova com o consumo, linha a linha, num só momento.

### 4. Segregação de funções

`orcamental:orcamento:elaborar` e `orcamental:orcamento:aprovar` são permissões distintas. Mesmo
que o mesmo utilizador tenha as duas, o serviço recusa aprovar uma versão que ele próprio submeteu
(`SEGREGACAO_FUNCOES`). A regra vale para o ADMIN, porque é isso que os auditores de doadores verificam.

### 5. Substituição de `OrcamentoProjeto`

Migração de dados numa só PR com a criação do domínio:

| De | Para |
|---|---|
| Tenant com algum `OrcamentoProjeto` | Um `Financiador` técnico do tipo `PROPRIO` («Fundos próprios») |
| Projecto com `OrcamentoProjeto` | `Financiamento` desse financiador, natureza `FUNDOS_PROPRIOS`, moeda `MZN`, regra `ALERTA` |
| `OrcamentoProjeto` (cada versão) | `VersaoOrcamento` (`RASCUNHO`, `REJEITADO`, `REVISAO`→`SUBMETIDO`; das várias `APROVADO` só a de maior versão fica `APROVADO`, as outras ficam `SUBSTITUIDO`) |
| `CategoriaOrcamento` | `RubricaFinanciador` (do tipo `MAO_OBRA`, `MATERIAL`…) |
| `ItemOrcamento` | `LinhaOrcamento`, com uma `Actividade` «Geral» por projecto e o mês da data de início |
| `valorUtilizado` | **descartado**: a execução é derivada (ADR-0045) |
| — | `VersaoMapeamentoRubrica` gerada: as contas de gasto (classe 6) mapeadas para uma rubrica «Geral» do financiamento, a refinar pelo utilizador. Sem isto, nenhum financiamento migrado podia receber imputações (`CONTA_SEM_RUBRICA`) |

Depois disso os três modelos e `TipoCategoriaOrcamento` saem do schema, e
`Projeto.orcamentoPlanejado` passa a leitura derivada. Não há produção (ADR-0026 §5), e a migração
só afecta o seed e o tenant `demo`. É por isso que a substituição é barata **agora** e deixa de o ser
depois do primeiro cliente.

## Consequências

**Positivas**
- O co-financiamento, a realocação entre rubricas e o orçamento revisto deixam de ser casos
  especiais.
- Desaparece uma fonte de verdade duplicada (`valorUtilizado`).
- As empresas usam o mesmo módulo com `PROPRIO` + `ALERTA` e não precisam de configuração de doador.

**Negativas**
- Um domínio novo com 10+ modelos e um contrato injectado no `contabilidade.service`, que é o ficheiro
  mais sensível do repositório.
- Os utilizadores do ecrã `/projetos/orcamento` mudam de sítio.
- A versão completa duplica linhas a cada revisão (aceite: ver §3).

**Riscos**
- **O mapeamento conta → rubrica mal configurado bloqueia lançamentos** (`CONTA_SEM_RUBRICA`). A
  mitigação é um assistente de mapeamento na activação do financiamento, que lista as contas usadas
  nos últimos 12 meses sem rubrica, e é proibido activar com contas de gasto por mapear.

## Questões em aberto

1. Gating comercial do módulo (ADR-0027): em que plano entra.
2. `Programa`: basta como agrupador analítico, ou precisa de orçamento próprio (multi-financiamento
   consolidado)? O MVP assume que basta como agrupador.
