# Registo de Decisões de Arquitectura (ADRs)

Índice dos ADRs do GestPro. Cada ADR documenta uma decisão significativa (contexto,
alternativas consideradas, decisão e consequências). ADRs são **imutáveis** depois de aceites —
uma decisão que muda é registada num **novo** ADR que *substitui* o anterior (nunca se reescreve
o histórico).

## Convenção

- **Ficheiro**: `ADR-<NNNN>-<slug>.md` (quatro dígitos, zero-padded). Os ADRs 0001–0004 usam o
  prefixo curto `<NNNN>-<slug>.md` por razões históricas; do 0006 em diante a convenção é
  `ADR-<NNNN>-<slug>.md`.
- **Numeração**: sequencial e **única**. O próximo número livre é **0031**.
- **Estado**: `Proposto` → `Aceite` → (`Substituído por ADR-XXXX` | `Descontinuado`).
- **Citação**: use sempre o identificador canónico da coluna «ADR» deste índice. Para os três
  documentos que colidem no número 0005, o identificador canónico é `ADR-0005-a`, `-b` ou `-c`
  (ver nota no fim).
- **Manutenção**: todo o ADR novo **actualiza este índice no mesmo pull request**. O teste
  `docs/decisions/__tests__/adr-index.test.ts` (ADR-0023) falha o merge se isso não acontecer.

## Índice

### Waves 0–7 — construção do sistema

| ADR | Título | Estado | Spec/Contexto |
|---|---|---|---|
| [0001](./0001-stack-e-scaffolding.md) | Stack e scaffolding | Aceite¹ | 01 — Backend foundation |
| [0002](./0002-wave0-enxuta-vs-spec01.md) | Wave 0 enxuta vs. spec 01 | Aceite¹ | 01 — Backend foundation |
| [0003](./0003-gate-wave1-arbitragens.md) | Gate Wave 1 — arbitragens | Aceite | Wave 1 |
| [0004](./0004-gate-wave2-e-plano-wave3.md) | Gate Wave 2 e plano Wave 3 | Aceite | Waves 2–3 |
| [0005-a](./0005-motor-pdf.md) | Motor de documentos PDF e formato de exportação | Aceite | 12 — Relatórios/Documentos |
| [0005-b](./ADR-0005-infraestrutura-deploy.md) | Infraestrutura & Deploy — Docker + Terraform AWS | Aceite | 16 — Infraestrutura/Deploy |
| [0005-c](./ADR-0005-observabilidade.md) | Observabilidade & Operações | Aceite | 14 — Observabilidade |
| [0006](./ADR-0006-monorepo-site.md) | Monorepo (pnpm + Turborepo) para ERP + site | Proposto | 18 — Website de Marketing |
| [0007](./ADR-0007-animacao-motion.md) | Biblioteca de animação do site (Motion) | Proposto | 18 — Website de Marketing |
| [0008](./ADR-0008-analytics-privacy-first.md) | Analytics privacy-first e Web Vitals | Proposto | 18 — Website de Marketing |
| [0009](./ADR-0009-moeda-faturacao-saas.md) | Moeda de faturação da subscrição SaaS (Stripe) | Proposto² | 19 — Onboarding/Provisionamento |

¹ Substituídos parcialmente pelo ADR-0010, na parte que fixou autenticação por `Credentials` com hash local.
² O risco fiscal em aberto é tratado pelo ADR-0021.

### Wave 8 — prontidão para produção

**Identidade — Keycloak**

| ADR | Título | Estado | Depende de |
|---|---|---|---|
| [0010](./ADR-0010-keycloak-fornecedor-identidade.md) | Keycloak como fornecedor de identidade | Proposto | — |
| [0011](./ADR-0011-fronteira-autorizacao.md) | Fronteira de autorização: Keycloak autentica, a BD autoriza | Proposto | 0010 |
| [0012](./ADR-0012-alojamento-keycloak.md) | Alojamento e operação do Keycloak | Proposto³ ⁴ | 0010 |
| [0013](./ADR-0013-migracao-identidade.md) | Migração da identidade e provisionamento de tenants | Proposto | 0010, 0011, 0012 |

**Bloqueadores comerciais e de segurança**

