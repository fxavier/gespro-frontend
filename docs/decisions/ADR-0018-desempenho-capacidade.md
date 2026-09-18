# ADR-0018 — Estratégia de desempenho e capacidade

- **Estado**: Proposto
- **Data**: 2026-08-21
- **Contexto**: Spec 20 (Prontidão para Produção) · Wave 8
- **Relacionados**: [ADR-0014](./ADR-0014-cache-e-rate-limit-distribuido.md), [ADR-0019](./ADR-0019-telemetria-slo.md), [ADR-0015](./ADR-0015-auditoria-documentos-financeiros.md)
- **Skills**: `engineering:architecture`, `engineering:testing-strategy`

## Contexto

O GestPro tem 1 199 testes automatizados, 37 cenários E2E e três gates de arquitectura. Não tem **uma
única medição de comportamento sob carga**. Não existe ferramenta, cenário nem histórico no
repositório.

Isto tem consequências que vão além da engenharia. Ninguém sabe responder a:

- Quantos tenants cabem numa instância antes de a latência degradar?
- Qual a latência do balancete com um ano de lançamentos? E com cinco?
- Quanto custa servir um cliente médio por mês?
- A paginação por cursor aguenta uma tabela de movimentos de stock com milhões de linhas?

A última pergunta merece nota: a paginação **está bem feita** — por cursor, com `take + 1`, nunca
`skip` com deslocamento grande. Foi uma boa decisão tomada cedo. Mas «bem feita» não é o mesmo que
«medida», e os índices foram declarados por convenção durante a modelação, sem qualquer análise de
plano de execução sobre consultas reais com volume.

Sem estes números não é possível precificar escalões de plano, dimensionar a infraestrutura com
fundamento, nem saber se o Valkey do ADR-0014 deve ou não passar a servir cache.

## Decisão

**Estabelecer uma linha de base de desempenho com k6, contra dados sintéticos de escala realista, e
fixar objectivos de nível de serviço que passam a ser gate de CI.**

### 1. Ferramenta: k6

Cenários em JavaScript — a mesma linguagem do resto do repositório —, executável localmente e em CI,
com saída em formato Prometheus que liga directamente à telemetria do ADR-0019. Vive em `perf/`, ao
lado de `e2e/`.

### 2. Gerador de volume realista

Um comando `pnpm db:seed:volume` que produz um tenant de dimensão representativa de uma PME
moçambicana com dois anos de operação:

| Entidade | Volume |
|---|---|
| Produtos e variantes | 5 000 |
| Clientes | 2 000 |
| Vendas (com linhas e pagamentos) | 120 000 |
| Movimentos de stock | 400 000 |
| Lançamentos contabilísticos e partidas | 250 000 |
| Facturas emitidas | 60 000 |
| Colaboradores e folhas de remuneração | 80 · 24 meses |
| Registos de auditoria (ADR-0015) | ~1 000 000 |

E um segundo perfil **multi-tenant**: 50 tenants desta dimensão na mesma base de dados, para medir o
custo real do isolamento lógico — que é a pergunta que decide se a arquitectura multi-tenant escolhida
escala ou não.

### 3. Cenários obrigatórios

| Cenário | Porquê |
|---|---|
| Venda no POS ponta-a-ponta | O fluxo mais crítico; transacção com quatro domínios e agora com auditoria síncrona |
| Listagem de movimentos de stock com filtros | Maior tabela; testa a paginação por cursor sob volume |
| Balancete e razão de conta | Agregação sobre 250 000 partidas; a consulta mais pesada do sistema |
| Emissão de factura com PDF | Transacção mais geração de documento em runtime Node |
| Processamento salarial de 80 colaboradores | Cálculo intensivo em `Decimal` com tabelas versionadas |
| Exportação XLSX de 50 000 linhas | Memória e tempo de pedido |
| Autenticação (ADR-0010) | Nova dependência externa no caminho crítico. **Só mede depois do Keycloak existir** — ver nota abaixo |

### 4. Objectivos de nível de serviço

| Métrica | Objectivo |
|---|---|
| Leitura de página (p95) | < 800 ms |
| Server Action de mutação (p95) | < 1 200 ms |
| Venda no POS ponta-a-ponta (p95) | < 1 500 ms |
| Balancete de um exercício (p95) | < 3 000 ms |
| Taxa de erro sob carga nominal | < 0,1 % |
| Autenticação (p95) | < 2 000 ms |

São **provisórios até à primeira medição**. Um objectivo inventado antes de existir uma linha de base
é uma opinião; depois da primeira execução, ou se confirmam ou se ajustam com justificação escrita.

