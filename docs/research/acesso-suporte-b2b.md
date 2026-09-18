# Acesso de suporte aos dados do cliente — prática de SaaS B2B e obrigações legais em Moçambique

- **Estado**: Investigação. **Não é uma decisão** e não substitui nenhum ADR.
- **Data**: 2026-09-11
- **Origem**: issue #49 de `fxavier/gespro-frontend`
- **Destino previsto**: `docs/research/acesso-suporte-b2b.md`
- **Relacionados**: [ADR-0011 §5](../decisions/ADR-0011-fronteira-autorizacao.md) (impersonação rejeitada,
  identidade de suporte por incidente) · [ADR-0015](../decisions/ADR-0015-auditoria-documentos-financeiros.md)
  (trilho de auditoria dos documentos financeiros) · `CONTEXT.md` §«Acesso de suporte»

## Sumário

A **Parte 1** é matéria resolvida na indústria: há vocabulário estável, implementações públicas de
referência, e a distância entre um fornecedor sério e um fornecedor descuidado lê-se directamente nas
páginas de documentação de cada um.

A **Parte 2** não é matéria resolvida. **Moçambique não tem, à data deste documento, lei geral de
protecção de dados pessoais em vigor.** A proposta existe e está na Assembleia da República. Isso não
significa ausência de obrigações — significa que as obrigações que hoje vinculam o GestPro não são de
protecção de dados no sentido europeu, mas de **sigilo, guarda e conservação da escrituração
mercantil**, e de **não aceder a bases de dados para conhecer dados pessoais de terceiros**. São
regimes diferentes, com lógicas diferentes, e tratá-los como se fossem RGPD produz conselhos errados
nos dois sentidos: obrigações inventadas onde não existem, e obrigações reais ignoradas porque não
se parecem com as europeias.

### Escala de confiança

| Nível | Significado |
|---|---|
| **OFICIAL** | Texto legal publicado (Boletim da República), sítio de organismo público, documentação do próprio fornecedor. |
| **SECUNDÁRIA** | Terceiro reputado — escritório de advogados, imprensa especializada, organismo internacional. |
| **FRACA** | Blogue, fórum, glossário comercial. Serve para vocabulário, não para facto. |
| **NÃO VERIFICADO** | Encontrado mas não confirmado na fonte primária. Sempre marcado. |

---

## Parte 1 — Como o SaaS B2B resolve isto hoje

### 1.1 Os seis padrões, pelo nome que a indústria usa

| Padrão | O que é | Custo de construção | O que compra em confiança | Efeito na capacidade de resposta |
|---|---|---|---|---|
| **Break-glass access** | Conta ou elevação de emergência, tipicamente auto-aprovada, com registo reforçado e revisão obrigatória *a posteriori*. Não pede autorização ao cliente — presta contas depois. | **Baixo.** Uma conta, um procedimento escrito, um alerta. Dias. | Pouca por si só. Só vale se a revisão posterior existir e for visível. | Nenhum atrito. Foi desenhado para não ter atrito. |
| **Time-boxed / just-in-time (JIT)** | O privilégio não existe em repouso: é criado no momento do pedido e expira sozinho. Forma extrema: *zero standing privileges* (ZSP). | **Médio.** Provisionamento e desprovisionamento automáticos, e um relógio em que se confie. Semanas. | Muita, e é auditável: «não temos contas permanentes nos vossos dados» verifica-se. | Atrito pequeno e constante — minutos por incidente. |
| **Consent-based** | O cliente concede explicitamente, por período determinado, a partir da sua própria consola. Sem concessão, não há acesso. | **Médio.** Um ecrã de administração, modelo de concessão com validade, revogação, e o caminho de negação a funcionar de verdade. | Muita. É o único padrão em que o cliente tem um botão. | Atrito **variável e potencialmente grande** — depende de o cliente responder. É aqui que o suporte fica bloqueado. |
| **Customer-visible access logs** | O cliente vê, no seu próprio ambiente, quem do fornecedor acedeu, quando, a quê e ao abrigo de que bilhete. | **Médio-alto.** Obriga a que todo o acesso passe por um caminho instrumentado e a que o registo seja legível pelo cliente. | **A maior de todas por unidade de esforço**, e a mais difícil de simular. | **Nenhum.** Não bloqueia — regista. Melhor relação confiança/atrito de toda a tabela. |
| **Two-person approval** (dual control, quatro olhos) | Um segundo trabalhador do fornecedor aprova o acesso do primeiro. Interno; não envolve o cliente. | **Baixo-médio.** Pode viver no fluxo de bilhetes. Dias a semanas. | Média. Protege contra o técnico isolado e malicioso, não contra o fornecedor. | Atrito interno — depende de um colega, não do cliente. Compatível com turnos. |
| **Full impersonation** («log in as user») | O técnico assume a sessão de um utilizador do cliente e fica indistinguível dele no sistema. | **Baixo** para construir — é a razão pela qual é tão comum. **Alto** em consequência. | Negativa, se o trilho não distinguir o técnico do cliente. | Máxima. É por isso que sobrevive. |

**Nota de vocabulário.** JIT é «conceder permissões só quando necessárias, por tempo limitado, com
revogação automática»; ZSP, cuja origem é atribuída à Gartner, é a variante em que *nenhuma*
identidade tem privilégio elevado em repouso; *break-glass* é a elevação de emergência com registo
reforçado. Fonte: glossários comerciais convergentes (IBM, Palo Alto Networks, BeyondTrust, Delinea)
— **FRACA** individualmente, aceitável no conjunto **apenas para fixar vocabulário**. Nenhum destes
três termos tem definição normativa numa publicação NIST dedicada; a ligação ao NIST SP 800-207
(Zero Trust Architecture) é ao princípio de decisão dinâmica de acesso, não aos termos. **Não
escrever «segundo o NIST» a propósito destes três termos.**