| ADR | Título | Estado | Depende de |
|---|---|---|---|
| [0014](./ADR-0014-cache-e-rate-limit-distribuido.md) | Limitação de tráfego distribuída e camada de cache | Proposto³ | 0010 (reduz âmbito) |
| [0015](./ADR-0015-auditoria-documentos-financeiros.md) | Trilho de auditoria dos documentos financeiros | Proposto | 0011 (correlação) |
| [0016](./ADR-0016-anti-abuso-registo.md) | Protecção anti-abuso do registo público | Proposto | 0014 |
| [0021](./ADR-0021-fiscalidade-subscricao-saas.md) | Fiscalidade moçambicana da subscrição SaaS | **Proposto — requer parecer externo** | 0009 |
| [0027](./ADR-0027-modelo-comercial-planos-limites.md) | Modelo comercial: planos, limites e ciclo de vida do acesso | Proposto | 0009, 0011, 0017, 0021 |
| [0028](./ADR-0028-ecra-de-entrada-templates-do-tema.md) | O ecrã de entrada: templates próprios no tema do Keycloak | Proposto⁵ | substitui 0012 §8 (tecto) |
| [0029](./ADR-0029-login-no-erp-direct-grant.md) | **O início de sessão volta ao ERP (Direct Access Grant)** | Proposto⁶ | substitui 0012 §8 e 0028 §2 |
| [0030](./ADR-0030-palavra-passe-inicial-atribuida.md) | **A palavra-passe inicial é atribuída pelo ERP** | Proposto | substitui 0029 §5; revê 0013 §5-bis |

**Operação e capacidade**

| ADR | Título | Estado | Depende de |
|---|---|---|---|
| [0018](./ADR-0018-desempenho-capacidade.md) | Estratégia de desempenho e capacidade | Proposto | — |
| [0019](./ADR-0019-telemetria-slo.md) | Destino da telemetria, alertas e SLOs | Proposto³ | 0005-c |
| [0020](./ADR-0020-continuidade-recuperacao.md) | Continuidade de serviço e recuperação de desastre | Proposto³ | 0005-b, 0012 |
| [0022](./ADR-0022-provisionamento-ambientes.md) | Provisionamento de infraestrutura e promoção entre ambientes | Proposto³ | 0005-b |

**Infraestrutura**

| ADR | Título | Estado | Depende de |
|---|---|---|---|
| [0026](./ADR-0026-adiamento-fornecedor-infraestrutura.md) | **Adiamento da escolha de fornecedor e ambiente local de referência** | Proposto | revê 0005-b, 0012, 0014, 0019, 0020, 0022 |

> O ADR-0026 é o que governa os quatro acima na parte de infraestrutura. Onde eles nomeiam serviços da
> AWS, lê-se **capacidade requerida**; a AWS passou a ser uma implementação candidata, e o ambiente de
> referência é local. O Terraform em `infra/live/` e `infra/modules/` fica **dormente**.

**Qualidade estrutural**

| ADR | Título | Estado | Depende de |
|---|---|---|---|
| [0017](./ADR-0017-ciclo-vida-armazenamento.md) | Ciclo de vida dos objectos no armazenamento | Proposto | — |
| [0023](./ADR-0023-governacao-documentacao.md) | Governação da documentação e numeração de ADRs | Proposto | — |
| [0024](./ADR-0024-gates-arquitectura.md) | Reforço dos gates de arquitectura | Proposto | 0015, 0023 |
| [0025](./ADR-0025-separacao-dominio-pessoas-projetos.md) | Separação do domínio Pessoas & Projectos | Proposto | 0017, 0024 |

³ Revisto na parte de infraestrutura pelo [ADR-0026](./ADR-0026-adiamento-fornecedor-infraestrutura.md).

⁴ O §8 foi substituído **duas vezes, em partes diferentes**: o tecto de personalização do tema pelo [ADR-0028](./ADR-0028-ecra-de-entrada-templates-do-tema.md), e a rejeição do *Direct Access Grant* pelo [ADR-0029](./ADR-0029-login-no-erp-direct-grant.md). Do §8 original já não vigora nada.

⁵ O §2 — que reconfirmava a rejeição do *Direct Access Grant* — foi substituído pelo [ADR-0029](./ADR-0029-login-no-erp-direct-grant.md). O resto do ADR-0028 mantém-se, mas encolhido pelo [ADR-0030](./ADR-0030-palavra-passe-inicial-atribuida.md): o tema já não serve o primeiro acesso, só a recuperação por auto-serviço.

⁶ O §5 — que deixava o primeiro acesso e a reposição no ecrã do Keycloak — foi substituído pelo [ADR-0030](./ADR-0030-palavra-passe-inicial-atribuida.md). O resto do ADR-0029 mantém-se.

## O que **não** tem ADR, e porquê

Um ADR regista uma **decisão com alternativas**. Não é um cartão de tarefa. Os itens seguintes,
identificados no documento de arquitectura, são trabalho de correcção sem decisão a tomar — vivem em
`.kiro/specs/20-prontidao-producao/tasks.md`, não aqui:

- Bug do interceptor de rota paralela que captura o segmento `novo`.
- Janelas de corrida na emissão de nota de crédito em devoluções e trocas.
- Os seis achados menores da revisão da spec 19 (campo `erro` do webhook nunca escrito, tarefa
  agendada fora do `withApi`, token de handoff em claro, login ambíguo cross-tenant — este último
  resolvido por construção pelo ADR-0010).
