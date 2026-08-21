# ADR-0025 — Separação do domínio Pessoas & Projectos

- **Estado**: Proposto
- **Data**: 2026-08-21
- **Contexto**: Spec 20 (Prontidão para Produção) · Wave 8
- **Relacionados**: [ADR-0003](./0003-gate-wave1-arbitragens.md), [ADR-0024](./ADR-0024-gates-arquitectura.md), [ADR-0017](./ADR-0017-ciclo-vida-armazenamento.md)
- **Skills**: `engineering:architecture`, `prisma-conventions`

## Contexto

`pessoas-projetos.prisma` tem **50 modelos e 56 enumerações**. É quase três vezes a média dos outros
seis domínios e concentra cinco áreas de negócio que só por acidente de organização das *waves*
partilham um ficheiro:

| Área | Modelos | Exemplos |
|---|---|---|
| Recursos humanos | 14 | `Colaborador`, `Ferias`, `Ausencia`, `RegistoAssiduidade`, `Avaliacao`, `Formacao` |
| Remuneração | 5 | `FolhaPagamento`, `LinhaPayroll`, `TabelaINSS`, `EscalaoIRPS`, `Payroll` |
| Recrutamento e benefícios | 7 | `Vaga`, `Candidato`, `Candidatura`, `Entrevista`, `Beneficio` |
| Projectos | 16 | `Projeto`, `TarefaProjeto`, `Timesheet`, `Marco`, `OrcamentoProjeto`, `RiscoProjeto` |
| Produção | 8 | `CentroTrabalho`, `EstruturaProduto`, `Roteiro`, `OrdemProducao`, `ConsumoProducao` |

Foi também **o ficheiro com mais conflitos de fusão** ao longo do programa: qualquer agente que
tocasse em RH, produção ou projectos escrevia no mesmo ficheiro, e o orquestrador teve repetidamente
de serializar trabalho que podia ter corrido em paralelo.

A relação entre as áreas é fraca. Produção liga-se sobretudo ao **inventário** — consome componentes e
dá entrada de produto acabado — e ao centro de trabalho, que é um recurso, não uma pessoa. Projectos
liga-se a colaboradores por causa das folhas de horas, e pouco mais. O único acoplamento genuíno é
RH ↔ Remuneração, que é real e não deve ser separado.

O ADR-0024 acrescenta um gate que impede *imports* internos entre domínios. Manter cinco áreas num só
domínio significa que esse gate **não vê nada** dentro deste ficheiro — as fronteiras internas
continuam a ser convenção.

## Decisão

**Separar em três domínios, na última fase do plano, a correr sozinho.**

| Novo domínio | Origem | Modelos | Justificação |
|---|---|---|---|
| **`pessoas.prisma`** | RH + Remuneração + Recrutamento + Benefícios | 26 | Giram todos à volta de `Colaborador`; o acoplamento é real |
| **`projetos.prisma`** | Projectos | 16 | Consome colaboradores por chave escalar; entidade autónoma |
| **`producao.prisma`** | Produção | 8 | Consome inventário; sem relação com pessoas além do centro de trabalho |

### Regras da separação

1. **Nenhuma alteração de dados.** É movimentação de definições entre ficheiros de *schema*, não
   remodelação. Nomes de tabela, colunas e relações mantêm-se **exactamente** iguais. A migração
   gerada tem de ser **vazia** — e essa é a verificação de sucesso: se o `migrate diff` produzir SQL, a
   separação está mal feita.

2. **Relações que atravessam a nova fronteira passam a chaves escalares.** `TarefaProjeto.colaboradorId`
   e `ConsumoProducao.produtoId` deixam de ser `@relation` e passam a `String` com índice, como manda a
   regra do `CLAUDE.md` para chaves entre domínios. É a única alteração estrutural, e alinha estes
   modelos com o que os outros seis domínios já fazem.

3. **Contratos publicados onde havia acesso directo.** Se produção lia `Colaborador` directamente,
   passa a fazê-lo por função de contrato de `pessoas`. O gate do ADR-0024 passa a cobrir estas
   fronteiras, que hoje são invisíveis.

4. **Os serviços acompanham.** `src/server/services/pessoas-projetos/` divide-se em três pastas com os
   mesmos nomes dos *schemas*.

5. **Momento: fase 5, a última.** É a alteração com maior superfície de conflito de toda a wave, e
   por isso corre **sozinha**, sem nenhum outro agente a tocar nestes ficheiros. Vem depois da
   consolidação porque o ADR-0017 altera `DocumentoColaborador` neste mesmo ficheiro, com migração
   **não vazia** — e o critério de aceitação desta separação é precisamente uma migração vazia. As
   duas não podem partilhar janela.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Separar em três, na fase 5, sozinho** ✅ | Cada domínio volta à dimensão média; o gate de fronteiras passa a ver as divisões internas; conflitos de fusão futuros caem | Alteração de grande superfície; exige janela exclusiva; risco de migração acidental |
| Separar em dois (pessoas / projectos+produção) | Menos movimentação | Projectos e produção não têm relação entre si. Seria uma fronteira arbitrária, que é o problema actual em menor escala |
| Não separar | Zero risco imediato | O ficheiro continua a crescer; conflitos continuam a serializar trabalho paralelo; o gate continua cego lá dentro |
| Separar cedo (fase 1 ou 2) | Resolve depressa | Colide com o ADR-0017, que altera `DocumentoColaborador` neste ficheiro com migração não vazia, e com o trabalho de identidade em curso. Ordem errada |
| Separar em bases de dados distintas | Isolamento verdadeiro | Destrói a atomicidade transaccional entre domínios, que é o activo mais valioso da arquitectura. Fora de questão |

Racional: separar é a decisão certa, e o momento é a parte difícil. Fazê-lo cedo colide com trabalho
em curso; fazê-lo tarde é conviver com o problema por mais um ciclo. A fase 5 é a janela onde tudo o
resto já fundiu, onde a migração do ADR-0017 já correu, e onde ainda não arrancou trabalho funcional
novo.

## Consequências

- **Migração vazia é o critério de aceitação.** `prisma migrate diff` tem de produzir SQL nulo, à
  excepção do que resulte da conversão de `@relation` em chave escalar — que deve ser apenas
  criação de índice, nunca movimentação de dados.
- **Janela exclusiva.** Nenhum outro agente toca em `pessoas-projetos.prisma` nem nos serviços
  correspondentes enquanto esta separação decorrer. É o único ponto de serialização do plano.
- **`DocumentoColaborador` já foi alinhado pelo ADR-0017** antes desta fase, e é apenas **movido**
  para `pessoas.prisma` aqui. Se por alguma razão o ADR-0017 escorregar para depois, esta separação
  espera — não se invertem as duas.
- **Os *imports* mudam em muitos ficheiros.** É movimentação mecânica, verificável pelo `tsc`, mas de
  grande superfície — e por isso um mau candidato a revisão manual linha a linha. A verificação é o
  compilador e a suite de testes, não a leitura.
- **Ganho imediato**: três agentes passam a poder trabalhar em RH, projectos e produção em paralelo
  sem conflitos, o que era impossível.
- **Não resolve tudo.** `pessoas.prisma` fica com 26 modelos, ainda acima da média. Se recrutamento e
  benefícios crescerem, uma segunda separação será justificada — e será um ADR próprio, com a
  experiência desta.