### 1.2 O que os fornecedores nomeados documentam

| Fornecedor | Padrão | Detalhe verificado | Confiança |
|---|---|---|---|
| **Atlassian Cloud** | **Consent + time-box + log visível ao cliente — os três bons ao mesmo tempo** | Concessões geridas em `admin.atlassian.com` → site → Settings → **Support access**: o admin aprova pedidos pendentes (em lote) ou **revoga** («Revoke data access» — o engenheiro perde acesso imediatamente). Quem concede tem de ter papel sobre o produto do bilhete. E, decisivamente: **«every action a Support engineer takes is logged»**, visível ao cliente em Security → **Audit log**, filtrável por `Actor = username@atlassian.com` ou pela janela do bilhete, com acção, recurso afectado e carimbo temporal. Prazos: no **Statuspage**, contactar o suporte vale como consentimento por **7 dias**; concessão para ver uma página específica, **24 h**; o engenheiro recebe a concessão em ~30 s. | OFICIAL. `support.atlassian.com/atlassian-cloud/kb/atlassian-cloud-support-data-access-request-faq/` e `support.atlassian.com/statuspage/docs/customer-data-access-grants-information/`. **Ressalva**: as páginas não renderizaram na obtenção directa; o conteúdo vem da indexação dessas páginas oficiais. Reconfirmar os prazos antes de os citar num ADR. |
| **Microsoft** — Customer Lockbox (M365 / Purview) | Consent-based, pedido a pedido | Pedido expira em **12 h** sem aprovação; janela máxima concedida ao engenheiro: **4 h**. Exige **E5** ou add-on de compliance. Cobre Exchange Online, SharePoint, OneDrive, Teams, Windows 365. | OFICIAL — `learn.microsoft.com/en-us/purview/customer-lockbox-requests` |
| **Microsoft Azure** — Customer Lockbox | Consent-based | O pedido fica na fila do cliente **4 dias**; findo o prazo expira e não há acesso. | OFICIAL — `learn.microsoft.com/en-us/azure/security/fundamentals/customer-lockbox-overview` |
| **Microsoft Power Platform / Dynamics 365** | Consent-based | A documentação **admite o custo por escrito**: o engenheiro não prossegue até o cliente aprovar, e «this approval step could cause delays in addressing the support ticket or prolonged outages». | OFICIAL — `learn.microsoft.com/en-us/power-platform/admin/about-lockbox` |
| **Google Cloud** | **Access Transparency** (log visível) + **Access Approval** (aprovação prévia) | Access Transparency regista as acções do pessoal Google sobre dados do cliente, **no Cloud Logging do próprio cliente**. Access Approval permite aprovar ou negar antes do acesso. Combinados dão a cadeia auditável **bilhete → pedido → aprovação → acesso**. Exige nível de suporte Standard, Enhanced ou Premium. | OFICIAL — `cloud.google.com/security/products/access-transparency`, `docs.cloud.google.com/assured-workloads/access-approval/docs` |
| **Zendesk** | Consent-based com prazo — **Account Assumption** | **Desligado por omissão**; ligado por admin de Support/Chat em Admin Center → Account → Security → Advanced. Concede-se por período determinado **ou indefinidamente**; desactiva-se automaticamente no fim do prazo; revogável a qualquer momento. **E-mail a todos os administradores** sempre que é activado. Contas de avaliação têm-no sempre ligado. | OFICIAL — `support.zendesk.com/hc/en-us/articles/4408824477082` |
| **Salesforce** | Consent-based — «Grant Account Login Access» | Duração escolhida numa *picklist* (dias/semanas/meses/anos), **máximo 1 ano**; a contagem começa na concessão. Por omissão os administradores da própria empresa entram sem acção do utilizador — configurável por *Login Access Policies*. | OFICIAL — `help.salesforce.com` (`granting_login_access.htm`, `controlling_login_access.htm`) |
| **Odoo** (ERP) | **Impersonação com credencial separada. Sem consentimento, sem log ao cliente.** | «Odoo helpdesk staff may sign into your account to access settings related to your support issue. For this they use their own special staff credentials, not your password»; «we can audit and control staff actions separately». O trilho é interno da Odoo — o cliente não tem botão nem registo. | OFICIAL — `odoo.com/security` |
| **Sage** (ERP/contabilidade) | **Nenhum mecanismo documentado** | O Trust Center descreve o programa de segurança; o «Remote Support» descreve o técnico a resolver com o cliente presente. **Não documenta** consentimento por prazo nem registo visível ao cliente. | OFICIAL quanto à ausência — `trust.sage.com`, `sage.com/en-us/remotesupport/` |
| **Vanta** | Controlos internos documentados; **sem** mecanismo virado ao cliente | Information Security Addendum: RBAC, menor privilégio, separação de funções, desprovisionamento em **1 dia útil** após cessação, lista actualizada de quem tem acesso a informação de clientes, aprovação formal por pedido, auditoria de acessos pelo menos **anual**. Subprocessadores em `trust.vanta.com/subprocessors`. | OFICIAL — `vanta.com/legal/information-security-addendum` |
| **Stripe** | **Não encontrada** política pública sobre acesso do pessoal Stripe à conta do cliente | A documentação pública cobre o cliente conceder acesso à **sua própria equipa** e a plataformas Connect — não o inverso. A ausência de página pública é, ela própria, o achado. | NÃO VERIFICADO — procurado em `support.stripe.com` e `docs.stripe.com` sem resultado directo |
| **Datadog** | **Não encontrado** mecanismo de concessão ao suporte virado ao cliente | A documentação cobre RBAC, papéis geridos, *restricted datasets*, chaves com âmbito — controlo do cliente sobre os seus utilizadores, não sobre o pessoal Datadog. | NÃO VERIFICADO — procurado em `docs.datadoghq.com` sem resultado directo |

