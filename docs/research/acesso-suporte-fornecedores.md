# Acesso de suporte: o que 25 fornecedores documentam publicamente

Complemento a [`acesso-suporte-b2b.md`](./acesso-suporte-b2b.md), recolhido por um agente
depois de aquele ter sido dado por concluído. Fecha a lacuna que o primeiro documento
deixou em aberto sobre a Stripe e a Datadog.

> **Estado de verificação.** Nada aqui foi conferido por mim contra as fontes. São páginas
> oficiais de fornecedores, citadas com URL; várias foram recolhidas através do índice de
> pesquisa porque o sítio é uma aplicação JavaScript ou está atrás de CAPTCHA — nesses casos
> o conteúdo é oficial mas a **recolha é secundária**, e está assinalado. A definição directa
> da Gartner para *just-in-time* e *zero standing privilege* não foi obtida (403).

## O achado estrutural: não há um padrão único

| Modelo | Quem o usa | Característica |
|---|---|---|
| **A — Aprovação por pedido** (*lockbox*) | Microsoft, Google, NVIDIA, Atlassian (com Guard) | O cliente aprova ou rejeita **cada** pedido. Bloqueante. |
| **B — Interruptor com prazo** | Zendesk, Okta, Zoho, Freshworks, Salesforce, SAP SuccessFactors, Cloudflare, NetSuite | O cliente liga o acesso por N tempo; expira sozinho. |
| **C — Convite manual como utilizador** | Xero, QuickBooks/Intuit | O suporte entra como utilizador normal. **Sem prazo.** |
| **D — Só política declarada** | **Stripe, Odoo, Datadog, Vanta** | Sem mecanismo, sem prazo, sem registo visível ao cliente. |

A maioria dos fornecedores de quem se presume ter «consentimento de acesso ao suporte» está
no modelo D. **A Stripe não tem interruptor nenhum** — o que existe com esse nome no seu
sítio é o comerciante a dar acesso às suas próprias mensagens de suporte, não a Stripe a
aceder à conta.

## O custo operacional, dito pelos próprios fornecedores

É raro um fornecedor documentar o preço do seu próprio controlo de segurança. Cinco fazem-no:

- **Google:** «The support response time increases by the duration that Customer Care spends
  waiting for your approval.» E recomenda cautela ao activar a aprovação em serviços que
  exijam alta disponibilidade.
- **Microsoft (Power Platform):** «This approval step could cause delays in addressing the
  support ticket or prolonged outages.»
- **ServiceNow:** activar o controlo «may affect support service levels and the Availability
  SLA» — o SLA passa a contar a partir do momento em que o suporte recebe acesso.
- **AWS (Nitro):** não haver acesso de operador «came with trade-offs… This can be less
  convenient», e assumem-no como a melhor troca.
- **HubSpot:** desligar o acesso significa que o suporte «won't be able to investigate the issue».

**Consequência para o GestPro:** qualquer desenho que exija aprovação humana por pedido compra
confiança com tempo de resposta. Num fornecedor com equipa pequena, esse é o custo dominante.

## Os dois exemplos que mais interessam a um ERP

**Oracle NetSuite** traça a fronteira mais forte que encontrei em qualquer fornecedor:

> «The NetSuite authorized staff **never accesses live accounts**… We never access any of your
> live environments such as Production, Sandbox, and Release Preview.»

O acesso é a uma **cópia** da conta num ambiente interno de qualidade. Isto é uma resposta
completamente diferente à pergunta do mapa: em vez de controlar a entrada no tenant, elimina-a.

**Odoo** — o concorrente directo — está no modelo D: o pessoal entra com credenciais próprias
(«not your password», e por isso auditável em separado), com quatro fundamentos **alternativos**
na política de privacidade, sem interruptor, sem prazo e sem registo visível ao cliente.

## Mecanismos que valem como referência de desenho

| Fornecedor | O detalhe que interessa |
|---|---|
| **Cloudflare** | *Break glass* é um **tipo de evento de auditoria de primeira classe**: a emergência é possível, e fica registada como tal, com e-mail ao super-administrador |
| **NVIDIA DGX Cloud** | Máquina de estados completa: Pendente / Aprovado / Expirado / Revogado / Rejeitado |
| **Zoho CRM** | Agente entra como utilizador **oculto** (não consome licença), com **lista de negação**: não exporta dados, não altera subscrições, e **não pode alterar a própria página de concessão** |
| **Freshworks** | O registo inclui **quem concedeu o acesso**, não só o que o agente fez |
| **GitHub Enterprise** | Sessão de uma hora · **razão obrigatória** · e-mail ao impersonado que **não se pode desactivar** |
| **SAP** | Dez níveis de acesso nomeados, autorização ligada ao caso, e log visível ao cliente durante 12 meses que «cannot be deactivated» |

## Dois anti-padrões documentados, e valem mais que os bons exemplos

**A Zendesk não regista a impersonação.** O artigo oficial do registo de auditoria não contém as
palavras «assume», «assumption» nem «impersonate». E na impersonação agente→utilizador final a
documentação diz: «**any actions you take… are done by the user you're logged in as**» — acções
sem atribuição a quem as praticou. É exactamente o defeito que o `audit-extension` deste
repositório teria se alguma vez se adoptasse impersonação.

A Zendesk reserva-se ainda o direito de assumir a conta **sem aviso prévio** em emergências ou
suspeita de violação dos termos — e nas contas de avaliação a assunção está **sempre ligada**.

**A Salesforce classifica a própria funcionalidade como não-conforme.** O Security Health Check
marca «Administrators Can Log In As Any User» com valor conforme = **desmarcado**, e «Force
relogin after Login-As-User» = **marcado**. O fornecedor documenta que a impersonação permanente
é um risco, no seu próprio produto.

## Correcções a uma versão anterior deste documento

Três afirmações da primeira recolha não resistiram à leitura verbatim e **nunca chegaram a ser
publicadas aqui** — ficaram de fora por terem vindo de resumos de motor de busca:

| Afirmado | Apurado |
|---|---|
| Acesso da Atlassian revogado **24 h** após o fecho do ticket | Revogado **no momento** do fecho. As 24 h vinham de um artigo de fórum |
| Acesso da Atlassian é **por site** | É **à organização inteira**: «full access to any sites in your organization» |
| Existe página `admin.atlassian.com → Support access` | **Não existe.** Era alucinação do resumo de pesquisa |
| Picklist da Salesforce: 1 dia / 1 semana / 1 mês / 1 ano | **Não verificado.** A documentação só afirma o **máximo de 1 ano** |

**A residência de dados não remove o acesso**, na Atlassian: mesmo em Isolated Cloud, o conteúdo
«may transit or be accessed by Atlassian staff for support purposes with customer consent».

## O que continua por saber

- A definição directa da Gartner para *just-in-time* e *zero standing privilege* (403).
- As opções de duração do interruptor da Cloudflare.
- Salesforce e Atlassian ficaram com **recolha secundária**: os sítios estão atrás de CAPTCHA
  ou de JavaScript. Verificar em navegador antes de citar em qualquer documento externo.
