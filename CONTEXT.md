# Glossário do domínio — GestPro

> Linguagem ubíqua do produto. **Só termos**, sem decisões de implementação: essas
> vivem em `docs/decisions/`. Se um termo aqui contradisser o código, um dos dois
> está errado — e vale a pena descobrir qual antes de escrever mais linhas.

## Identidade e acesso

### Tenant
A empresa cliente. É a fronteira de isolamento de **todos** os dados de negócio:
nada é observável de um tenant para outro. Um Tenant tem um nome comercial, um
NUIT único e uma assinatura que determina se o acesso está aberto ou bloqueado.

### Identidade
A pessoa que se autentica — quem prova ser quem diz ser. Uma Identidade pertence
a **exactamente um Tenant**, e o seu endereço de e-mail é único em todo o
sistema, não apenas dentro do Tenant.

> **Consequência deliberada:** uma pessoa que trabalhe para dois Tenants precisa
> de dois endereços de e-mail distintos. A alternativa — uma Identidade com
> várias adesões — foi rejeitada em 2026-08-29 por não valer a complexidade que
> arrasta para o modelo de autorização. Ver [[Utilizador]].

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