**Leitura da tabela.** Há três escalões visíveis. No topo, Atlassian, Google e Microsoft, que dão ao
cliente **consentimento, prazo e registo**. No meio, Zendesk e Salesforce, que dão **consentimento e
prazo mas não registo**. Em baixo, Odoo e Sage — ERPs, precisamente a categoria do GestPro — que dão
**nada ao cliente**: a Odoo documenta honestamente que entra e que o trilho é dela; a Sage nem isso.
Stripe e Datadog não publicam o suficiente para serem classificados.

### 1.3 O achado mais afiado da Parte 1

A documentação da própria Microsoft diz, sobre o Customer Lockbox, que **na maioria dos casos de
suporte os engenheiros diagnosticam a partir de telemetria sem precisarem de aceder a conteúdo**, e
que por isso o Lockbox raramente dispara em operação normal (OFICIAL —
`learn.microsoft.com/en-us/power-platform/admin/about-lockbox`).

Isto reordena o problema. **O fluxo de aprovação não é a peça cara nem a que mais atrasa — é a
excepção.** A peça que faz o trabalho todos os dias é a observabilidade: registos estruturados,
traços e painéis que expliquem o incidente sem tocar nos dados do cliente. Um fornecedor com
telemetria decente precisa de acesso a conteúdo poucas vezes por ano; um sem ela precisa dele todas
as semanas — e acaba por construir impersonação para sobreviver. **A impersonação é, quase sempre,
um sintoma de má observabilidade, não uma escolha de produto.**

É exactamente a posição já tomada no ADR-0011 §5 («por omissão, o suporte trabalha a partir dos
registos estruturados, traços e painéis da Fase 1, e de partilha de ecrã com o cliente»). A
investigação confirma-a como prática dominante entre os fornecedores que documentam bem — e não como
economia de esforço.

### 1.4 Onde o GestPro está, medido contra estes padrões

| Padrão | Estado no GestPro | Fonte no repositório |
|---|---|---|
| Break-glass | **Existe, informalmente.** Identidade `suporte+<slug>@gestpro.mz` com papel `LEITURA`, criada por incidente, desactivada ao fechar. Não há procedimento escrito de revisão posterior. | `ADR-0011` §5, `CONTEXT.md` |
| Time-boxed / JIT | **Parcial.** É temporária por convenção humana, não por mecanismo — nada a expira sozinha. | `ADR-0011` §5 |
| Consent-based | **Não existe.** O cliente não é informado nem consultado; não há ecrã onde conceda ou revogue. | — |
| Customer-visible access logs | **Não existe.** O `AuditLog` (`apps/erp/prisma/schema/auth.prisma:85`) tem `tenantId, userId, requestId, keycloakSub, action, entity, entityId, data, ip, createdAt` — **sem campo para «acto de suporte» nem para o bilhete que o justificou**, e sem superfície que o mostre ao cliente. | `apps/erp/prisma/schema/auth.prisma` |
| Two-person approval | **Não existe.** | — |
| Full impersonation | **Rejeitado por decisão**, apesar de o Keycloak o ter pronto, porque o `AuditLog` gravaria o `userId` do cliente por acto do técnico. | `ADR-0011` §5 |

A lacuna mais barata de fechar é a dos *customer-visible logs*. Como o acesso já se faz por Identidade
própria e não por impersonação, **o autor no `AuditLog` já é o técnico**. Falta (a) tornar essa
Identidade reconhecível como sendo de suporte e (b) mostrá-la ao cliente. É um campo e um ecrã, não
uma arquitectura.

**A Atlassian mostra que este é o desenho certo**: o seu registo visível ao cliente filtra-se por
`Actor = username@atlassian.com` — o domínio do e-mail do técnico é o que separa o acto do fornecedor
do acto do cliente. A convenção `suporte+<slug>@gestpro.mz`, já fixada no ADR-0011 §5, dá ao GestPro
a mesma chave de filtragem sem trabalho adicional de modelação.

---

## Parte 2 — Obrigações legais em Moçambique

> Aviso metodológico, e é o mais importante deste documento: **onde não encontrei regime moçambicano,
> escrevi que não encontrei.** Nenhuma passagem desta secção transpõe RGPD, POPIA ou qualquer outro
> regime estrangeiro para Moçambique. As poucas referências a direito estrangeiro estão marcadas como
> **[COMPARAÇÃO]** e não são direito aplicável.

### 2.1 Protecção de dados pessoais: não há regime geral em vigor

**Moçambique não tem lei geral de protecção de dados pessoais em vigor à data de 2026-09-11.**

⚠️ **Esta afirmação tem uma qualificação por resolver.** Moçambique ratificou e depositou a Convenção
de Malabo (§2.7), que obriga os Estados Partes a ter um quadro de protecção de dados. Se a Convenção
vigorar na ordem interna nos termos do art. 18 da Constituição, parte desse regime pode já vincular
por via de tratado. Não afirmo que vincule; afirmo que **não há lei interna** e que a via do tratado
está em aberto e carece de parecer.

| Facto | Fonte | Confiança |
|---|---|---|
| O Conselho de Ministros aprovou, na 6.ª Sessão Ordinária de **3 de Março de 2026**, a **Proposta de Lei que estabelece o Regime Jurídico de Protecção de Dados Pessoais**, para submissão à Assembleia da República. Aplica-se a entidades públicas e privadas e a tratamentos em suporte físico e informático, realizados em território nacional ou por entidades sujeitas à jurisdição moçambicana. | `intic.gov.mz/proposta-de-lei-de-proteccao-de-dados-pessoais-segue-para-debate-na-assembleia-da-republica/` | OFICIAL |
| A proposta foi elaborada pelo **INTIC**, com consulta pública aberta a **5 de Setembro de 2025**, e apoio técnico do Conselho da Europa, União Africana, Brasil e EUA. Inspira-se no RGPD, na Convenção 108+ e na Convenção de Malabo. | `intic.gov.mz`, `aimnews.org/2025/09/06/…`, `noticias.mmo.co.mz` | OFICIAL (INTIC) + SECUNDÁRIA (imprensa) |
| Está **em discussão na Assembleia da República, a aguardar votação final**. Não encontrei publicação no Boletim da República. | Verificação negativa minha | — |

