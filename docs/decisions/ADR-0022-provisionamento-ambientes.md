# ADR-0022 — Provisionamento de infraestrutura e promoção entre ambientes

- **Estado**: Proposto
- **Data**: 2026-08-21
- **Contexto**: Spec 20 (Prontidão para Produção) · Wave 8
- **Completa**: [ADR-0005-b](./ADR-0005-infraestrutura-deploy.md), que definiu os módulos mas não o procedimento de operação
- **Relacionados**: [ADR-0012](./ADR-0012-alojamento-keycloak.md), [ADR-0020](./ADR-0020-continuidade-recuperacao.md)
- **Skills**: `engineering:architecture`, `engineering:deploy-checklist`, `terraform-aws-scaffold`

## Contexto
> **Revisto pelo [ADR-0026](./ADR-0026-adiamento-fornecedor-infraestrutura.md)** — a escolha de
> fornecedor de infraestrutura foi adiada. O que este ADR nomeia como serviço da AWS deve ler-se como
> **capacidade requerida**; a AWS é uma implementação candidata, não o plano. O ambiente de referência
> é local (Docker Compose).


O [ADR-0005-b](./ADR-0005-infraestrutura-deploy.md) definiu a infraestrutura em Terraform: *bootstrap*
do backend de estado, ambientes `dev` e `prod`, e cinco módulos — rede, base de dados, segredos,
armazenamento e aplicação. O código foi escrito e revisto, e teve quatro correcções aplicadas em
revisão.

**Nunca correu.** Não houve credenciais AWS no ambiente de desenvolvimento, e por isso não existe um
único recurso provisionado. É o item 1 da lista de bloqueadores e a origem do maior risco em aberto:
tudo o que falha em nuvem real e não falha localmente continua desconhecido.

O que o ADR-0005-b não definiu — e que é agora a parte que falta — é o **procedimento**: quem corre o
Terraform, com que credenciais, a partir de onde, com que aprovação, e como se promove uma alteração de
`dev` para `prod` sem a aplicar directamente em produção.

Com o Keycloak (ADR-0012) e o Valkey (ADR-0014) a entrarem, e com os objectivos de recuperação do
ADR-0020 a exigirem multi-AZ e instantâneos pré-migração, a superfície cresce. Definir o procedimento
antes do primeiro `apply` é mais barato do que descobri-lo a meio dele.

## Decisão

### 0. O que deste ADR vale já, e o que fica em espera

O ADR-0026 adiou a escolha de fornecedor, e com ela tudo o que neste documento é específico da AWS —
OIDC do GitHub para a AWS, papéis de IAM, `terraform apply`, ambientes `dev` e `prod` na nuvem.

**Continua a valer já**, porque não depende de fornecedor: a sequência de publicação (§5), a regra
sobre migrações e a publicação em duas fases (§6), a proibição de divergir entre ambientes por código
em vez de por variáveis (§4), e a exigência de que nenhuma publicação seja feita à mão sem registo.
Tudo isto é exercitado contra o ambiente local, com duas instâncias da aplicação — que é onde a
publicação em duas fases se prova.

**Fica em espera** o resto, até haver fornecedor.

### 1. Ordem de provisionamento — `dev` primeiro, sempre

`dev` é provisionado **antes** de `prod` existir, e passa por um **ciclo completo de destruição e
recriação, uma única vez**, para provar que o `destroy` e o `apply` funcionam dos dois lados. O
primeiro `apply` é onde aparecem os erros de permissão de IAM demasiado estreita, os limites de conta,
as dependências implícitas entre módulos e os tempos de arranque reais. Descobri-los em `dev` custa
uma tarde; em `prod` custa um incidente.

Depois desse ciclo, **`dev` fica permanente**. Não se destrói ao fim do dia: é onde se ensaiam as
actualizações trimestrais do Keycloak (ADR-0012) e os restauros de cópia (ADR-0020), e um ambiente
que se recria de cada vez não serve para nenhuma das duas coisas.

### 1-bis. Quando é que `prod` nasce

`prod` **não é criado na primeira fase**. A ordem é:

1. `dev` provisionado, exercitado, destruído e recriado uma vez.
2. A migração de identidade (ADR-0013) validada em `dev`, com E2E verdes contra Keycloak real.
3. **Só então** `prod` é criado — já com a topologia final, incluindo Keycloak e cache, e sem ter de
   provisionar duas vezes nem migrar autenticação num ambiente com clientes.
4. Promoção da aplicação a `prod`, *smoke* autenticado, e ensaio de restauro **contra `prod`**.

Provisionar `prod` antes da migração de identidade seria construí-lo para o descartar: a topologia
muda com o Keycloak, e a migração é destrutiva.

### 2. Terraform corre no CI, não em portáteis

- **`dev`**: `plan` automático em cada *pull request* que toque em `infra/`; `apply` automático ao
  fundir em `main`.
- **`prod`**: `plan` automático; `apply` **exige aprovação manual** de um ambiente protegido do
  GitHub, com o plano publicado como artefacto e revisto por uma segunda pessoa.
- Nenhum `apply` a partir de um posto de trabalho, excepto no *bootstrap* inicial do backend de
  estado — que é, por definição, anterior à existência de CI que o possa correr.