> **A medição é local** (ADR-0026), e isso limita o que os números significam. São válidos como
> **grandeza relativa** — que consulta é dez vezes mais lenta que outra, se um índice novo melhorou,
> se uma alteração causou regressão — e é para isso que servem o gate de CI e a revisão de planos de
> consulta. **Não** são válidos como valores absolutos de produção: uma máquina de desenvolvimento não
> tem a rede, o armazenamento nem a contenção de um ambiente real. O número «tenants por instância»
> sai daqui como **ordem de grandeza para dimensionar e precificar**, e é reconfirmado quando houver
> produção.

> **Duas linhas de base, não uma.** Os seis primeiros cenários medem-se na fase 1, contra o sistema tal
> como está. O sétimo — autenticação — mede um fluxo que **ainda não existe**: medi-lo contra o
> `Credentials` produziria um número que fica inválido no dia em que o Keycloak funde. Por isso a linha
> de base tem duas partes: `baseline-pre-keycloak.json` na fase 1, e uma **re-medição obrigatória**
> logo após a migração de identidade, que produz `baseline.json` — o ficheiro contra o qual o gate de
> CI compara. Enquanto a re-medição não acontecer, o gate corre sem falhar o merge.

### 5. Revisão de planos de execução

Sobre a base de dados com volume, `EXPLAIN (ANALYZE, BUFFERS)` nas vinte consultas mais lentas
capturadas pelos cenários. Cada varrimento sequencial sobre tabela grande é triado: índice em falta,
consulta a reescrever, ou aceite com justificação escrita. O resultado fica em
`docs/handoff/w8-desempenho.md`, com o antes e o depois.

### 6. Gate de regressão em CI

Um cenário reduzido — dez utilizadores virtuais, dois minutos, contra um subconjunto do volume — corre
no CI a cada *pull request* e **falha se o p95 degradar mais de 20 %** face à linha de base
registada. Não é uma medição de capacidade; é um detector de regressões grosseiras, que é o que um
runner de CI partilhado consegue medir com honestidade.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **k6** ✅ | Cenários em JavaScript; corre local e em CI; saída Prometheus que liga à telemetria; leve o suficiente para o gate por PR | Menos capaz do que Gatling em modelos de carga muito elaborados |
| Artillery | JavaScript e configuração em YAML; simples de arrancar | Comunidade e ecossistema de saída mais pobres; menos usado para gate de CI |
| Gatling | Modelação de carga muito rica; relatórios excelentes | Cenários em Scala ou Java — outra linguagem no repositório, e a equipa trabalha em TypeScript |
| Locust | Python, extensível | Mais uma linguagem; sobreposição com o que o k6 já resolve |
| Medir só em produção com telemetria real | Números verdadeiros, sem simulação | Não há produção. E quando houver, descobrir o limite com clientes em cima é a forma cara de aprender |
| Não medir, dimensionar por intuição | Zero trabalho | É a situação actual, e é a razão de não se conseguir precificar o produto |

Racional: escolhemos o k6 por ser o único que satisfaz simultaneamente as duas utilizações — a
campanha de capacidade, que corre ocasionalmente contra volume realista, e o gate por *pull request*,
que tem de ser leve e determinístico. Ferramentas mais capazes na primeira utilização são pesadas
demais para a segunda.

## Consequências

- **Nova pasta `perf/`** com cenários, perfis de carga e linha de base versionada em JSON. A linha de
  base é um ficheiro do repositório: alterá-la exige *pull request* e justificação.
- **`pnpm db:seed:volume` é lento** — dezenas de minutos. Corre sob procura, nunca no arranque de
  desenvolvimento normal.
- **Um nono job de CI**, `perf`, com o cenário reduzido. Acrescenta tempo ao *pull request*; o limiar
  de 20 % é deliberadamente largo para que a variância de um runner partilhado não gere alarme falso.
- **A resposta sobre a cache do ADR-0014 vem deste trabalho.** Só depois de saber onde está o tempo é
  que se decide o que vale a pena guardar em cache. Se a medição mostrar que a base de dados não é o
  estrangulamento, a cache não se faz — e isso é um resultado válido.
- **A revisão de índices pode gerar migrações.** Índices novos em tabelas grandes exigem
  `CREATE INDEX CONCURRENTLY`, escrito à mão, fora do fluxo normal do `migrate diff` — nota
  operacional que fica registada para quem aplicar.
- **O número que interessa ao negócio é «tenants por instância».** É esse que permite calcular o custo
  de servir um cliente e fixar limites por escalão de plano. Sai do perfil multi-tenant e deve ser
  comunicado fora da engenharia.