**Consequência prática**: quem hoje vender ERP em Moçambique **não tem** obrigações de encarregado de
protecção de dados, avaliação de impacto, notificação de violação em 72 horas, base de licitude,
direito ao apagamento, ou contrato de subcontratação nos moldes do art. 28.º do RGPD. Nada disso é
direito moçambicano. **[COMPARAÇÃO]** Essas figuras são europeias; a proposta moçambicana importa
várias delas, mas uma proposta não vincula ninguém.

**Consequência de planeamento**: a proposta está inspirada no RGPD e pode ser aprovada dentro do
horizonte de vida deste produto. Construir hoje o que a proposta vier a exigir é prudente — desde que
se diga, no ADR que o decidir, que se está a **antecipar** e não a **cumprir**.

### 2.2 O que está efectivamente em vigor: o quadro que o próprio INTIC invoca

O INTIC publicou a sua própria lista do que hoje protege dados pessoais em Moçambique. Vale como
declaração oficial de que **não há mais nada**.

| Instrumento | Conteúdo relevante |
|---|---|
| **Constituição da República, art. 71** | Proíbe o uso da informática para registo e tratamento de dados individualmente identificáveis relativos a convicções políticas, crenças religiosas ou filiação partidária. Âmbito estreito; não é um regime geral. |
| **Lei n.º 3/2017, de 9 de Janeiro** — Lei das Transacções Electrónicas (LTE), Capítulo IX | O núcleo do que está em vigor. Ver §2.3. |
| **Decreto n.º 67/2017** — Regulamento do Quadro de Interoperabilidade do Governo Electrónico | Arts. 8 e 17 (integridade de dados; deveres da administração pública). **Aplica-se à administração pública, não a um ERP privado.** |

Fonte: `intic.gov.mz/actual-quadro-legal-e-regulamentar-garante-a-proteccao-de-dados-pessoais-em-mocambique/` — **OFICIAL**.

### 2.3 Lei n.º 3/2017 (LTE) — o texto que mais directamente responde à pergunta

Texto extraído por mim do PDF oficial publicado pelo INTIC e pela cópia do Boletim da República
(I Série, n.º 5, de 9 de Janeiro de 2017). **OFICIAL.**

**Âmbito (art. 2)** — «A presente Lei aplica-se às pessoas singulares, colectivas públicas ou privadas
que apliquem tecnologias de informação e comunicação, nas suas actividades, nomeadamente, transacções
electrónicas ou comerciais e governo electrónico.» → **alcança um ERP SaaS privado.**

**Artigo 63 (Obrigações do processador de dados)** — os números que importam:
- **63.1** — recolha, processamento ou divulgação electrónica de dados pessoais deve ser «preciso,
  completo e actualizado, sem prejuízo da sua confidencialidade».
- **63.2** — os objectivos da recolha **e a identidade do processador de dados** devem ser
  especificados **antes** da recolha, e o uso posterior limitado aos objectivos indicados.
- **63.5** — «O processador de dados deve proteger os dados pessoais contra riscos, perdas, **acesso
  não autorizado**, destruição, utilização, modificação ou divulgação.»
- **63.6** — direitos de acesso, comunicação, fundamentação da recusa, e oposição/rectificação.

**Artigo 64 (Protecção de dados)** — citado na íntegra, porque é a norma mais directamente aplicável
à pergunta do issue e a mais desconfortável:

> «Não é permitido o acesso a arquivos, ficheiros e registos informáticos ou de bancos de dados para
> conhecimento de dados pessoais relativos a terceiros, nem a transferência de dados pessoais de um
> para outro ficheiro informático pertencente a distintos serviços ou instituições, **salvo nos casos
> estabelecidos por diploma legal ou por decisão judicial**.»

Lido à letra, o art. 64 proíbe o acesso a bases de dados para conhecer dados pessoais de terceiros e
**as únicas excepções que nomeia são a lei e a decisão judicial — o consentimento não consta**. Um
técnico de suporte que abra a base de dados de um cliente para ver a ficha de um colaborador ou de um
cliente final está, na leitura literal, dentro da hipótese da norma. **Esta é a questão que exige
advogado moçambicano** (ver §2.8): se a autorização contratual do responsável pelos dados afasta a
proibição, ou se o art. 64 tem de ser lido em conjugação com o art. 63 e com as regras gerais de
consentimento. Não é uma questão que mais leitura resolva.

**Artigo 65 (Responsabilidade do processador de dados)**:
- **65.1** — obrigação de **designar um ou mais indivíduos responsáveis** pelo cumprimento dos
  princípios do capítulo.
- **65.2** — obrigação de **colocar à disposição de qualquer pessoa** informação específica sobre as
  políticas e práticas de gestão de informação pessoal, incluindo *(a)* nome/título e endereço do
  responsável e a quem dirigir queixas, *(b)* como obter acesso à informação pessoal retida, *(c)*
  descrição do tipo de informação retida e relatório geral da sua utilização.
- **65.3** — «O processador de dados é responsável pela informação pessoal na sua posse ou guarda,
  **incluindo informação que tenha sido transferida para terceiros para processamento**.» → a
  responsabilidade segue a cadeia de subprocessadores.

**Sanções**: o art. 67(m) qualifica como contravenção «a violação do dever de protecção de dados, a
violação das obrigações do processador de dados previstas na presente Lei»; o art. 68(c) pune-a com
multa de **30 a 90 salários mínimos da função pública**. O art. 69 atribui a tramitação à entidade
reguladora.

**O que a LTE NÃO tem** — verificação negativa minha sobre o texto integral:
- **Não há** regime de transferência internacional de dados. O termo «transfronteiriço» só aparece a
  propósito de serviços de certificação (art. 61).
