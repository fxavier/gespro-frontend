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
Como uma Identidade nova entra pela primeira vez. Há **três caminhos**.

O primeiro não passa por administrador nenhum: quem se **regista no site**
escolhe ali a sua palavra-passe e **entra no produto na mesma submissão**, sem
esperar por e-mail. O endereço fica por confirmar, e é isso que distingue este
caminho — a pessoa explora, configura e importa à vontade, mas **não emite
documentos fiscais nem convida colegas** enquanto não confirmar. A confirmação
chega por uma ligação nossa, válida 24 h, que se pode reenviar do painel.

> **Porquê sem esperar:** quem experimenta um ERP não vai abrir o webmail da
> empresa para procurar na pasta de spam; fecha o separador. A exigência de
> e-mail confirmado não desaparece — muda de sítio, do login para os dois actos
> que fazem estrago. Decidido em 2026-09-15 (ADR-0031).

Os outros dois são para quem é **criado por um administrador**, que escolhe
entre eles: o **convite por e-mail**
(o Keycloak envia a mensagem onde a pessoa confirma o endereço e escolhe a
palavra-passe) ou a **palavra-passe atribuída** (o sistema gera uma provisória,
mostra-a ao administrador uma única vez, e a pessoa é obrigada a trocá-la ao
entrar).

> **Porquê dois destes:** o convite pressupõe e-mail a funcionar e a chegar. Há
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

### Fechado
O estado de uma Assinatura ao fim dos trinta dias de [[Leitura]]: ninguém do Tenant entra. Os
dados ficam onde estão, indefinidamente — fechar não é apagar, e apagar é um acto pedido pelo
cliente. Um Tenant Fechado volta a abrir pagando, sem perder nada.

É um estado com nome próprio, e não um empréstimo a «cancelada» ou «expirada»: quem deixou o
Trial acabar não cancelou coisa nenhuma, e um nome que mente na ficha do cliente é pior do que
um valor a mais. O motivo de cada fecho fica registado à parte.

> **Não confundir com** o Tenant que a GestPro fecha por decisão própria — abuso, por exemplo.
> Esse é um interruptor **separado**, com outro dono, e um Tenant fechado por nós não reabre por
> ter pago. Ver [[Tenant]].

_Evitar_: expirado, cancelado, desactivado, inactivo.

### Excedido
Um Tenant com mais do que um [[Limite do plano]] permite. Acontece quando desce de Plano sem
desactivar ninguém, ou quando baixamos um Limite do catálogo sobre Tenants antigos. Continua a
usar o que tem e deixa de poder criar mais.

Nunca se recusa a descida de Plano por causa disto, e nunca se desactiva ninguém em nome do
cliente: escolher quais das pessoas dele perdem o acesso não é uma decisão nossa. Ver
[[Utilizador]].

## Contabilidade

### Lançamento
O registo contabilístico em partida dobrada: um conjunto de partidas a débito e a crédito
que somam o mesmo, num diário, numa data e com um número da série desse diário e período.
Só produz efeito — nos mapas, no balancete, no apuramento do IVA — depois de **confirmado**.
Os lançamentos que outros módulos geram (venda, factura, nota de crédito) nascem já
confirmados; só os manuais passam por [[Rascunho]].

### Rascunho
Um [[Lançamento]] manual ainda por confirmar. Não tem efeito contabilístico nenhum, por isso
**corrige-se à vontade**: partidas, histórico, observações e a data — desde que continue no
mesmo período. O diário e o período não mudam, porque o número pertence a essa série; para
mudar de diário ou de mês, [[Anulado|anula-se]] e cria-se outro. Um período com rascunhos
não fecha.

### Anulado
Um [[Rascunho]] que se deitou fora, com motivo obrigatório. A linha **fica**, com o seu
número: apagá-la abriria um buraco na série do diário, que é o que um auditor pergunta
primeiro. Não tem efeito contabilístico, não impede o fecho do período e não aparece nas
listas por omissão.

