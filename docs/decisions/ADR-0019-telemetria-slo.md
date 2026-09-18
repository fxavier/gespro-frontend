# ADR-0019 — Destino da telemetria, alertas e objectivos de nível de serviço

- **Estado**: Proposto
- **Data**: 2026-08-21
- **Contexto**: Spec 20 (Prontidão para Produção) · Wave 8
- **Relacionados**: [ADR-0005-c](./ADR-0005-observabilidade.md) (instrumentação), [ADR-0018](./ADR-0018-desempenho-capacidade.md), [ADR-0012](./ADR-0012-alojamento-keycloak.md)
- **Skills**: `engineering:architecture`, `engineering:incident-response`

## Contexto
> **Revisto pelo [ADR-0026](./ADR-0026-adiamento-fornecedor-infraestrutura.md)** — a escolha de
> fornecedor de infraestrutura foi adiada. O que este ADR nomeia como serviço da AWS deve ler-se como
> **capacidade requerida**; a AWS é uma implementação candidata, não o plano. O ambiente de referência
> é local (Docker Compose).


O [ADR-0005-c](./ADR-0005-observabilidade.md) fixou a instrumentação e ela foi construída bem:
registo estruturado com redacção de segredos e dados pessoais, `requestId` propagado por
`AsyncLocalStorage` independente do contexto de tenant, métricas de taxa/erro/duração, `/api/health`,
`/api/ready` com consulta real à base de dados, e `/api/metrics` protegido por segredo.

Falta a metade que torna isto útil: **ninguém recebe nada**. O SDK de OpenTelemetry está configurado
e não há *backend* ligado. As métricas são expostas e não há quem as recolha. Não há painéis, não há
alertas, não há quem seja avisado quando alguma coisa parte.

Métricas produzidas e não observadas não são observabilidade — são potencial. E o primeiro incidente
em produção seria diagnosticado a ler registos à mão, num sistema que a equipa nunca viu funcionar sob
carga real.

A adopção do Keycloak (ADR-0010) agrava a urgência: passa a haver um serviço externo no caminho
crítico do login, com base de dados própria e cadência de actualização trimestral. Sem alerta sobre
esse serviço, uma indisponibilidade de autenticação é descoberta por um cliente ao telefone.

## Decisão

**Grafana Cloud como destino único de registos, métricas e traces, com objectivos de nível de serviço
explícitos e alerta com destino humano.**

### 1. Destino

**A pilha Grafana — Grafana, Prometheus, Loki e Tempo — recebendo por OTLP.** O que se decide é o
*protocolo* e a *forma*: uma só interface para correlacionar um trace, o registo que lhe corresponde e
a métrica que disparou o alerta.

**Onde corre ficou adiado** (ADR-0026). No ambiente de referência é a imagem `grafana/otel-lgtm`, que
junta as quatro peças num contentor e expõe um receptor OTLP. Quando houver fornecedor, o mesmo
exportador aponta para Grafana Cloud, para uma instalação própria, ou para o que o fornecedor
oferecer — **muda uma variável de ambiente, não código**.

Painéis e regras de alerta são **provisionados por ficheiro versionado**, não clicados na interface.
É isso que os torna portáveis entre a instalação local e a de produção.

### 2. O que se mede

Além do que já é produzido, três dimensões novas, todas com **`tenantId` como etiqueta** — sem isso é
impossível responder a «está lento para todos ou só para este cliente?»:

- **Saúde do Keycloak**: disponibilidade, latência do endpoint de token, taxa de falha de autenticação.
- **Saúde do Valkey** (ADR-0014): disponibilidade, latência, e contagem de vezes que o limitador
  falhou aberto. *(A tecnologia decidida é Valkey; os nomes de métrica usam `valkey_`, não `redis_`.)*
- **Sinais de negócio**: vendas por minuto, facturas emitidas, falhas de *webhook* Stripe, tarefas
  agendadas que não correram. Uma queda a zero nas vendas de um tenant activo é frequentemente o
  primeiro sinal de avaria — e nenhuma métrica técnica a apanha.

**Cardinalidade**: `tenantId` é etiqueta; `userId` e `requestId` **nunca** são. Vão no registo e no
trace, onde a alta cardinalidade é gratuita, nunca na métrica, onde é o que faz explodir o custo.

### 3. Objectivos de nível de serviço