- **Não há** obrigação de localização de dados em território moçambicano.
- **Não há** notificação de violação de dados.
- **Não há** figura de encarregado de protecção de dados com estatuto próprio (o art. 65.1 é um
  responsável interno, sem independência nem registo).

### 2.4 Decreto n.º 70/2009 (PGC-NIRF) — o que o issue presume, e o que o decreto diz de facto

**Achado central, e corrige a premissa do issue.** Li o texto do Decreto n.º 70/2009 no Boletim da
República (I Série, n.º 50, de 22 de Dezembro de 2009, 4.º Suplemento). **O decreto tem sete artigos
e nenhum deles trata de conservação, guarda, acesso, sigilo, forma electrónica ou terceiros.**

| Artigo | Matéria |
|---|---|
| 1 | Aprovação e objecto — aprova o Sistema de Contabilidade para o Sector Empresarial (SCE), que integra o PGC-NIRF (Título I) e o PGC-PE (Título II). |
| 2 | Âmbito de aplicação — limiares de grande e média dimensão (1.275 milhões MZN de proveitos ou activo, 500 trabalhadores; 500 milhões MZN e 250 trabalhadores). |
| 3 | Exclusão — banca e seguros, sujeitos aos seus próprios planos. |
| 4 | Normalização contabilística — Organismo Regulador a criar em 180 dias. |
| 5 | Referência ao PGC (Decreto n.º 36/2006). |
| 6 | Entrada em vigor — grandes empresas, exercício iniciado em 1/1/2010; médias, 1/1/2011. |
| 7 | Disposição transitória. |

**O Decreto 70/2009 é um instrumento de normalização contabilística — adopta as NIRF/IFRS. Não é um
instrumento de guarda de registos.** Fundamentar deveres de conservação, sigilo ou acesso no
Decreto 70/2009 é fundamentá-los no diploma errado. Os deveres existem — mas vêm do Código Comercial
e da lei tributária.

Fonte: Boletim da República, I Série n.º 50, 22/12/2009 (cópia em `fracessoriasa.co.mz`, texto do BR
extraído e lido por mim). **OFICIAL** quanto ao texto; a cópia é de terceiro.

### 2.5 Código Comercial — é aqui que vivem as obrigações reais

Secção III do Livro Primeiro, Título II, Capítulo II — «Escrituração mercantil». Texto extraído e
lido por mim.

| Artigo | Conteúdo | Porque importa ao GestPro |
|---|---|---|
| **42** | «Todo o empresário comercial é obrigado a ter escrituração organizada adequada à sua actividade empresarial, que permita o **conhecimento cronológico de todas as suas operações**, bem como a elaboração periódica de balanços e inventários.» | É o dever de base. O ERP é o instrumento do cumprimento. |
| **43.3** | Os livros obrigatórios «podem ser substituídos por fichas, procedimentos contabilísticos ou outros que possibilitem a utilização de **novas técnicas de escrituração** nos termos que forem legalmente estabelecidos.» | Abre a porta ao registo informatizado. |
| **48 (Executor da escrituração)** | «1. A escrituração mercantil é efectuada pelo empresário **ou por qualquer pessoa por ele devidamente autorizada**. 2. Se o empresário comercial não efectuar directamente a sua escrituração, **presumir-se-á que concedeu a autorização** prevista no número anterior ao terceiro que a fizer.» | **A norma mais favorável ao acesso de suporte em todo o direito moçambicano que encontrei.** A intervenção de um terceiro na escrituração é admitida e a autorização é **presumida**. É a âncora jurídica de que o fornecedor de ERP precisa — mas cobre *fazer a escrituração*, não necessariamente *ver os dados pessoais lá dentro* (ver art. 64 da LTE, §2.3). |
| **49.3** | «Ocorrendo erro de lançamento na escrituração, a respectiva correcção deve ser efectuada por meio de **estorno contabilístico**.» | A regra *append-only* do GestPro **é a lei**, não uma preferência de arquitectura. Vale a pena dizê-lo assim no ADR. |
| **49.4** | Livros, correspondência e documentação «podem ser conservados sob a forma de **suporte informático**, desde que esta forma de manutenção da escrituração mercantil, incluindo os procedimentos utilizados, se conforme com os princípios de uma contabilidade ordenada.» | O ERP é forma legal de conservação. |
| **49.5** | Para ser admissível, «é necessário assegurar que a **informação arquivada fica acessível durante o período de conservação obrigatória** indicado no n.º 1 do artigo 52 e que possa **a todo o tempo ser lida ou reproduzida** com meios postos à disposição pelo empresário.» | **Obrigação de saída de dados e de legibilidade a dez anos.** Um SaaS que cesse o serviço, mude de formato ou perca a capacidade de reproduzir faz o cliente incumprir. Isto pesa mais sobre exportação, retenção e continuidade do que qualquer regra de acesso. |
| **52.1 (Obrigação de conservar)** | «O empresário comercial deve manter, **sob sua guarda e responsabilidade**, a escrituração e demais documentos correspondentes à actividade empresarial, devidamente ordenados, **durante dez anos, a partir do último assento realizado nos livros**, salvo o disposto em disposições especiais.» | Dez anos, contados do último assento. A guarda e a responsabilidade são **do empresário** — o fornecedor não as assume, mas tem de as tornar possíveis. |
| **52.2** | O dever sobrevive à cessação de actividade; passa a herdeiros ou a liquidatários. | Cancelamento de subscrição não extingue o dever do cliente. |
| **54 (Carácter secreto da escrituração mercantil)** | «1. A escrituração mercantil dos empresários **é secreta**, sem prejuízo do disposto nos números seguintes e em disposições especiais. 2. A exibição ou exame geral dos livros, correspondência e demais documentos dos empresários **só pode decretar-se** [...] nos casos de sucessão universal, suspensão de pagamentos, falência, liquidação de sociedade [...] e quando os sócios tenham direito ao seu exame directo. 3. Fora dos casos previstos no número anterior, pode ser ordenada a exibição [...] quando o empresário a quem pertença tenha interesse ou responsabilidade no assunto que justifica a exibição; **o exame restringir-se-á exclusivamente aos aspectos que tenham directa relação com a questão de que se trate**.» | **O princípio jurídico moçambicano aplicável ao acesso a dados contabilísticos é o SIGILO, e a excepção é judicial e de âmbito estritamente limitado.** O art. 54.3 é, por analogia, exactamente a regra de minimização que um bom acesso de suporte deve implementar: só o que tem relação directa com a questão. |
| **55.1** | O exame «efectuar-se-á **na empresa do empresário, na sua presença ou na de pessoa por ele indicada**, devendo ser adoptadas as medidas [...] adequadas para a devida conservação e custódia dos livros e documentos.» | O modelo legal do exame legítimo é **acesso presenciado**. A partilha de ecrã com o cliente, já prevista no ADR-0011 §5, é o equivalente digital mais próximo desta norma. |
| **56–57** | Exibição determinada pelo juiz a pedido da fiscalização ou autoridade competente, havendo fundada suspeita de acto fraudulento; a recusa faz presumir verdadeiros os factos que se pretendiam provar. | Define o canal legítimo para pedidos de autoridades. |

