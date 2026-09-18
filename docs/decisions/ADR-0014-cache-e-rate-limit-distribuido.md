# ADR-0014 — Limitação de tráfego distribuída e camada de cache

- **Estado**: Proposto
- **Data**: 2026-08-21
- **Contexto**: Spec 20 (Prontidão para Produção) · Wave 8
- **Relacionados**: [ADR-0010](./ADR-0010-keycloak-fornecedor-identidade.md) (reduz o âmbito), [ADR-0016](./ADR-0016-anti-abuso-registo.md), [ADR-0018](./ADR-0018-desempenho-capacidade.md)
- **Skills**: `engineering:architecture`, `api-conventions`

## Contexto
> **Revisto pelo [ADR-0026](./ADR-0026-adiamento-fornecedor-infraestrutura.md)** — a escolha de
> fornecedor de infraestrutura foi adiada. O que este ADR nomeia como serviço da AWS deve ler-se como
> **capacidade requerida**; a AWS é uma implementação candidata, não o plano. O ambiente de referência
> é local (Docker Compose).


`src/server/security/rate-limiter.ts` define uma porta hexagonal correcta — `check`, `increment`,
`consume` — com um único adaptador: **um mapa em memória, por processo**. O próprio comentário do
ficheiro diz que em produção se substitui por um adaptador Redis. Nunca foi escrito.

A consequência é concreta e não teórica. Com duas tarefas ECS a servir a aplicação, um limite de
cinco tentativas por quinze minutos torna-se dez. Com escala automática torna-se indeterminado. E
qualquer reinício — um *deploy*, uma substituição de tarefa doente — apaga a contagem. É protecção
que existe no código e não existe em produção.

O sistema também não tem **nenhuma camada de cache**. A invalidação é feita por `revalidatePath` e
etiquetas do Next.js, o que resolve a renderização mas não alivia a base de dados: cada pedido que
falha a cache do framework vai ao Postgres. Não há medição que diga se isto é um problema — o que é,
em si, o problema (ver ADR-0018).

Uma nota de âmbito importante: o ADR-0010 move o login para o Keycloak, cuja **detecção de força
bruta é nativa e persistida**. O caso de uso mais crítico do limitador — proteger o login — deixa de
ser nosso. O que sobra é menor, mas não desaparece.

## Decisão

**Introduzir Valkey como serviço partilhado, começando pelo limitador de tráfego e só depois pela cache.**

1. **Tecnologia**: **Valkey**, pela bifurcação de código aberto do Redis com governação em fundação,
   sem a incerteza de licenciamento que motivou a bifurcação. **Onde corre ficou adiado** (ADR-0026):
   localmente é um contentor `valkey:8-alpine`; em produção será um serviço gerido de protocolo Redis
   ou um contentor, consoante o fornecedor. O ElastiCache Serverless permanece como candidato — a
   facturação por consumo é a resposta honesta a não haver ainda estimativa de carga.

2. **Primeiro caso de uso: limitação de tráfego.** Novo adaptador que implementa a porta existente,
   com janela deslizante por chave. A porta **não muda de forma** — o adaptador em memória permanece
   para testes unitários e é seleccionado por variável de ambiente, como já acontece com o
   armazenamento de documentos (`STORAGE_DRIVER`).

3. **Âmbito da protecção, revisto face ao Keycloak:**

   | Superfície | Quem protege | Limite |
   |---|---|---|
   | Login | **Keycloak** (força bruta nativa) | Política do realm |
   | Recuperação de palavra-passe | **Keycloak** | Política do realm |
   | Registo público (`/api/publico/registo`) | Valkey, por IP e por domínio de e-mail | 3 / hora |
   | Verificação de e-mail | **Keycloak** | Política do realm |
   | Convites de utilizador | Valkey, por tenant | 20 / hora |
   | Exportações CSV/XLSX/PDF | Valkey, por utilizador | 10 / minuto |
   | Assinatura de URL de armazenamento | Valkey, por utilizador | 30 / minuto |

4. **Falha aberta, com alarme.** Se o Valkey estiver inacessível, o limitador **deixa passar** e
   regista erro com alerta. Um limitador em baixa não pode derrubar o produto inteiro — a excepção é o registo
   público, que **falha fechado** por ser a única superfície não autenticada e de custo real (envia
   e-mail, cria tenant).