| Serviço | Objectivo | Janela |
|---|---|---|
| Disponibilidade do ERP | 99,5 % | 30 dias |
| Disponibilidade do login (Keycloak) | 99,5 % | 30 dias |
| Latência de leitura (p95) | < 800 ms | 7 dias |
| Latência de mutação (p95) | < 1 200 ms | 7 dias |
| Taxa de erro 5xx | < 0,1 % | 7 dias |
| Processamento de *webhook* Stripe | 99,9 % em 5 min | 30 dias |

99,5 % em 30 dias são cerca de 3,6 horas de indisponibilidade permitida. É deliberadamente modesto:
uma equipa sem rotação de piquete que promete 99,9 % está a prometer o que não pode cumprir, e um
objectivo que se falha todos os meses deixa de ser respeitado.

### 4. Alertas

Quatro painéis: **Visão geral do serviço**, **Latência por rota**, **Erros por tenant**, **Sinais de
negócio**.

Alertas com destino a e-mail e a canal de mensagens, divididos em dois níveis:

- **Página** (acordar alguém): ERP ou Keycloak indisponíveis; taxa de erro acima de 1 % durante 5
  minutos; base de dados inacessível.
- **Aviso** (dia útil seguinte): consumo de orçamento de erro do SLO acima de 50 %; latência p95
  acima do objectivo por 30 minutos; *webhook* Stripe em fila; tarefa agendada falhada; limitador a
  falhar aberto; certificado a expirar em menos de 14 dias.

**Cada alerta que pagina tem de ter um manual de operação associado** — um documento em `docs/runbooks/`
com sintoma, diagnóstico e acção. Um alerta sem manual é ruído para quem o recebe às três da manhã, e
será silenciado até deixar de servir para nada.

### 5. Regra de higiene

Um alerta que dispare mais de duas vezes sem exigir acção é **corrigido ou eliminado** na semana
seguinte. Fadiga de alerta mata sistemas de monitorização mais depressa do que a falta deles.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Pilha Grafana por OTLP** ✅ | Registos, métricas e traces num só sítio; OTLP nativo; corre local em um contentor e em produção como serviço gerido, sem mudar código; painéis versionados | Quatro componentes por baixo; a retenção local é limitada pelo disco |
| Amazon Managed Prometheus + Managed Grafana | Fica na AWS; integra com IAM | Três serviços a modelar; registos ficam de fora, em CloudWatch; custo maior no escalão inicial |
| CloudWatch apenas | Já existe; sem integração nova | Consulta de traces fraca; correlação entre as três correntes é manual; a experiência de painel é pobre |
| Prometheus + Grafana + Loki auto-alojados | Sem custo de licença; controlo total | Mais três serviços com estado para operar, numa equipa que ainda não operou nenhum. Contradiz a lógica do ADR-0012 |
| Honeycomb / Datadog | Excelentes para investigação; maturidade elevada | Custo por evento ou por anfitrião desproporcionado para a fase; o Datadog é conhecido por facturas que surpreendem |

## Consequências

- **A instrumentação existente não muda.** Muda o destino e acrescentam-se etiquetas. O trabalho é de
  configuração, painéis e alertas — não de reescrita.
- **Novos segredos** (chave de ingestão OTLP) no Secrets Manager, com o `METRICS_SECRET` já existente
  a manter-se para o endpoint próprio.
- **Custo pode passar de zero para material** se a cardinalidade não for disciplinada. A regra de
  `tenantId` como única etiqueta de alta cardinalidade é o que trava isso, e deve ser verificada na
  revisão de código de qualquer métrica nova.
- **Localmente, os alertas vão para um receptor de webhook da própria pilha**, o que permite verificar
  que a regra dispara sem precisar de conta em serviço nenhum. O destino humano — e-mail e canal — é
  configurado quando houver produção.
- **A equipa passa a ter destinatários de alerta.** Sem rotação de piquete definida, os alertas de
  paginação vão para o canal e para o e-mail de quem estiver disponível. É insuficiente para 99,5 %
  reais e deve ser revisto quando houver clientes que paguem por esse número.
- **Manuais de operação passam a ser um artefacto de primeira classe**, em `docs/runbooks/`. O primeiro
  a escrever é o de indisponibilidade do Keycloak, porque é a dependência nova e a que mais utilizadores
  bloqueia.
- **Os SLO ligam-se ao ADR-0018**: os objectivos de latência são os mesmos que o teste de carga
  verifica. Um é medição em laboratório, o outro é observação em produção — e devem convergir. Se
  divergirem muito, é o perfil de carga sintético que está errado.