Fonte: Código Comercial de Moçambique (aprovado pelo Decreto-Lei n.º 2/2005, de 27 de Dezembro),
compilação em `kufunda.net/publicdocs/codigo_comercial.pdf`, texto extraído e lido por mim.
**SECUNDÁRIA quanto à cópia, OFICIAL quanto ao texto.** ⚠️ O Código Comercial foi alterado desde 2005
(nomeadamente pelo Decreto-Lei n.º 1/2018). **Confirmar a numeração e a redacção actual dos arts. 42–57
contra o Boletim da República antes de os citar num contrato ou num ADR.**

### 2.6 Lei Geral Tributária — os deveres de escrituração e os poderes de acesso da AT

Lei n.º 2/2006, de 22 de Março. Texto extraído por mim (digitalização de qualidade fraca — os números
de artigo abaixo devem ser reconfirmados).

| Artigo | Conteúdo |
|---|---|
| **102** | Poderes de inspecção. Inclui, expressamente, **«aceder, consultar e testar o seu sistema informático, incluindo a documentação sobre a sua análise, programação e execução»**. |
| **103** | Limites: «O acesso à informação protegida pelo sigilo profissional, bancário ou qualquer outro dever de sigilo é regulado pela legislação aplicável.» |
| **106.1–3** | Dever de organizar a contabilidade «de forma adequada ao apuramento do tributo e à fiscalização da contabilidade em tempo razoável»; cumprimento «completo, correcto, atempado, fundamentado e ordenado cronologicamente». |
| **106.5** | «Quando as transacções forem efectuadas no território nacional, a facturação deve ser emitida **na língua e na moeda nacional**.» |
| **106.8** | Rectificação da escrituração não pode tornar imperceptível o conteúdo originário nem deixar dúvidas sobre o momento em que foi introduzida. |
| **106.9** | «Os livros, registos e outra documentação exigida pela legislação, **incluindo a contabilidade registada por meios informáticos** e os microfilmes, devem ser conservados em boa ordem, durante o prazo previsto na legislação tributária.» |
| **106.10** | O sujeito passivo com mais de um estabelecimento deve **centralizar a escrituração** num deles, escolhido segundo critérios da legislação tributária. |
| **106.12** | Dever de emitir **e conservar** recibos, facturas e documentos equivalentes. |

**Três leituras que importam ao produto:**

1. O **art. 102** dá à Autoridade Tributária poder de aceder e testar o **sistema informático** do
   contribuinte, não apenas os seus ficheiros. Um ERP SaaS é esse sistema. Isto é um requisito de
   produto (capacidade de demonstrar o sistema a um inspector), não apenas de conformidade.
2. O **art. 106.5** confirma que **MZN e português** não são escolhas de localização do GestPro — são
   exigências legais para transacções internas.
3. O **art. 106.10** fala em centralizar a escrituração **num estabelecimento**. A norma foi escrita
   para empresas com várias lojas, não para alojamento em nuvem, e **não responde** à pergunta sobre
   onde podem viver os dados. Ver §2.7.

Fonte: Lei n.º 2/2006, cópia em `dlapiperafrica.com` (Boletim da República, I Série n.º 12, 22/3/2006).
**SECUNDÁRIA quanto à cópia** (digitalização OCR de má qualidade) — **reconfirmar números de artigo**.

### 2.7 Acesso transfronteiriço e localização de dados

**Não encontrei, em nenhum diploma moçambicano de aplicação geral, obrigação de localização de dados
nem regime de transferência internacional de dados pessoais.** Verificação negativa feita sobre o
texto integral da Lei n.º 3/2017 e sobre os artigos de escrituração do Código Comercial e da Lei
n.º 2/2006.

O que existe e limita, indirectamente:

- **Código Comercial, art. 49.5** — a informação arquivada tem de ficar **acessível e reproduzível**
  durante os dez anos. Não diz *onde*; diz que tem de estar disponível. Um alojamento estrangeiro que
  garanta isso cumpre a letra da norma.
- **Código Comercial, art. 55.1** — o exame faz-se «na empresa do empresário». Norma sobre exame
  judicial, não sobre alojamento; não deve ser esticada para requisito de localização.
- **Lei n.º 2/2006, art. 102** — a AT tem de conseguir aceder e testar o sistema. Onde ele corre não
  está regulado; que seja demonstrável, está.

