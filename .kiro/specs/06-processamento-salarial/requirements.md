# Requisitos: Processamento Salarial (Payroll)

## Introdução

O modelo `Payroll` existe no schema (`prisma/schema/pessoas-projetos.prisma`) mas
está marcado como **"extensão futura — não implementar IPayrollService nesta wave"**.
A página `/rh/payroll` lê `prisma.payroll` diretamente e o formulário
`/rh/payroll/novo` tem `onSubmit` por ligar (comentário
`// Nota: chamar criarPayrollAction quando estiver disponível`), com `descontoInss`
e `descontoIrps` **introduzidos manualmente** — não há qualquer cálculo estatutário.
Este spec implementa o **motor de folha salarial** para Moçambique.

### Estado atual (verificado)

- Modelo `Payroll` + enum `StatusPayroll { PENDENTE PROCESSADO PAGO CANCELADO }`
  existem; sem serviço, sem action, sem cálculo.
- Página lista e KPIs via prisma cru; form de criação é um shell não ligado.

## Requisitos

### Requisito 1 — Tabelas paramétricas (INSS/IRPS) versionadas por vigência

1. O sistema DEVE armazenar as taxas em tabelas paramétricas com data de vigência
   (`vigenciaInicio`/`vigenciaFim`), **nunca hardcoded**, porque mudam por
   legislação: contribuição INSS (trabalhador 3% / entidade 4%) e escalões
   progressivos do IRPS sobre rendimento de trabalho dependente.
2. O cálculo de uma folha de um dado mês DEVE usar a tabela vigente nesse mês.
3. As tabelas DEVEM ser seedadas a partir de fontes oficiais (ver "Fontes") e
   documentar a versão/decreto aplicado.

### Requisito 2 — Cálculo de proventos

1. O sistema DEVE compor o salário bruto a partir de: `salarioBase` + subsídios
   fixos do `Colaborador` (alimentação, transporte, habitação, outros) + variáveis
   do mês (horas extras, comissões, bónus, outros proventos).
2. As horas extras DEVEM ser valorizadas a partir de `RegistoAssiduidade`
   (`horasExtras`) do período, com majoração configurável (ex.: 50%/100%).
3. As comissões DEVEM poder ser importadas do WS C (`Comissao`) do período.

### Requisito 3 — Cálculo de descontos estatutários

1. **INSS (trabalhador):** `descontoInss = base_inss × taxaTrabalhador` (3% por
   omissão), onde `base_inss` segue a regra de incidência da tabela vigente.
2. **IRPS:** `descontoIrps` calculado pela tabela progressiva vigente (escalão →
   taxa → parcela a abater), sobre a base tributável (bruto − INSS − deduções
   aplicáveis), considerando a situação familiar/dependentes quando aplicável.
3. Outros descontos (adiantamentos, faltas não remuneradas de `Ausencia`,
   penhoras) DEVEM ser suportados como linhas configuráveis.
4. `salarioLiquido = bruto − INSS − IRPS − outrosDescontos`. Todos os valores em
   `Decimal(18,2)`; arredondamento definido e testado.

### Requisito 4 — Contribuição patronal e custo total

1. O sistema DEVE calcular a contribuição patronal ao INSS (4%) como **encargo da
   entidade** (não desconto do trabalhador) e o custo total do colaborador
   (bruto + encargos patronais) para efeitos de contabilização e relatório.

### Requisito 5 — Folha mensal em lote e ciclo de vida

1. O sistema DEVE permitir processar a folha de **todos os colaboradores activos**
   de um mês/ano numa operação em lote, gerando um `Payroll` por colaborador
   (idempotente: `@@unique([tenantId, colaboradorId, anoReferencia, mesReferencia])`).
2. Ciclo: `PENDENTE → PROCESSADO → PAGO`, com `CANCELADO` a partir de PENDENTE/
   PROCESSADO. Transições inválidas → `BusinessRuleError`.
3. QUANDO uma folha é marcada `PROCESSADO`, ENTÃO é imutável nos valores
   (append-only); correcções por cancelamento + reprocessamento.

### Requisito 6 — Integração contabilística

1. QUANDO uma folha mensal é `PROCESSADA`, ENTÃO o sistema DEVE registar o
   lançamento contabilístico da massa salarial via contrato do WS D
   (`registarLancamentoContabilistico`, diário `SALARIOS`), com partidas dobradas
   (gasto com pessoal, INSS a pagar trabalhador+patronal, IRPS retido a pagar,
   líquido a pagar) — débito == crédito garantido.
2. QUANDO uma folha é marcada `PAGO`, ENTÃO DEVE registar o movimento de
   caixa/banco via contrato do WS D (`registarMovimentoCaixa`) ou pagamento
   bancário.

### Requisito 7 — Recibo de vencimento e exportações

1. O sistema DEVE gerar o recibo de vencimento (PDF) por colaborador com proventos,
   descontos, líquido e dados legais (INSS, NUIT).
2. DEVE exportar o mapa de INSS e o mapa de IRPS retido do mês (CSV) para
   submissão às autoridades.

### Requisito 8 — UI sem modais

1. `/rh/payroll` (lista mensal — existe, ligar ao serviço),
   `/rh/payroll/nova` (processar lote do mês), `/rh/payroll/[id]` (detalhe/recibo).
2. Server Components; folhas `'use client'`; sem `Dialog` (excepto `AlertDialog`).
   `Decimal`→`string` na fronteira SC→CC.

## Critérios de Aceitação

1. `pnpm check` verde; cobertura do motor de cálculo ≥ 90% (crítico).
2. Property tests: `liquido == bruto − descontos` sempre; IRPS monotónico
   (rendimento maior ⇒ imposto ≥); INSS trabalhador == 3% da base; nenhum valor
   negativo indevido.
3. Testes de tabela (*golden*) validam o cálculo IRPS/INSS contra exemplos
   oficiais das fontes citadas para pelo menos 3 escalões.
4. Lançamento contabilístico gerado tem débito == crédito (property test).
5. Isolamento multi-tenant em todas as operações.

## Fontes (obrigatório validar antes de seedar as tabelas)

- **INSS — taxa contributiva (trabalhador 3% / entidade 4%, total 7%):**
  Instituto Nacional de Segurança Social. https://www.inss.gov.mz/taxa-contributiva-tco/
- **IRPS — Código e taxas:** Autoridade Tributária de Moçambique.
  https://www.at.gov.mz/por/Processos-Fiscais/Imposto-sobre-o-Rendimento-de-Pessoas-Singulares-IRPS
  e https://www.at.gov.mz/por/Comercio-Internacional/Procedimento-Fiscais/Taxas-IRPS
- **Reforma fiscal 2026 (eliminação da isenção de 36 salários mínimos, novo
  mínimo tributável):** confirmar no *Boletim da República* aplicável antes de
  fixar escalões. Resumo: https://mooremz.co.mz/wp-content/uploads/2025/12/Reforma-Fiscal-2026-PT.pdf
  e https://www.pwc.pt/pt/pwcinforfisco/flash/mocambique/mocambique-irps-alteracoes-cirps.html

> Nota: os escalões IRPS estão em revisão pela reforma de 2026. O design é
> table-driven exactamente para absorver estas alterações sem tocar no código.