### 3. Credenciais por federação, não por chaves

O CI autentica-se na AWS por **OIDC do GitHub Actions**, com papel dedicado por ambiente e política de
confiança restrita ao repositório e à *branch*. **Zero chaves de acesso de longa duração**, no CI ou
em qualquer lado. É a extensão natural da regra de zero segredos no repositório que já vigora.

O papel de `prod` tem permissões estritamente necessárias e é distinto do de `dev`. Um erro de âmbito
num plano de `dev` não pode tocar em `prod`.

### 4. Promoção por variáveis, não por divergência de código

`dev` e `prod` consomem **os mesmos módulos**, com valores diferentes. Uma alteração é promovida ao
fundir código que ambos consomem, nunca ao editar apenas `live/prod`. Divergência entre ambientes é o
mecanismo pelo qual «funcionava em `dev`» se torna uma frase verdadeira e inútil.

Diferenças legítimas, e apenas estas: dimensão das instâncias, número de tarefas, multi-AZ (só `prod`),
retenção de cópias, e domínio.

### 5. Sequência de publicação da aplicação

1. Instantâneo manual da base de dados (ADR-0020).
2. Construir e enviar a imagem para o registo, etiquetada com o *commit*.
3. `terraform apply` se houver alteração de infraestrutura.
4. Actualizar o serviço com a nova etiqueta de imagem; o ponto de entrada aplica
   `prisma migrate deploy` no arranque.
5. Aguardar verificação de saúde; *smoke* autenticado automático contra o ambiente.
6. Em caso de falha, reverter para a etiqueta anterior. **Migrações não revertem automaticamente** —
   daí o instantâneo do passo 1.

### 6. Regra sobre migrações

`prisma migrate deploy` sempre; `migrate dev` **nunca** fora de um posto de trabalho. Migrações
destrutivas — remoção de coluna ou de tabela, como a do ADR-0013 — exigem publicação em duas fases:
primeiro o código que deixa de usar a coluna, depois a migração que a remove. Nunca no mesmo *deploy*.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Terraform no CI, OIDC, aprovação manual em `prod`** ✅ | Sem chaves de longa duração; todo o `apply` fica auditado; plano revisto antes de produção; impossível divergir do que está no repositório | Configuração inicial de OIDC e papéis não é trivial; o *bootstrap* continua a ser manual |
| `apply` manual a partir de portáteis | Simples de começar; sem CI a configurar | Estado divergente entre quem corre; credenciais em máquinas pessoais; sem auditoria de quem aplicou o quê |
| Terraform Cloud / Spacelift | Gestão de estado, política e aprovações prontas | Custo e mais um fornecedor, para benefício que o GitHub Actions com OIDC já entrega nesta escala |
| Aplicação automática também em `prod` | Entrega contínua verdadeira | Sem experiência operacional acumulada, um plano mal lido destrói uma base de dados. A aprovação manual é a rede de segurança certa para esta fase |
| CDK ou Pulumi em vez de Terraform | Infraestrutura em TypeScript, a mesma linguagem do resto | Reescrever infraestrutura já escrita e revista, sem ganho proporcional. O ADR-0005-b decidiu Terraform e a decisão mantém-se |

## Consequências

- **Novos ficheiros de fluxo de trabalho**: `infra-plan.yml` e `infra-apply.yml`, separados do `ci.yml`
  existente, com ambientes protegidos do GitHub para `prod`.
- **O *bootstrap* continua manual e é o único passo que o é.** Deve ser feito uma vez, documentado
  passo a passo em `docs/runbooks/bootstrap-infra.md`, com quem o correu e quando.
- **Os módulos do Keycloak (ADR-0012) e da cache (ADR-0014) entram neste fluxo desde o início.** Não
  há provisionamento manual de nenhum deles.
- **`prod` só é criado depois de `dev` ter completado o ciclo destruir/recriar e de a migração de
  identidade estar validada em `dev`.** É um gate explícito do plano de execução, com fase própria —
  não uma recomendação.
- **O procedimento de publicação passa a ser mais lento** — instantâneo, aprovação, *smoke*. É
  deliberado: velocidade de publicação é uma optimização que se ganha depois de haver confiança, e a
  confiança ainda não existe porque nunca se publicou.
- **A publicação em duas fases para migrações destrutivas afecta directamente o ADR-0013**, que remove
  quatro tabelas e uma coluna. Essa migração é o primeiro caso real de aplicação desta regra e deve
  servir de ensaio do procedimento.
- **Custo de `dev` permanente.** Manter um ambiente de desenvolvimento a correr custa dinheiro. A
  alternativa — provisionar sob procura e destruir — é mais barata mas perde o valor de ter um sítio
  onde ensaiar actualizações do Keycloak e restauros de cópia. Mantém-se `dev` permanente, com
  dimensões mínimas, **depois** do ciclo de destruição e recriação do ponto 1.
- **`prod` tem fase própria no plano de execução.** Uma versão anterior deste ADR deixava a criação de
  `prod` sem dono e sem momento, o que tornava impossíveis três tasks que dela dependem — multi-AZ,
  replicação inter-região e o *smoke* em produção que precede a activação da CSP estrita.