**Não verificado**: regras sectoriais do **Banco de Moçambique** sobre subcontratação, computação em
nuvem e dados de instituições de crédito mantidos no estrangeiro. Existem avisos do BdM sobre
segurança informática, mas **não os li** e não os cito. Se algum cliente do GestPro for instituição
financeira, isto passa a bloqueante e tem de ser investigado em `bancomoc.mz`.

### Convenção de Malabo — Moçambique é parte, e isto merece atenção

Confirmado na lista oficial de estado do tratado da União Africana (versão de 08/07/2024):

| País | Assinatura | Ratificação/Adesão | Depósito |
|---|---|---|---|
| **Moçambique** | **29/06/2018** | **02/12/2019** | **21/01/2020** |

Fonte: `au.int/sites/default/files/treaties/29560-sl-AFRICAN_UNION_CONVENTION_ON_CYBER_SECURITY_AND_PERSONAL_DATA_PROTECTION.pdf` — **OFICIAL**, lido por mim.

**Moçambique assinou, ratificou e depositou a Convenção de Malabo.** A Convenção foi adoptada em
27/06/2014 e entrou em vigor em Junho de 2023. Moçambique está, portanto, **internacionalmente
vinculado** a um instrumento cujo Capítulo II obriga os Estados Partes a estabelecer um quadro
jurídico de protecção de dados pessoais — e ainda não o fez internamente. É precisamente essa lacuna
que a proposta de lei do INTIC vem preencher, e a documentação do INTIC diz expressamente inspirar-se
em Malabo.

**Isto abre uma questão jurídica que não é retórica.** O art. 18 da Constituição da República de
Moçambique estabelece que os tratados internacionais validamente aprovados e ratificados vigoram na
ordem jurídica moçambicana após publicação oficial e enquanto internacionalmente vincularem o Estado.
Se a Convenção de Malabo tiver sido publicada e for considerada directamente aplicável, parte do
regime de protecção de dados pode já vigorar em Moçambique por essa via, **apesar de não haver lei
interna**. Não afirmo que vigore — afirmo que a pergunta é séria e que **não a resolvo com pesquisa**.
Ver «questões que exigem advogado», ponto 7. ⚠️ Não verifiquei o texto do art. 18 da Constituição nem
a publicação da Convenção no Boletim da República.

**Lei-modelo da SADC sobre protecção de dados**: instrumento de harmonização, **não vinculativo**.

### 2.8 Síntese: o que vincula hoje quem opera um ERP SaaS em Moçambique

| Pergunta | Resposta | Norma |
|---|---|---|
| Existe regime geral de protecção de dados? | **Não.** Proposta aprovada pelo Conselho de Ministros em 3/3/2026, na Assembleia da República. | — |
| Pode o fornecedor de software mexer na escrituração do cliente? | **Sim**, e a autorização é **presumida** quando o terceiro é quem a faz. | C. Com. art. 48 |
| A escrituração é confidencial? | **Sim, é secreta por lei.** As excepções são judiciais e de âmbito limitado ao estritamente relacionado com a questão. | C. Com. art. 54 |
| Há limite ao acesso a dados pessoais em bases de dados? | **Sim, e é rígido**: não é permitido o acesso a ficheiros informáticos ou bancos de dados para conhecimento de dados pessoais de terceiros, salvo por diploma legal ou decisão judicial. **O consentimento não figura entre as excepções escritas.** | LTE art. 64 |
| O fornecedor tem de publicar uma política de dados? | **Sim.** Informação disponível a qualquer pessoa: responsável e endereço para queixas, como obter acesso, e descrição do tipo de informação retida e do seu uso. | LTE art. 65.2 |
| O fornecedor responde por subprocessadores? | **Sim**, expressamente, pela informação transferida a terceiros para processamento. | LTE art. 65.3 |
| Quanto tempo têm de durar os registos? | **Dez anos** a partir do último assento, sob guarda e responsabilidade do cliente. | C. Com. art. 52.1 |
| Podem ser electrónicos? | **Sim**, desde que acessíveis, legíveis e reproduzíveis durante todo o prazo. | C. Com. arts. 49.4, 49.5 |
| Correcções podem ser feitas por alteração do valor? | **Não — estorno contabilístico.** | C. Com. art. 49.3 |
| Os dados têm de ficar em Moçambique? | **Não encontrei tal obrigação** em diploma de aplicação geral. Não verificado quanto a regras sectoriais do BdM. | — |
| Há sanção por violar os deveres de protecção de dados da LTE? | **Sim**, contravenção punível com multa de 30 a 90 salários mínimos da função pública. | LTE arts. 67(m), 68(c) |

### 2.9 O achado mais afiado da Parte 2

Não é a ausência de lei de protecção de dados — essa é a manchete, mas é a parte fácil.

É este: **o direito moçambicano aplicável à contabilidade está construído sobre o princípio inverso
ao do acesso de suporte.** O art. 54 do Código Comercial declara a escrituração mercantil **secreta**;
o art. 55 exige que o exame legítimo se faça **na presença do empresário ou de pessoa por ele
indicada** e restrito ao que tenha relação directa com a questão; e o art. 64 da LTE proíbe o acesso
a bancos de dados para conhecer dados pessoais de terceiros com excepções que **não incluem o
consentimento**.

A prática de suporte que o ADR-0011 §5 já escolheu — partilha de ecrã com o cliente, identidade
própria, papel de leitura, âmbito mínimo — não é apenas a mais segura. **É a que mais se parece com o
modelo de acesso que a lei moçambicana desenhou.** Isso é um argumento comercial e não só técnico:
num mercado onde não há RGPD para invocar, um fornecedor que explique a sua política em termos do
art. 54 do Código Comercial fala a língua do contabilista e do advogado do cliente, e nenhum
concorrente o está a fazer — a Odoo e a Sage, verificadas na Parte 1, não documentam nada disto.

---

## O que continua por saber

### Lacunas de investigação — resolvem-se com mais leitura

