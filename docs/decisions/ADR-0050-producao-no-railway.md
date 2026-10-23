# ADR-0050 — Produção no Railway

- **Estado**: Proposto
- **Data**: 2026-10-22
- **Contexto**: Spec 20 (Prontidão para Produção) · fase de provisionamento adiada pelo ADR-0026 §5 ·
  issues #572, #574, #575, #576, #577
- **Substitui**: [ADR-0026](./ADR-0026-adiamento-fornecedor-infraestrutura.md) §5 e §4, na parte da
  decisão (o fornecedor deixa de estar por escolher; o Terraform AWS deixa de estar dormente e passa a
  arquivado, excepto o armazenamento). Os §1–§3 do 0026 — capacidades, ambiente local de referência e
  regras de portabilidade — **mantêm-se e são pressuposto deste ADR**.
- **Concretiza**: [ADR-0012](./ADR-0012-alojamento-keycloak.md) (onde corre o Keycloak),
  [ADR-0014](./ADR-0014-cache-e-rate-limit-distribuido.md) §1 (onde corre o Valkey),
  [ADR-0019](./ADR-0019-telemetria-slo.md) §4 (que alertas chegam a quem),
  [ADR-0020](./ADR-0020-continuidade-recuperacao.md) §2 (mecanismos de continuidade),
  [ADR-0022](./ADR-0022-provisionamento-ambientes.md) §2, §5 (como se provisiona e publica)
- **Relacionados**: [ADR-0005-b](./ADR-0005-infraestrutura-deploy.md),
  [ADR-0013](./ADR-0013-migracao-identidade.md), [ADR-0017](./ADR-0017-ciclo-vida-armazenamento.md),
  [ADR-0029](./ADR-0029-login-no-erp-direct-grant.md), `docs/runbooks/agendador.md`
- **Skills**: `engineering:architecture`, `engineering:deploy-checklist`

## Contexto

O ADR-0026 adiou a escolha de fornecedor até haver três números — tenants por instância, perfil de
carga, preço por escalão — e deixou o Terraform da AWS dormente como «uma implementação candidata
entre várias». Desde então:

- A auditoria de lacunas de 2026-10-16 abriu cinco issues de gravidade A que **só se fecham com um
  alvo de deploy**: o IaC não tem Keycloak, Valkey, agendador nem metade dos segredos (#572); as
  migrações correm no arranque de cada réplica (#574); a continuidade fica abaixo do ADR-0020 (#575);
  não há alertas em produção (#576); a imagem nunca é construída no CI (#577).
- O #638 e o #640 deixaram o módulo `infra/modules/storage` com **Object Lock em GOVERNANCE a 10
  anos, réplica entre regiões e POST assinado com o SHA-256 do ficheiro** — testado contra um
  fornecedor dobrado (`terraform test`), nunca aplicado.
- O resto do IaC AWS (App Runner, RDS, VPC, Secrets Manager, CloudWatch) continua sem um único
  recurso provisionado.

O humano decidiu o fornecedor: **Railway**. Este ADR regista essa decisão, o porquê, o que o Railway
não cobre e como se tapa, e o que fica em aberto.

### Factos do Railway em que a decisão assenta

Verificados na documentação oficial do Railway ([docs.railway.com](https://docs.railway.com)) a
2026-10-22; a linha do Config as Code a 2026-10-23. Um ADR que assenta em documentação de fornecedor herda o prazo de validade dela: se algum mudar, este ADR é
revisto, não lido de memória.

| Facto | Consequência aqui |
|---|---|
| `preDeployCommand` (+ `preDeployTimeoutSeconds`): corre **uma vez** por deploy, na rede privada, antes de a versão nova receber tráfego; se falhar, o deploy falha; não monta volumes | É o passo único de migração que o #574 pede |
| `healthcheckPath`: a versão nova só fica activa depois de responder 200 | Troca de tráfego condicionada à saúde, sem orquestração nossa |
| Postgres gerido com **recuperação a um ponto no tempo** (pgBackRest para um bucket do Railway); o restauro cria um **serviço novo** | Cumpre a capacidade do ADR-0026 §1 e o mecanismo do ADR-0020 §2 |
| **Railway Buckets: sem versionamento de objectos, sem Object Lock, sem regras de ciclo de vida** (texto da documentação dos Buckets) | Não servem para documentos fiscais — ver §2 |
| Alertas: **webhooks de projecto** (deploy `Failed`/`Crashed`, volume, monitores) e **monitores** de CPU, RAM e disco (plano **Pro**) | Cobre o que é da plataforma; não cobre o que é da aplicação — ver §5 |
| Regiões: `us-west2`, `us-east4-eqdc4a`, `europe-west4-drams3a`, `asia-southeast1-eqsg3a` | Escolhe-se `europe-west4-drams3a` — ver §1 |
| Tarefas agendadas nativas: um horário cron **por serviço** | Substitui o contentor `cron` do compose por cinco serviços, um por rota — ver §4 |
| **Config as Code (`railway.json`) está descontinuado**: «New services cannot opt into Config as Code», e os ficheiros deixam de ser lidos a **2026-12-01**. O substituto é **Infrastructure as Code**: um `.railway/railway.ts` com o SDK `railway`, aplicado por `railway config plan` / `railway config apply` ([infrastructure-as-code](https://docs.railway.com/infrastructure-as-code), [config-as-code](https://docs.railway.com/reference/config-as-code)) | Substitui o Terraform para a parte de cálculo, por IaC e não por `railway.json` — ver §6 |

## Decisão

**Produção corre num projecto Railway na região EU West (Amesterdão), com Postgres gerido do
Railway; os documentos ficam num bucket S3 da AWS com Object Lock. O Terraform AWS é arquivado,
excepto o armazenamento.**

### 1. Topologia: um projecto Railway, região `europe-west4-drams3a`

| Serviço Railway | O que é | Exposto |
|---|---|---|
| `erp` | A imagem de produção do `Dockerfile` (a mesma do compose, ADR-0026 §3 regra 5) | Domínio público |
| `erp-db` | Postgres gerido, com recuperação a um ponto no tempo | Só rede privada |
| `keycloak` | Contentor `quay.io/keycloak/keycloak` com versão fixada, realm importado de ficheiro (ADR-0012 §1, §7) | Só rede privada |
| `keycloak-borda` | Caddy à frente do Keycloak: só deixa passar `/realms/gespro/*` e `/resources/*` (§3) | Domínio público do Keycloak |
| `keycloak-db` | Postgres gerido próprio do Keycloak, com a mesma política do `erp-db` | Só rede privada |
| `valkey` | Contentor `valkey:8-alpine` (ADR-0014) | Só rede privada |
| `cron-<rota>` × 5 | Uma tarefa agendada por rota `/api/cron/*` — o Railway só aceita um horário por serviço (§4) | Nenhum |

**Porquê o Railway**: o que o ADR-0026 §5 pesava como alto e a equipa sente hoje é o **esforço
operacional**. Uma equipa que ainda não operou nenhum serviço em produção não opera VPC, ALB, ECS,
IAM e RDS ao mesmo tempo que lança o produto; o Railway entrega os três requisitos duros do ADR-0026
§1 — Postgres com recuperação a um ponto no tempo, contentor OCI sem estado, segredos por ambiente —
sem uma linha de Terraform de rede. O custo de saída é baixo **por construção**: as regras de
portabilidade do ADR-0026 §3 mantêm-se, a imagem é a unidade de entrega, e nada no código passa a
conhecer o Railway.

**Porquê Amesterdão**: das quatro regiões, é a única na Europa, e a hipótese de trabalho é que a Europa
está mais perto de Moçambique em rede do que Singapura ou os EUA. **É hipótese: a latência real
Maputo↔Amesterdão não foi medida** — é um dos números que o primeiro deploy produz (passo 6 da lista
[HUMANO]).

**Porquê um Postgres para o Keycloak, e não uma base dentro do mesmo serviço**: o ADR-0012 §2 pedia
«base de dados própria dentro da instância existente» para poupar uma instância RDS. No Railway cada
Postgres é um serviço com o seu próprio PITR e o seu próprio restauro; dois serviços separam o ciclo
de restauro do ERP do do Keycloak, e o ADR-0020 §1 trata-os como «um sistema, não dois» na
**política**, não na instância. Fica o requisito: os dois restauram-se para o mesmo instante.

### 2. Documentos (anexos e fiscais) em S3 externo, com Object Lock

Os documentos — anexos dos módulos e os documentos fiscais arquivados (PDF do encerramento, ADR-0035
§8) — **não vão para os Railway Buckets**. A documentação do Railway diz que os Buckets não têm
versionamento de objectos, Object Lock nem regras de ciclo de vida. Sem versionamento, um apagamento
ou uma sobreposição indevida é irreversível, que é o que o ADR-0020 §2 proíbe; sem Object Lock, um
documento que a lei manda conservar pode ser alterado por quem tiver a credencial da app; sem ciclo
de vida, o prefixo `tmp/` do ADR-0017 §2 e os envios em várias partes incompletos não expiram.

Vão para um bucket S3 da AWS provisionado pelo **módulo `infra/modules/storage`** tal como o #638 e
o #640 o deixaram:

- **Object Lock em GOVERNANCE**, retenção por omissão de **10 anos** (ADR-0020, adenda de
  2026-10-22, e ADR-0015 §4 — prazo por confirmar juridicamente);
- **réplica para uma segunda região** (`replica_region`, obrigatória em prod);
- **POST assinado com `content-length-range` e o SHA-256 do ficheiro** (ADR-0017 §1, #640); o driver
  `s3` recusa assinar sem checksum na AWS real (#643);
- **região principal e réplica na União Europeia**, para que os documentos fiquem na mesma
  jurisdição que a base de dados (escolha concreta da região: [HUMANO], no `terraform apply`).

A app chega lá pelas variáveis que já lê (`STORAGE_DRIVER=s3`, região, bucket, credenciais) — o
ADR-0017 §0 já tornou o cliente portátil, e nada muda no código.

**Credencial**: não se verificou federação de identidade dos serviços Railway com a AWS (papel IAM
assumido por OIDC). Enquanto não se verificar, o ADR-0022 §3 («credenciais por federação, não por
chaves») **não se cumpre para a app**: a credencial é uma chave de acesso de
um utilizador IAM dedicado, com a política mínima do módulo (sem `BypassGovernanceRetention`),
guardada como variável selada do serviço `erp` e rodada [HUMANO]. Cumpre-se para o `terraform apply`
do storage, que continua a correr no CI com OIDC.

### 3. Keycloak

Mantém-se tudo o que o ADR-0012 decidiu e não depende de fornecedor: auto-alojado, versão fixada,
`start --optimized`, realm como código, cadência trimestral. O que muda é só onde:

- **Comunicação ERP→Keycloak pela rede privada** do Railway (`KEYCLOAK_ISSUER_INTERNO`); o domínio
  público (servido pelo `keycloak-borda`) existe porque os fluxos de recuperação por auto-serviço (ADR-0029 §5, ADR-0030)
  levam o browser lá.
- **Consola de administração não pública** (ADR-0012 §4): o domínio público do Keycloak não serve
  `/admin`. **D2 — resolvido pelo #664 (proxy de borda)**: o `keycloak` não tem domínio público; o
  `keycloak-borda` (Caddy) é o único caminho de fora e só deixa passar `/realms/gespro/*` e
  `/resources/*` — `/admin`, `/realms/master/*` e o resto não chegam ao Keycloak. A prova em produção
  é [HUMANO]: um pedido a `/admin` pelo domínio público que não pode devolver a consola.
- **Realm de produção sem utilizadores de demonstração** (#572): o `realm-gespro.json` traz
  `@demo.mz` e `plataforma@gespro.mz`/`demo1234`; produção importa uma variante sem eles. O defeito
  que impedia importar o realm numa base Postgres — a descrição do papel `plataforma-admin` excedia o
  `varchar(255)` da coluna — está corrigido no #650.
- **Base própria**: o Keycloak usa o serviço `keycloak-db` (§1), não uma base dentro do Postgres
  do ERP — desvio ao ADR-0012 §2, registado nas Consequências.

### 4. Agendador: tarefa agendada nativa do Railway

O contrato de `docs/runbooks/agendador.md` mantém-se inteiro — **rota, método `GET`, cabeçalho
`Authorization: Bearer <CRON_SECRET>`, horário em UTC**. Muda só quem chama: **cinco serviços `cron-<rota>`**, um
por rota, em vez do contentor `crond` do compose — o Railway só aceita um horário por serviço, e as
cinco rotas têm horários diferentes. As rotas continuam HTTP protegidas (ADR-0026 §3
regra 3); nenhum SDK do Railway entra no código. A fonte dos horários continua a ser
`infra/local/cron/crontab`, que o teste existente amarra às rotas; o horário de cada `cron-<rota>` acompanha-o.

### 5. Migrações por `preDeployCommand`, prontidão por `healthcheckPath`

- **`prisma migrate deploy` passa a ser o `preDeployCommand` do serviço `erp`** e sai do
  `docker-entrypoint.sh` (#574). Corre uma vez por deploy, nunca em concorrência entre réplicas, e se
  falhar o deploy falha **antes** de a versão nova receber tráfego — exactamente os dois primeiros
  critérios do #574. `preDeployTimeoutSeconds` dimensiona-se pela migração mais longa conhecida
  (o *backfill* de `20260919014129_exercicio_e_periodo_contabilistico`), não pela omissão.
- **Instantâneo antes da migração** (ADR-0020 §2, terceiro critério do #574): com recuperação a um
  ponto no tempo, o «instantâneo» é **o instante anterior ao `preDeployCommand`**, que o próprio
  passo regista no log (data/hora UTC e id do deploy) antes de migrar. O restauro de uma migração
  destrutiva aplicada por engano (ADR-0020 §4) é um restauro para esse instante. Não há passo de
  snapshot separado — e fica escrito que a garantia depende de a janela de PITR cobrir esse instante
  (D3).
- **`healthcheckPath: /api/ready`** no `erp`, com tempo limite de **120 s** (#665): o `/api/ready` faz
  `SELECT 1`, por isso **uma versão que não chega à base nunca recebe tráfego** — a anterior continua
  a servir. O `/api/health` continua a ser o `HEALTHCHECK` do Docker (liveness: o processo está vivo,
  sem tocar na base). Como o `healthcheckPath` só decide a activação do deploy, a sonda contínua do
  `/api/ready` é externa (§7).
- O resto do ADR-0022 §5–§6 mantém-se: imagem etiquetada pelo commit, *smoke* autenticado depois do
  deploy, migrações destrutivas em duas fases, `migrate dev` nunca.

### 6. Infrastructure as Code do Railway, e o que é consola

- **Um `.railway/railway.ts` na raiz do repositório**, escrito com o SDK `railway` e aplicado por
  `railway config plan` (rever o plano) e `railway config apply`. Compõe os serviços declarados em
  `infra/railway/servicos.ts` (#664): build, `preDeployCommand`, `healthcheckPath`, política de
  reinício, horário de cada `cron-<rota>`. É o equivalente, para o cálculo, do `terraform plan`/`apply` do
  ADR-0022 §2: o plano revê-se antes de se aplicar.
- **Porque não `railway.json` por serviço**, que foi a primeira redacção deste ADR: a documentação do
  Railway dá o Config as Code como descontinuado — «New services cannot opt into Config as Code», e os
  ficheiros deixam de ser lidos a 2026-12-01
  ([config-as-code](https://docs.railway.com/reference/config-as-code),
  [infrastructure-as-code](https://docs.railway.com/infrastructure-as-code)). Serviços novos — e
  todos os do §1 o são — já não o podem usar; e mesmo que pudessem, a configuração deixava de
  valer cinco semanas depois do primeiro deploy.
- **O que o IaC não declarar fica na consola** — tipicamente a criação do projecto, a activação do
  PITR, os **valores** dos segredos (nunca no repositório), domínios, webhooks e monitores — e vive num
  **runbook de deploy** passo a passo,
  com quem o fez e quando (o mesmo princípio do bootstrap do ADR-0022: o passo manual é um só, e está
  escrito).
- **Terraform AWS arquivado, excepto o storage**: `infra/live/*` e `infra/modules/*` saem do caminho
  (App Runner, RDS, VPC, Secrets Manager, CloudWatch); fica uma stack mínima que só instancia
  `infra/modules/storage`, com o seu `terraform test` no CI. Arquivar não é apagar: o código fica no
  repositório, legível, para o caso de o Railway falhar (ADR-0026 §4, mesmo raciocínio).

### 7. Alertas e telemetria

Divide-se pelo que cada camada consegue ver:

| O que falha | Quem vê | Destino |
|---|---|---|
| Deploy `Failed`, serviço `Crashed` (qualquer serviço) | **Webhook de projecto** do Railway | Canal de serviço |
| CPU, RAM, disco (volume do Postgres inclusive) | **Monitores** do Railway (plano Pro) | Canal de serviço, via webhook |
| Registos, métricas, traces da aplicação | **OTLP** para um destino a escolher (ADR-0019 §1) | Decisão aberta (D4) |
| **`/api/ready` a 503** (ERP de pé, base inacessível — o caso que o critério do #576 testa) | **Ninguém, no Railway**: o `healthcheckPath` é verificação de activação do deploy, não sonda contínua, e o serviço não está `Crashed` | Ver abaixo |
| **Tarefa agendada que falha ou não corre** | **Ninguém, no Railway**: uma corrida que recebe 500 termina normalmente | Ver abaixo |
| Keycloak indisponível | Webhook (`Crashed`) se o contentor cair; ninguém se ficar de pé sem responder | Igual a `/api/ready`, sobre o endpoint de saúde do Keycloak |

As duas linhas «ninguém» são o que o #576 pede e o Railway não dá. **Proposta**, e decisão aberta
(D5) por não haver uma opção óbvia sem escolher o destino OTLP primeiro:

- **Monitor externo de disponibilidade** sobre `https://<domínio>/api/ready` (e o equivalente do
  Keycloak), de mais de uma localização, com alerta ao fim de ~3 minutos — é o que o health check do
  Route 53 fazia na adenda do ADR-0019.
- **Sinal de vida («dead man's switch») para o agendador**: o comando de cada `cron-<rota>` faz a chamada
  e, **só com resposta 200**, faz um pedido a um URL de sinal de vida; o serviço externo alerta quando
  o sinal não chega dentro do horário mais uma margem. Cobre ao mesmo tempo «falhou» e «não correu»,
  que é a distinção que o `agendador.md` diz que um agendador parado esconde. Fica no script dos
  `cron-<rota>`, não na aplicação — nenhum SDK novo (ADR-0026 §3).
- **Preferência**: se o destino OTLP (D4) tiver verificações sintéticas e regras sobre registos (é o
  caso da Grafana Cloud que o ADR-0019 §1 nomeia), as duas coisas fazem-se lá, reaproveitando as
  regras de `infra/local/observabilidade/alerts/` — um fornecedor de alertas, não dois. Se não tiver,
  um serviço de monitorização externa com monitores HTTP e sinais de vida faz as duas.

O critério do #576 — `/api/ready` a 503 durante 5 minutos chega ao canal de serviço em ≤ 10 minutos
— mantém-se como prova, e é um ensaio [HUMANO].

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Railway + S3 com Object Lock para documentos** ✅ | Esforço operacional mínimo; PITR gerido; migração por `preDeployCommand` e prontidão por `healthcheckPath` sem orquestração nossa; o storage reutiliza um módulo já escrito e testado | Dois fornecedores; credencial de chave longa para o S3; uma região só; o Railway não alerta sobre a saúde da aplicação |
| AWS com o Terraform existente | Já escrito e revisto; um fornecedor só; federação OIDC; multi-AZ | Nunca correu; falta Keycloak, Valkey e agendador (#572); a equipa passa a operar VPC, ALB, IAM e RDS antes de ter clientes — o fardo que o ADR-0012 já temia |
| Railway com Railway Buckets para documentos | Um fornecedor só; uma factura | Sem versionamento, Object Lock nem ciclo de vida (documentação do Railway): documentos fiscais alteráveis e apagamentos irreversíveis. Contradiz o ADR-0020 §2 |
| Outro S3 compatível com retenção (R2, B2…) | Possivelmente mais barato | O módulo `storage` é AWS; reescrevê-lo e voltar a provar Object Lock e réplica é trabalho que o #638 já fez. Avaliável mais tarde, sem tocar no código |
| Fly.io / Render | Semelhantes ao Railway em esforço | Não foram a escolha do humano; nenhum número do ADR-0026 §5 os favorece contra o Railway |
| Esperar pelos três números do ADR-0026 §5 | Decidir com dados | O próprio 0026 avisa que adiar demais passa a evitamento; cinco issues de gravidade A esperam por um alvo |

## Consequências

### Fecha ou desbloqueia

- **#574** fica resolvido por desenho (§5); a execução é a fatia do IaC do Railway (`.railway/railway.ts`) e do entrypoint.
- **#577** não depende do fornecedor, mas passa a ter alvo: a imagem que o CI constrói é a que o
  Railway publica.
- **#572** fica resolvido na parte de infraestrutura (Keycloak, Valkey e agendador como serviços).
  A validação de `process.env` no arranque e o `withCron` com tranca consultiva **não** são decididos
  aqui — continuam no #572.
- **#575** fica resolvido na parte de documentos (§2) e de PITR (§1); o ensaio contra produção
  continua [HUMANO].
- **#576** fica **parcialmente** resolvido: plataforma por webhooks e monitores; aplicação por OTLP e
  monitor externo, com D4 e D5 abertos.
- O agente `w8-provisionamento`, parado à espera deste ADR, pode ser lançado depois de o ADR ser
  aceite.

### Desvios assumidos face aos ADRs anteriores

- **ADR-0020 §1 — RTO em falha de zona de 30 minutos**: não se verificou que o Postgres do Railway tenha
  failover entre zonas configurável por nós. Esse objectivo **não se promete**; vale o RTO de 4 horas por restauro. Se um
  cliente o exigir, é um ADR novo.
- **ADR-0020 §2 — retenção de 35 dias**: depende da janela de PITR que o plano do Railway der (D3). Se
  for menor, regista-se o número real, não o desejado.
- **ADR-0022 §2–§3 — Terraform no CI com OIDC**: só para o storage. O cálculo é o IaC do Railway (`.railway/railway.ts`) mais
  consola com runbook.
- **ADR-0012 §2 — base do Keycloak na mesma instância**: passa a serviço Postgres próprio (§1).

### Riscos e decisões abertas

- **D1 — Residência dos dados.** A base de dados, a identidade e os documentos ficam na União
  Europeia (Amesterdão e uma região AWS da UE), fora de Moçambique. A investigação já feita diz que a
  Lei n.º 3/2017 **não** tem regime de transferência internacional nem obrigação de localização
  (`docs/research/acesso-suporte-b2b.md` §2.3), mas que a Convenção de Malabo vigora e o seu art. 14
  n.º 6 exige nível adequado de protecção no destino (`docs/research/mocambique-quadro-legal.md`), e
  que o art. 65 n.º 3 da Lei 3/2017 responsabiliza o processador pelo que transfere a terceiros —
  aqui, o Railway e a AWS são subprocessadores. **A pergunta vai ao mesmo parecer do #55**, que hoje
  trata do acesso de suporte (art. 64) e não da localização; tem de lhe ser acrescentada. Até lá, a
  escolha é um risco declarado, não uma conformidade verificada.
- **D2 — Consola do Keycloak** (§3): resolvido pelo #664 (proxy de borda `keycloak-borda`); prova em
  produção [HUMANO].
- **D3 — Janela de PITR do Railway**: confirmar no plano contratado a retenção e a granularidade, e
  se cobre a base do Keycloak da mesma forma. Condiciona o RPO de 5 minutos e os 35 dias do ADR-0020.
- **D4 — Destino OTLP**: por escolher (ADR-0019 §1 nomeava Grafana Cloud como candidato). Novo
  segredo (chave de ingestão) no serviço `erp`.
- **D5 — Alertas de `/api/ready` e do agendador** (§7): mecanismo por escolher; depende de D4.
- **Dois fornecedores no caminho crítico** — Railway e AWS S3 — e um terceiro se D5 for um serviço de
  monitorização externa. Duas facturas, duas consolas, dois sítios onde uma credencial pode vazar. O
  S3 só fica no caminho dos documentos: uma AWS em baixo impede anexar e descarregar, não impede
  facturar.
- **Custo**: o plano **Pro** do Railway é necessário para os monitores; o custo real aos 10, 50 e 200
  tenants (a grelha do ADR-0026 §5) continua por medir, e mede-se a partir da primeira factura.
- **Uma região só**: Railway e PITR numa região; a réplica do S3 protege os documentos, não serve a
  aplicação. «Região inteira em baixa — não coberto» (ADR-0020 §4) mantém-se.
- **A decisão foi tomada sem os três números do ADR-0026 §5.** É deliberado e fica dito: o
  peso foi dado ao esforço operacional, e o custo de saída é baixo porque as regras de portabilidade
  continuam em vigor.

### [HUMANO] — o que só uma pessoa com a conta pode fazer

1. Criar o projecto Railway na região `europe-west4-drams3a` e os serviços do §1.
2. Activar o PITR nos dois Postgres e confirmar a janela (D3).
3. Definir variáveis e segredos de cada serviço (lista do #572 mais as do storage e do OTLP).
4. Domínio próprio e TLS do `erp` e do Keycloak.
5. `terraform apply` da stack de storage (região UE, réplica) e criação da chave IAM da app.
6. Primeiro deploy e *smoke* autenticado; medir a latência Maputo↔Amesterdão.
7. Ensaio de restauro cronometrado contra produção, das duas bases para o mesmo instante (ADR-0020 §3).
8. Ensaio sintético do alerta (`/api/ready` a 503 durante 5 minutos → canal de serviço em ≤ 10 min).
9. Instruir o parecer jurídico (D1, junto com o #55).
10. Aceitar este ADR — marcar `Aceite` é um acto humano.