_Não confundir com_ **Estornado**: o estorno anula o efeito de um lançamento **confirmado**
com outro lançamento de sinal contrário; a anulação só existe para o que nunca teve efeito.
Decidido em 2026-09-27 (issue #137).

### Balancete de verificação
Lista as contas do PGC-NIRF com o **movimento do período**, o **acumulado** do exercício e o
**saldo**, para provar que débitos e créditos batem. Escolhe-se por exercício e período inicial e
final (não por datas). Mostra a hierarquia (classe, conta de razão, subcontas) com as contas-mãe
somadas a partir das folhas; os totais contam só as folhas. Ver ADR-0040.

### Movimento do período
Os débitos e créditos dos lançamentos confirmados dos períodos escolhidos — do inicial ao final,
pelo período a que o lançamento pertence, não pela data.

### Acumulado
Os débitos e créditos desde o primeiro período do exercício até ao período final, **mais a
abertura**. _Não confundir com_ **saldo anterior** (o modelo antigo, que somava todo o histórico).

### Abertura implícita
Enquanto um exercício não tiver lançamento de abertura (diário `AB`), o balancete calcula-a: os
saldos das classes 1–5 e 8 anteriores ao exercício entram no acumulado, e o resultado anterior das
classes 6/7 entra numa linha **«Resultados de exercícios anteriores por encerrar»**. Não se escreve
nada na base; desaparece quando o `AB` existir (ADR-0035).

### Saldo devedor / saldo credor
O saldo de uma conta (`acumulado D − acumulado C`) mostrado do lado onde cai, sempre positivo.
Um saldo **contra natureza** (ex.: Caixa credora) é assinalado, não recusado.

### Período 13
O período de **encerramento** de cada exercício: um instante (o último milissegundo do ano), sem
operações. Só recebe os lançamentos de [[Encerramento do exercício]] (diário `EN`). Não tem IVA a
apurar e fecha sem as verificações de caixa, reconciliação e documentos, que são do período 12.
_Não confundir com_ **Dezembro**: o balancete de Dezembro continua a ser só Dezembro.

### Encerramento do exercício
O acto que salda as classes 6 e 7 e leva o resultado à classe 8, em três lançamentos no diário
`EN` com a data do fim do exercício e no [[Período 13]]: **apuramento dos resultados** (6/7 → 81
operacionais e 82 financeiros, que passam a 83 correntes), **estimativa do imposto** (D 851 /
C 4411; omitido quando é zero) e **resultado líquido** (83 e 85 → 88). Guarda a **fotografia do
balancete** — saldos por conta, com o código e o nome à data — e não se recalcula. ADR-0035.
Financeiro = 69 e 78; operacional = o resto das classes 6/7 (a mesma regra da DRE). Decidido em
2026-10-05 (issue #138).

### Encerrado provisoriamente
O exercício com as contas saldadas e a fotografia guardada. Não aceita escrita corrente, mas
pode ser **reaberto** — com permissão própria e motivo — para ajustamentos da revisão: a
reabertura estorna os lançamentos de encerramento e regista-se à parte. Volta a encerrar-se com
uma fotografia nova.

### Encerrado
Definitivo. Nenhuma reabertura, por ninguém. Passa-se a ele depois da entrega da Modelo 22 e da
aprovação de contas.

_Não confundir_ o encerramento com a **aplicação do resultado** (88 → 59 «Resultados
transitados»): essa é do exercício **seguinte**, com a data da deliberação dos sócios.

### Conta de razão
Conta de nível 2 do PGC-NIRF (dois dígitos, ex.: `11` Caixa, `12` Bancos). O filtro «ver apenas
contas de razão» do balancete mostra só este nível.


## Vendas e facturação

### Venda POS
A venda feita ao balcão, dentro de uma sessão POS sobre uma sessão de caixa aberta. Emite **sempre** um
documento fiscal na mesma transacção ([[Factura-Recibo]] se paga no acto, [[Factura]] se a crédito) e esse
documento lança na contabilidade. **Não é** o talão: o talão é a impressão não fiscal da venda.

### Factura
Documento fiscal de venda (`Fatura`, série `FATURA`): reconhece a dívida do cliente em 411. Nasce emitida
e fica por pagar. Corrige-se por nota de crédito ou de débito, nunca por alteração.

### Factura-Recibo
[[Factura]] paga no acto (`Fatura` na série `FATURA_RECIBO`): documento e recibo num só. Nasce paga; o
débito vai ao meio de pagamento (111, banco, carteira móvel), não a 411. **Não é** a venda a dinheiro
nem o talão.

### Consumidor Final
O cliente técnico de cada tenant (`CF-000000`) contra o qual se factura uma venda POS sem cliente
identificado. **Não é** um cliente real: não tem crédito, e uma venda a crédito exige cliente identificado.

### Pagamento da venda
Uma linha de `PagamentoVenda`: o meio (dinheiro, cartão, transferência, M-Pesa, e-Mola, crédito) e o valor
**aplicado à venda**. O troco é informativo e não é receita; só a parte em dinheiro entra na gaveta.