1. **Convenção de Malabo — publicação interna.** O estado de Moçambique está fechado (assinada
   29/06/2018, ratificada 02/12/2019, depositada 21/01/2020). Falta saber se foi **publicada no
   Boletim da República**, o que condiciona a sua vigência interna nos termos do art. 18 da
   Constituição.
2. **Regras do Banco de Moçambique** sobre subcontratação, computação em nuvem e segurança informática
   de instituições de crédito. **Bloqueante se algum cliente for instituição financeira.** Fonte:
   `bancomoc.mz`.
3. **Prazo de conservação fiscal.** O art. 106.9 da LGT remete para «o prazo previsto na legislação
   tributária» e eu não fui a essa legislação. Confirmar nos Códigos do IVA e do IRPC e no
   Regulamento do Procedimento de Fiscalização Tributária se o prazo fiscal coincide com os dez anos
   comerciais ou se é mais curto.
4. **Regulamento de facturação / facturação electrónica.** Não investigado. Se existe regime de
   facturação electrónica com requisitos de certificação de software (como o SAF-T português ou a
   certificação da AT em Portugal **[COMPARAÇÃO]**), isso é requisito de produto, não de política de
   suporte. Verificar em `at.gov.mz`.
5. **OCAM** — Ordem dos Contabilistas e Auditores de Moçambique: deveres de sigilo profissional dos
   contabilistas e se se estendem, por via contratual ou legal, a quem opera o software.
6. **Alterações ao Código Comercial** posteriores a 2005 (Decreto-Lei n.º 1/2018 e outras). A
   numeração dos arts. 42–57 usada neste documento vem de uma compilação de terceiro e **tem de ser
   confirmada contra o Boletim da República.**
7. **Lei n.º 2/2006** — os números de artigo (102, 103, 106) vêm de uma digitalização com OCR
   deficiente. Reconfirmar.
8. **Stripe e Datadog** — não encontrei política pública de acesso do pessoal ao ambiente do cliente.
   Pode existir em documento de Trust Center atrás de pedido. Vale um contacto directo antes de
   afirmar que não existe.
9. **Atlassian** — os prazos (7 dias, 24 h) e a afirmação sobre o registo visível ao cliente vieram da
   indexação das páginas oficiais, não do seu conteúdo renderizado. Reconfirmar antes de os citar.

### Questões que exigem advogado moçambicano — mais leitura não resolve

1. **A questão central, e é mesmo uma só**: o **art. 64 da LTE** proíbe o acesso a bancos de dados
   para conhecimento de dados pessoais de terceiros «salvo nos casos estabelecidos por diploma legal
   ou por decisão judicial». **A autorização contratual do cliente — que é o responsável pelos dados —
   afasta esta proibição?** A norma não nomeia o consentimento. Se a resposta for «não afasta», então
   *qualquer* acesso de suporte a dados pessoais dentro de um tenant é ilícito em Moçambique,
   independentemente de consentimento, prazo ou registo — e o desenho do produto muda por completo.
   Se for «afasta», o desenho consent-based é válido e é o caminho. **Não se decide esta pergunta com
   pesquisa; decide-se com parecer.**
2. **O art. 48 do Código Comercial cobre o fornecedor de software?** A «autorização presumida ao
   terceiro que faça a escrituração» foi escrita a pensar no guarda-livros. Um ERP SaaS é «quem faz a
   escrituração», ou é apenas o instrumento com que o empresário a faz? A resposta determina se o
   GestPro tem âncora legal própria ou se depende inteiramente do contrato.
3. **O sigilo do art. 54 do Código Comercial vincula o fornecedor?** É um dever do empresário, ou um
   sigilo oponível a todos — incluindo a quem opera o sistema? Se for oponível, o acesso de suporte
   precisa de fundamento contratual expresso, não de cláusula genérica de prestação de serviços.
4. **Quem é o «processador de dados» da LTE no modelo SaaS?** A LTE usa «processador» e «controlador»
   sem os definir com o rigor do RGPD **[COMPARAÇÃO]**, e o art. 65 impõe deveres ao «processador».
   Se o GestPro for processador, os deveres do art. 65.1–65.3 são directamente seus, e não do cliente.
5. **Que redacção contratual satisfaz simultaneamente** o art. 48 (autorização), o art. 54 (sigilo) e
   o art. 64 da LTE (acesso a bancos de dados)? Isto é redacção de cláusula, e é trabalho de
   advogado moçambicano — não de tradução de um DPA europeu.
6. **Efeito retroactivo da futura lei.** Quando a proposta for aprovada, que regime transitório terá
   e que prazo de adaptação? Relevante para decidir se se constrói hoje ou se se espera.
7. **A Convenção de Malabo já vigora internamente em Moçambique?** Moçambique ratificou e depositou
   (§2.7). Se, nos termos do art. 18 da Constituição, a Convenção vigorar na ordem interna e for
   directamente aplicável, **existe hoje mais regime de protecção de dados do que a ausência de lei
   interna sugere** — e a conclusão principal deste documento («não há regime geral em vigor») fica
   qualificada. É a segunda pergunta mais importante de todo o documento, a seguir à do art. 64 da
   LTE, e é estritamente jurídica.

---

## Nota sobre fontes

Extraí e li directamente o texto de três diplomas — Decreto n.º 70/2009, Código Comercial (secção da
escrituração mercantil) e Lei n.º 3/2017 (Capítulo IX e capítulo sancionatório) — a partir dos PDFs
publicados, em vez de me apoiar em resumos. As citações entre aspas nas secções 2.3, 2.4 e 2.5 são
transcrições desse texto. A Lei n.º 2/2006 só estava disponível numa digitalização com OCR de má
qualidade: o sentido é seguro, os **números de artigo não são**, e estão marcados como tal.

Nenhuma afirmação sobre direito moçambicano neste documento foi inferida de direito europeu,
sul-africano ou angolano. Onde não encontrei norma, escrevi que não encontrei.
