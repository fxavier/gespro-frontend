# Glossário do domínio — GestPro

> Linguagem ubíqua do produto. **Só termos**, sem decisões de implementação: essas
> vivem em `docs/decisions/`. Se um termo aqui contradisser o código, um dos dois
> está errado — e vale a pena descobrir qual antes de escrever mais linhas.

## Identidade e acesso

### Tenant
A empresa cliente. É a fronteira de isolamento de **todos** os dados de negócio:
nada é observável de um tenant para outro. Um Tenant tem um nome comercial, um
NUIT único e uma [[Assinatura]] que determina se o acesso está aberto, em [[Leitura]] ou
fechado. A GestPro pode fechá-lo por decisão própria — abuso, por exemplo — e esse é um
interruptor **separado** do estado da Assinatura: um Tenant fechado por decisão nossa não
reabre por ter pago.

### Identidade
A pessoa que se autentica — quem prova ser quem diz ser. Uma Identidade pertence
a **exactamente um Tenant**, e o seu endereço de e-mail é único em todo o
sistema, não apenas dentro do Tenant.

> **Consequência deliberada:** uma pessoa que trabalhe para dois Tenants precisa
> de dois endereços de e-mail distintos. A alternativa — uma Identidade com
> várias adesões — foi rejeitada em 2026-08-29 por não valer a complexidade que
> arrasta para o modelo de autorização. Ver [[Utilizador]].

### Primeiro acesso
Como uma Identidade nova entra pela primeira vez. Há **dois caminhos**, e é o
administrador que escolhe ao criar o [[Utilizador]]: o **convite por e-mail**
(o Keycloak envia a mensagem onde a pessoa confirma o endereço e escolhe a
palavra-passe) ou a **palavra-passe atribuída** (o sistema gera uma provisória,
mostra-a ao administrador uma única vez, e a pessoa é obrigada a trocá-la ao
entrar).

> **Porquê dois:** o convite pressupõe e-mail a funcionar e a chegar. Há
> empresas onde não há — e enquanto a única porta fosse um link enviado por
> e-mail, ninguém entrava. Decidido em 2026-09-14 (ADR-0030).

A palavra-passe provisória **não é guardada em lado nenhum**: quem a perder
repõe-na na ficha do Utilizador, o que gera outra e volta a exigir a troca.

### Acesso de suporte
O pessoal da GestPro **não tem Identidade nos Tenants dos clientes**. Quando um incidente exige ver os
dados de dentro, cria-se para esse incidente uma Identidade própria e temporária nesse Tenant, que é
desactivada ao fechá-lo.

Nunca se assume a Identidade de outra pessoa. O autor de cada acção auditada tem de ser quem a
praticou — um trilho de auditoria que nomeia o cliente por acto de um técnico é pior do que não haver
acesso nenhum, porque é a peça que se mostra a um auditor fiscal. Ver [[Identidade]].

### Utilizador
A Identidade tal como o negócio a conhece: nome, e-mail, estado activo, e os
Papéis que lhe foram atribuídos dentro do seu Tenant. É o que fica registado
como autor de cada acção auditada.

Utilizador e Identidade são a mesma pessoa vista de dois lados: a **Identidade**
responde «quem és» e é gerida pelo fornecedor de identidade; o **Utilizador**
responde «o que podes» e é gerido pelo GestPro. Um sem o outro não entra.

### Papel
Um conjunto nomeado de Permissões, definido dentro de um Tenant. Cinco Papéis
são de sistema e existem em todos os Tenants.

### Permissão
A autorização para executar uma acção concreta, no formato
`modulo:accao[:sub-accao]`. O catálogo é global e igual para todos os Tenants —
o que varia entre Tenants é quem tem o quê, nunca o que existe.

## Subscrição e planos

### Plano
Um dos três escalões nomeados que a GestPro vende — Básico, Profissional e
Empresarial. Determina o preço e os Limites do Plano. O preço é do escalão, não
do número de pessoas: acrescentar um Utilizador dentro do Limite não muda o que
se paga.

> **Consequência deliberada:** rejeitou-se o preço por assento em 2026-09-11. Num
> ERP com trilho de auditoria, cobrar por pessoa paga a quem partilha
> credenciais — e é o autor de cada acção auditada que se perde. Ver [[Utilizador]].

_Evitar_: escalão, tier, pacote, subscrição (a subscrição é a [[Assinatura]]).

### Assinatura
O vínculo comercial entre um Tenant e a GestPro: que Plano, em que ciclo, em que
estado. É a **fonte de verdade única** do Plano de um Tenant — nenhum outro sítio
guarda uma segunda cópia dessa resposta. Não guarda montantes: quem cobra é o
Stripe, e o valor cobrado vive lá.

### Limite do plano
Um tecto que o Plano impõe ao Tenant. Só é Limite do Plano o que é **verificado**:
um número publicado que ninguém aplica não é um limite, é uma promessa. Os Limites
são o número de Utilizadores e o número de Armazéns — sendo Armazém uma
Localização desse tipo, activa e não apagada. As localizações por baixo dela na hierarquia
(prateleiras, salas) são organização interna e não contam.

A unidade de contagem dos Utilizadores é o Utilizador **activo** do Tenant —
desactivar um liberta o lugar de imediato, sem esperar pelo fim do ciclo. O
Utilizador desactivado continua a ser o autor das acções que praticou; deixa de
custar dinheiro, não deixa de existir. Ver [[Utilizador]].

> **Consequência deliberada:** o volume de documentos emitidos por mês **não** é
> um Limite do Plano. Recusar a emissão de um documento fiscal por razão comercial
> mete o contrato de venda dentro de um acto que é do Estado, e pune o Tenant que
> cresce.

### Trial
Os primeiros catorze dias de uma Assinatura, sem cartão. Valem os Limites do Plano escolhido
no registo, não os do plano mais baixo. Um Tenant em Trial é um Tenant a sério: emite
documentos que são fiscais como quaisquer outros, e é por isso que a saída do Trial não é
tratada de forma diferente de qualquer outra saída.

_Evitar_: demo, avaliação, período gratuito.

### Leitura
O estado em que um Tenant consegue ver e exportar tudo o que é seu, mas não consegue escrever
nada. É por aqui que passa **toda** a saída de uma Assinatura activa — fim de [[Trial]],
cancelamento voluntário ou falha de cobrança — durante trinta dias, ao fim dos quais o acesso
fecha. Os dados não se apagam: apagar é um acto pedido pelo cliente, nunca um temporizador.

Pagar e exportar continuam a funcionar em Leitura. Um estado de onde o cliente não pudesse
sair seria uma armadilha, não uma cobrança.

_Evitar_: suspenso, congelado, read-only.

### Excedido
Um Tenant com mais do que um [[Limite do plano]] permite. Acontece quando desce de Plano sem
desactivar ninguém, ou quando baixamos um Limite do catálogo sobre Tenants antigos. Continua a
usar o que tem e deixa de poder criar mais.

Nunca se recusa a descida de Plano por causa disto, e nunca se desactiva ninguém em nome do
cliente: escolher quais das pessoas dele perdem o acesso não é uma decisão nossa. Ver
[[Utilizador]].