- Activação da CSP em modo estrito, que já foi decidida no seu momento e só falta executar.
- Migração dos formulários do módulo transporte para o padrão da casa.
- Unificação dos schemas Zod locais da spec 11.
- Registo de documentos de colaborador (consequência do ADR-0017).
- Auditoria do volume de componentes de cliente.

## Revisão 3 — infraestrutura adiada (2026-08-21)

A escolha de fornecedor de infraestrutura foi **adiada** pelo [ADR-0026](./ADR-0026-adiamento-fornecedor-infraestrutura.md).
Os ADRs 0012, 0014, 0019, 0020 e 0022 tinham nomeado serviços concretos da AWS — o que era uma
suposição, não uma decisão: o Terraform nunca correu, e não há dados de carga nem de custo que
permitam escolher com fundamento.

Três coisas tornaram o adiamento barato:

1. **O produto já é portátil.** O acoplamento à AWS resume-se a duas dependências num único ficheiro,
   e o protocolo S3 é um padrão de facto.
2. **Quase tudo é verificável localmente** — incluindo o Keycloak, a política de POST no armazenamento
   e o limitador partilhado, este último graças a correr **duas instâncias da aplicação** na pilha.
3. **Nada estava provisionado**, pelo que não há nada a desfazer.

O que o adiamento **não** resolve está escrito sem rodeios no ADR-0026: IAM, rede real, TLS, arranque
a frio, custo e latência para Moçambique continuam por saber. O risco foi adiado, não retirado — e
chega-se-lhe com tudo o resto provado.

## Errata — revisão 2 dos ADRs da Wave 8 (2026-08-21)

Os ADRs 0010–0025 foram submetidos, antes de qualquer execução, a uma **verificação prévia por agente
contra o código real**. Foram encontradas doze incoerências. Todas se confirmaram e todas foram
corrigidas; os ADRs estavam em `Proposto`, pelo que a emenda é legítima e não reescreve história.

Fica registado porque a lição é a mesma que o ADR-0024 defende: **uma decisão escrita contra a
memória do sistema, e não contra o sistema, erra**.

| # | O que estava errado | Onde ficou corrigido |
|---|---|---|
| A | ADR-0025 dizia «depois da fase 2, antes da fase 4» e o racional dizia «fase 3»; o plano dizia fase 4 | ADR-0025 §5 — **fase 5**, sozinho |
| B | ADR-0022 mandava destruir `dev` e, nas consequências, mantê-lo permanente | ADR-0022 §1 — destruir e recriar **uma vez**, depois permanente |
| C | **Nenhuma fase criava `prod`** — e três tasks dependiam dele | ADR-0022 §1-bis + **fase 3** nova no plano |
| D | O cenário k6 de autenticação media um fluxo que só existe na fase 2 | ADR-0018 §4 — duas linhas de base |
| E | `TokenVerificacaoEmail` está em `plataforma.prisma`, não em `auth.prisma`; e o ficheiro não tinha dono declarado | ADR-0013 §4 + handoff §3 |
| F | `DocumentoColaborador` **já existe**, com a forma errada — a migração não é vazia | ADR-0017 §3 — migrar, não criar |
| G | A verificação de captcha **já existe** no ERP e suporta dois fornecedores; o `?? ""` está no site | ADR-0016 §Contexto |
| H | Os campos do `AuditLog` são `action`, `entity`, `entityId`, `createdAt` — não os nomes em português que o ADR usava | ADR-0015 §3 |
| I | O gate de auditoria só cobria `financas.prisma`; metade da lista vive noutros três schemas | ADR-0015 §2 |
| J | «`auth.prisma` encolhe de 9 para 5» e listava seis; são 6 | ADR-0013 §Consequências |
| K | Retenção de cópias no código (3 em `dev`, 7 em `prod`) contraria o ADR (7 e 35) | ADR-0020 §2 |
| L | `CLAUDE.md` ainda mandava renumerar os ADRs 0005 | ADR-0023 + task 12.5 |

Menor: a tecnologia decidida no ADR-0014 é **Valkey**; «Redis» aparece apenas como nome do protocolo.

## Nota — colisão de numeração no 0005 (conhecida, não corrigível)

O número **0005** foi atribuído três vezes, em waves paralelas, a decisões distintas:

- `0005-motor-pdf.md` (spec 12) — prefixo curto;
- `ADR-0005-infraestrutura-deploy.md` (spec 16);
- `ADR-0005-observabilidade.md` (spec 14).

Os três documentos são **válidos e aceites**; apenas o número colide. Para não quebrar ligações já
existentes, os ficheiros **não** são renumerados — a colisão fica registada aqui e são desambiguados
como `0005-a/-b/-c`, que é o identificador canónico de citação. A sequência retoma limpa em 0006 e daí
em diante é estritamente única.

O [ADR-0023](./ADR-0023-governacao-documentacao.md) formaliza esta decisão e acrescenta o teste
automático que impede a repetição — a colisão aconteceu porque a numeração dependia de as pessoas
consultarem este índice, e agora não depende.