5. **Cache: segunda fase, e só com medição.** Nenhuma chave de cache é escrita antes de o ADR-0018
   produzir números. As candidatas prováveis — árvore de contas PGC, catálogo de permissões, tabelas
   de INSS e IRPS, definições do tenant — partilham a característica de **mudarem raramente e serem
   lidas em quase todos os pedidos**, mas essa intuição tem de ser confirmada por perfil de consulta
   antes de virar código. Cache antes de medição é como se introduz um problema de invalidação sem
   ganhar desempenho.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Valkey em ElastiCache Serverless** ✅ | Sem dimensionamento a adivinhar; sem servidores; escala automática; abre caminho à cache com o mesmo serviço; API Redis conhecida | Custo por consumo difícil de prever sem dados; mais um serviço na VPC; ligação privada a modelar |
| ElastiCache com nós provisionados | Custo fixo e previsível | Exige dimensionar sem qualquer dado de carga. Sobredimensionar é desperdício; subdimensionar é incidente |
| Limitador na tabela Postgres | Zero infraestrutura nova; transaccional; é o que `LoginAttempt` já fazia | Escrita por pedido numa base de dados que não temos folga medida para carregar; sem expiração nativa, exige limpeza periódica; contaminaria a base de dados de negócio com estado efémero |
| Limitador no balanceador / WAF | Muito barato; para antes de chegar à aplicação | Granularidade de IP apenas — não distingue por tenant, por utilizador nem por domínio de e-mail, que é exactamente o que interessa aqui |
| Não fazer nada, confiar no Keycloak | Zero trabalho | O Keycloak protege login e recuperação. O **registo público** — a superfície mais exposta e a de maior custo por pedido — fica descoberto |

Racional: a resposta óbvia seria a tabela Postgres, que evita infraestrutura nova. Rejeitamo-la porque
introduz escrita por pedido numa base de dados cuja folga **não foi medida** — trocaríamos um problema
conhecido por um risco desconhecido. E porque o Valkey é a peça que também desbloqueia a cache assim que
o ADR-0018 disser onde ela é precisa; instalá-lo agora pelo caso de uso menor é pagar a infraestrutura
uma só vez.

## Consequências

- **Serviço Valkey no `docker-compose.yml`**, acessível apenas à rede interna da pilha. O módulo
  Terraform `infra/modules/cache` fica escrito mas **dormente**, como candidato (ADR-0026 §4).
- **Verificável localmente**: com **duas instâncias da aplicação** atrás de um proxy, o defeito que
  motiva este ADR — «com duas tarefas, um limite de cinco vale dez» — passa a ser um teste.
- **A porta hexagonal justifica-se retroactivamente.** Escrever o adaptador é trabalho contido porque
  a fronteira já estava desenhada — é o retorno de uma decisão tomada na Wave 5 sem ter sido usada.
- **`/api/ready` não passa a testar o Valkey.** Falha aberta significa que o produto funciona sem ele;
  fazer a sonda de prontidão depender dele derrubaria instâncias saudáveis. O estado do Valkey é
  métrica e alerta, não prontidão.
- **Nomenclatura fixada**: a tecnologia é **Valkey**. Variáveis de ambiente, nomes de serviço, de
  módulo Terraform e de métrica usam `valkey`, não `redis`. «Redis» aparece nos ADRs apenas como nome
  do protocolo e do ecossistema — não como nome de nada que se instale.
- **O teste do limitador ganha um segundo modo.** Os testes actuais exercitam o adaptador em memória e
  mantêm-se. Acrescenta-se um teste de integração com Testcontainers a exercitar o adaptador Valkey,
  no mesmo padrão já usado para o Postgres efémero.
- **Custo**: uma linha de facturação nova, por consumo. Deve ser revista no primeiro mês; se o padrão
  se estabilizar, migrar para nós provisionados é uma optimização de custo com dados — que é a ordem
  certa de fazer as coisas.
- **Fica explicitamente por decidir** onde a cache é aplicada. Este ADR autoriza a infraestrutura e o
  primeiro caso de uso; o segundo caso de uso exige os números do ADR-0018 e será registado como
  consequência desse trabalho, não como intuição.
