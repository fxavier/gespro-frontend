# 0. Primeiros passos

> **Para quem:** todos os perfis · **Onde:** ecrãs de entrada (`/registo`, `/auth/login`, `/auth/recuperar`) e a interface comum a todos os módulos

## Objectivo do módulo

O GestPro é um ERP para empresas moçambicanas: reúne num só sistema as compras, o stock, as vendas, a
faturação, a caixa, a contabilidade, os salários, os projectos, a frota e o suporte. A vantagem não está em
cada ecrã isolado — está em que **uma operação registada uma vez actualiza todos os módulos que dela
dependem**. Uma venda no POS, por exemplo, emite o documento fiscal, baixa o stock, entra na caixa e lança na
contabilidade, sem que ninguém volte a escrever os mesmos números.

Este capítulo é a porta de entrada: criar a conta da empresa, entrar, conhecer a interface comum a todos os
módulos e perceber o que cada perfil pode fazer.

| | |
|---|---|
| **Que problema resolve** | Pôr a empresa e as pessoas dentro do sistema, com o acesso certo, e ensinar a interface que se repete em todos os módulos. |
| **Quem usa** | Todos. O registo da empresa é feito uma vez, por quem vai ser o Administrador. |
| **O que entra** | Nome e NUIT da empresa, província, e-mail e palavra-passe de cada pessoa. |
| **O que sai** | A empresa criada com o plano de contas PGC-NIRF, os diários, as séries de numeração fiscal do ano e os cinco perfis de sistema — tudo pronto a usar. |

**Como os módulos se ligam** (o caminho do dinheiro e da mercadoria):

```
Compras ──► Inventário ──► Vendas & POS ──► Faturação ──► Caixa / Bancos
   │            ▲               │               │               │
   ▼            │               ▼               ▼               ▼
Fornecedores    Produção     Clientes        Tesouraria ◄── Contabilidade ◄── Recursos Humanos
(contas a pagar)                                                (salários)
```

Transporte, Projectos e Suporte apoiam a operação; Plataforma & Administração controla quem entra e o que
pode fazer.

## Exemplo prático — o primeiro dia da Ferragens Boa Obra

> Todos os capítulos usam a mesma empresa fictícia, descrita no [README](README.md#a-empresa-dos-exemplos):
> **Ferragens Boa Obra, Lda**, loja de materiais de construção na Cidade de Maputo.

**Situação:** o Sérgio Cossa, sócio-gerente, decidiu passar a empresa do Excel para o GestPro.

1. **Regista a empresa** em `/registo`: «Ferragens Boa Obra, Lda», NUIT `400500600`, «Maputo Cidade», o seu
   nome, `sergio@boaobra.co.mz` e uma palavra-passe com 10+ caracteres; escolhe o plano **Profissional**.
   Clica **Criar conta e entrar** → [Como criar a conta da sua empresa](#como-criar-a-conta-da-sua-empresa).
2. **Entra logo no Dashboard**, já como **ADMIN** e em **Período de Teste** (14 dias, sem cartão). Vê o aviso
   **Endereço de e-mail por confirmar** e o cartão **Primeiros passos**.
3. **Confirma o e-mail** pela ligação recebida. Até aqui podia configurar tudo, mas não emitir documentos
   fiscais nem criar colegas.
4. **Procura um ecrã sem saber onde está:** carrega **⌘K** (Mac) ou **Ctrl+K**, escreve «requis» e abre
   **Requisições de Compra** → [Como procurar um ecrã](#como-procurar-um-ecrã-paleta-de-comandos).
5. **Recolhe a barra lateral** com **⌘B/Ctrl+B** para ganhar espaço numa lista larga e volta a abri-la.
6. **Decide os perfis da equipa** com a tabela de [Perfis de sistema](#perfis-de-sistema):

   | Pessoa | Função na loja | Perfil |
   |---|---|---|
   | Sérgio Cossa | Sócio-gerente | ADMIN |
   | Marta Sitoe | Gerente de loja (compras, aprovações) | GESTOR |
   | Carlos Nhantumbo | Contabilista / financeiro | FINANCEIRO |
   | Ana Mabunda | Balcão e armazém | OPERADOR |
   | Revisor de contas externo | Só consulta | LEITURA |

   Os utilizadores criam-se em [Plataforma e administração](11-plataforma-e-administracao.md#como-criar-um-utilizador-convite-ou-palavra-passe-atribuída).

**Resultado esperado:** o Sérgio entra e sai sem ajuda, encontra qualquer ecrã pela paleta de comandos e sabe
que perfil dar a cada colega. Se uma pessoa tentar algo fora do seu perfil, vê «Sem permissão para esta
operação» — é o sistema a funcionar, não um erro.

Continue em [Casos práticos](12-casos-praticos.md) para ver o primeiro mês completo, ou vá directo ao
capítulo do módulo que vai usar.

## Conceitos

| Termo | O que é |
|---|---|
| Empresa | A conta da sua organização no GestPro. Todos os dados (clientes, facturas, stock…) pertencem a uma empresa e nunca são visíveis a outra. Cada empresa tem um NUIT único. |
| Utilizador | Uma pessoa com acesso à empresa: nome, e-mail, estado (Activo/Inactivo) e os papéis que lhe foram atribuídos. É o autor que fica registado em cada acção. |
| E-mail | O identificador com que se entra. **Um endereço só pode pertencer a uma empresa GestPro** — quem trabalha com duas empresas precisa de dois endereços distintos. |
| Papel | Um conjunto de permissões com nome (por exemplo ADMIN ou um papel criado pela empresa, como «Gestor de Vendas»). Um utilizador pode ter vários papéis. |
| Permissão | A autorização para uma acção concreta (por exemplo, emitir uma factura). O que cada pessoa pode fazer é a soma das permissões dos seus papéis. |
| Período de Teste | Os primeiros **14 dias** da conta, gratuitos e sem cartão. Durante o teste a empresa é uma empresa a sério: os documentos emitidos são fiscais como quaisquer outros. |
| Endereço de e-mail por confirmar | Estado de quem criou a conta no registo e ainda não abriu a ligação de confirmação. Pode explorar e configurar tudo, mas **não pode emitir documentos fiscais nem criar utilizadores**. |
| Palavra-passe provisória | Palavra-passe gerada pelo sistema quando um administrador cria ou repõe um acesso. É mostrada uma única vez ao administrador e tem de ser trocada no primeiro acesso. |
| Modo de Leitura | Estado da empresa depois de o teste ou a subscrição terminar: durante 30 dias pode consultar e exportar tudo, mas não gravar. Ver [Plataforma e Administração](11-plataforma-e-administracao.md). |

### Perfis de sistema

Todas as empresas nascem com cinco papéis de sistema. Não podem ser removidos. O administrador
pode criar outros papéis à medida (ver [Plataforma e Administração](11-plataforma-e-administracao.md)).

| Perfil | Descrição no produto | O que pode, em resumo |
|---|---|---|
| **ADMIN** | Administrador — acesso total ao tenant | Tudo, incluindo configurações sensíveis (dados da empresa e configuração fiscal, séries de faturação, plano de contas, fecho e reabertura de períodos, declarar o IVA, estornar lançamentos). É quem cria a conta no registo. |
| **GESTOR** | Gestor — operações e aprovações, sem configuração de sistema | Quase tudo: operar e aprovar em todos os módulos, gerir utilizadores e papéis (só pode dar a outros as permissões que ele próprio tem — por isso, dos papéis de sistema, só atribui GESTOR e LEITURA), gerir a subscrição. **Não pode:** configurar a empresa, atribuir permissões a papéis, configurar integrações, alterar o plano de contas, configurar séries de faturação, fechar/reabrir períodos, abrir, encerrar ou reabrir exercícios, declarar o IVA, configurar a Demonstração de Fluxos de Caixa, estornar lançamentos, remover colaboradores, administração total de inventário e activos. |
| **FINANCEIRO** | Financeiro — contabilidade, caixa e faturação | Contabilidade, faturação, caixa, tesouraria, IVA (apurar e declarar), processamento salarial (payroll) e analytics; nas contas a pagar, regista pagamentos a fornecedores e cria e cancela contas a pagar; consulta e exportação de tudo o resto. **Não pode** reabrir períodos nem abrir, encerrar ou reabrir exercícios, nem criar clientes ou produtos, nem operar o POS; em Compras não cria pedidos, não aprova e não regista recepções. |
| **OPERADOR** | Operador — operações de armazém, produção e suporte | Inventário, produção, transporte, tickets, serviços, operar o POS e a caixa (abertura, fecho, reforço, sangria), criar e submeter requisições de compra, registar recepções, criar e editar vendas, criar e editar produtos, tarefas e timesheets de projectos, registar assiduidade e ausências, pedir férias; consulta e exportação do resto. **Não aprova** compras nem emite facturas. **Não vê** os utilizadores, o Registo de Auditoria nem a Demonstração de Fluxos de Caixa, e **não exporta** os mapas contabilísticos (balancete, balanço, DRE, DFC e documentos do encerramento). |
| **LEITURA** | Leitura — apenas consulta e exportação | Consultar, listar e exportar em todos os módulos. Não grava nada, nem abre o terminal POS. |

> **Nota:** a barra lateral só mostra os módulos e ecrãs que o seu perfil pode consultar; um
> grupo sem nenhum ecrã visível desaparece. Se abrir à mão o endereço de um ecrã que não pode
> consultar, aparece o aviso **Sem permissão** — «Não tem permissão para consultar esta página.
> Contacte o administrador do sistema.» Ver um ecrã também não garante poder agir nele: se tentar
> uma acção para a qual o seu perfil não tem permissão, o GestPro recusa-a com a mensagem «Sem
> permissão para esta operação» (ver [Erros frequentes](#erros-frequentes)).

## Ecrãs

| Menu | Endereço (/rota) | Para que serve |
|---|---|---|
| — (ligação «Começar teste gratuito de 14 dias») | `/registo` | Criar a conta da empresa e entrar de imediato. |
| — | `/auth/login` | Iniciar sessão («Bem-vindo de volta»). |
| — (ligação «Esqueceu-se da palavra-passe?») | `/auth/recuperar` | Pedir uma ligação por e-mail para definir uma palavra-passe nova («Recuperar palavra-passe»). |
| — | `/auth/mudar-palavra-passe` | Trocar a palavra-passe provisória no primeiro acesso («Defina a sua palavra-passe»). |
| — | `/auth/erro` | Explica porque é que a entrada foi recusada. |
| — (ligação «Contactar o suporte») | `/contactos` | Como obter ajuda com o acesso («Contacto e Suporte»). |
| Dashboard | `/dashboard` | Página inicial: avisos, «Primeiros passos», indicadores e «Accões Rápidas». |
| Plataforma & Analytics › Core Tenancy | `/core-tenancy` | Administração: dados da empresa, utilizadores, papéis e auditoria — ver capítulo 11. |
| (sino no cabeçalho) | `/notificacoes` | Centro de notificações — ver capítulo 11. |

## Tarefas

### Como criar a conta da sua empresa

**Antes de começar:** tenha à mão o nome e o NUIT da empresa, a província e um e-mail que ainda
não esteja associado a nenhuma conta GestPro.

1. Abra `/registo` (ou, no ecrã de entrada, clique em **Começar teste gratuito de 14 dias**).
2. Preencha **Nome da empresa**, **NUIT** (9 dígitos) e **Província**.
3. Preencha **O seu nome** e **E-mail**. Este e-mail passa a ser o seu identificador de entrada.
4. Escolha a **Palavra-passe** (pelo menos 10 caracteres) e repita-a em **Confirmar palavra-passe**.
5. Em **Plano**, escolha Básico, Profissional ou Empresarial. O preço mostrado é mensal, em USD;
   durante os 14 dias de teste não paga nada.
6. Complete a **Verificação anti-robô**, se aparecer.
7. Clique em **Criar conta e entrar**.

<!-- captura: 00-primeiros-passos/registo.png | /registo -->
![Formulário de registo da empresa](img/00-primeiros-passos/registo.png)

**Resultado:** a conta é criada e entra directamente no **Dashboard**, já com sessão iniciada, em
**Período de Teste**. Fica com o perfil ADMIN. No Dashboard aparecem o aviso **Endereço de e-mail
por confirmar** e o cartão **Primeiros passos**. Enviamos-lhe por e-mail uma ligação de confirmação.

Se a conta for criada mas a sessão não abrir, o ecrã mostra «A sua conta foi criada, mas não foi
possível iniciar a sessão automaticamente. Inicie sessão com o e-mail e a palavra-passe que acabou
de escolher.» e um botão **Iniciar sessão**. Não volte a registar a empresa — ela já existe.

**Efeitos noutros módulos:** a empresa é criada já com o plano de contas, as séries de numeração
fiscal e os cinco perfis de sistema configurados.

### Como confirmar o endereço de e-mail (e reenviar a ligação)

Enquanto o endereço estiver por confirmar pode configurar e explorar tudo, mas estão travados:

- **emitir documentos fiscais** — facturas, notas de crédito, notas de débito e a conversão de
  proforma em factura;
- **criar utilizadores** e **reactivar utilizadores**.

1. Abra a mensagem de confirmação que recebeu e clique na ligação. A ligação é válida **24 horas**.
2. Se abrir a ligação sem sessão iniciada (por exemplo, no telemóvel), o ecrã de entrada mostra
   «Endereço confirmado. Inicie sessão para continuar — já pode emitir documentos e convidar colegas.»
3. Se a mensagem não chegou ou a ligação expirou: no **Dashboard**, no aviso **Endereço de e-mail
   por confirmar**, clique em **Reenviar ligação**. Aparece «Ligação enviada. Verifique a sua caixa
   de correio.»

**Resultado:** depois de confirmar, o aviso mostra «Endereço confirmado — a sessão actualiza-se
dentro de minutos». Os travões desaparecem no máximo em 15 minutos; para que desapareçam de
imediato, termine a sessão e entre outra vez.

### Como entrar no GestPro

1. Abra `/auth/login`. O ecrã de entrada é do próprio GestPro: o formulário fica à esquerda e, à direita, um
   resumo dos módulos do GestPro.
2. Escreva o **E-mail profissional** e a **Palavra-passe**. O ícone do olho mostra ou oculta o que escreveu.
3. Clique em **Entrar na plataforma**.

<!-- captura: 00-primeiros-passos/login.png | /auth/login -->
![Ecrã de entrada](img/00-primeiros-passos/login.png)

**Resultado:** entra no **Dashboard**. Se tinha tentado abrir outra página antes de entrar, o
GestPro leva-o de volta a essa página.

### Como entrar pela primeira vez por convite

**Antes de começar:** o administrador da sua empresa criou o seu utilizador com a opção
**Convite por e-mail**.

1. Abra a mensagem de convite que recebeu.
2. Siga a ligação, confirme o endereço e escolha a sua palavra-passe.
3. Entre em `/auth/login` com o seu e-mail e a palavra-passe que escolheu.

**Resultado:** entra no GestPro com os papéis que o administrador lhe atribuiu. O seu e-mail já
fica confirmado.

### Como entrar pela primeira vez com uma palavra-passe provisória

**Antes de começar:** o administrador criou o seu utilizador com a opção **Definir palavra-passe
agora** (ou repôs a sua palavra-passe) e entregou-lhe a palavra-passe provisória.

1. Em `/auth/login`, escreva o seu e-mail e a palavra-passe provisória e clique em
   **Entrar na plataforma**.
2. O GestPro abre automaticamente o ecrã **Defina a sua palavra-passe**, com o e-mail já preenchido.
3. Em **Palavra-passe provisória**, escreva de novo a que recebeu.
4. Em **Nova palavra-passe**, escolha uma com pelo menos 10 caracteres, diferente da provisória.
5. Repita-a em **Confirmar nova palavra-passe** e clique em **Guardar e entrar**.

<!-- captura: 00-primeiros-passos/mudar-palavra-passe.png | /auth/mudar-palavra-passe -->
![Troca obrigatória da palavra-passe provisória](img/00-primeiros-passos/mudar-palavra-passe.png)

**Resultado:** a palavra-passe provisória deixa de funcionar e entra no **Dashboard**. Se a troca
correr bem mas a sessão não abrir, aparece «Palavra-passe alterada. Inicie sessão com a nova para
continuar.» — volte a `/auth/login` e entre com a nova.

### Como recuperar a palavra-passe

Quem se esqueceu da palavra-passe pode pedir, sozinho, uma ligação para definir uma nova:

1. No ecrã de entrada (`/auth/login`), clique em **Esqueceu-se da palavra-passe?**. Abre o ecrã
   **Recuperar palavra-passe** (`/auth/recuperar`).
2. Em **E-mail**, escreva o endereço com que entra no GestPro.
3. Clique em **Enviar ligação de recuperação**.
4. Abra a mensagem que recebe por e-mail e siga a ligação para escolher a palavra-passe nova.
   No fim, volta ao ecrã de entrada: entre com a palavra-passe nova.

**Resultado:** o ecrã mostra sempre a mesma resposta — «Se o endereço tiver uma conta activa na
GestPro, vai receber dentro de minutos um e-mail com a ligação para definir uma palavra-passe
nova. Verifique também a pasta de spam.» — exista ou não uma conta com esse endereço; é assim de
propósito, para que ninguém descubra por aqui que e-mails têm conta. Enquanto não usar a ligação,
a palavra-passe antiga continua a funcionar. Para voltar ao ecrã de entrada sem pedir nada, clique
em **Voltar a iniciar sessão**.

Se o e-mail não chegar (verifique o spam), há um limite de pedidos por hora para o mesmo endereço:
espere um pouco antes de repetir. Em alternativa, peça ao **administrador da sua empresa** que reponha
a palavra-passe:

1. O administrador abre **Plataforma & Analytics › Core Tenancy › Gerir Utilizadores**, abre a sua
   ficha e clica em **Repor palavra-passe** (ver [Plataforma e Administração](11-plataforma-e-administracao.md)).
2. O administrador entrega-lhe a nova palavra-passe provisória.
3. Entre com ela e troque-a, como em [Como entrar pela primeira vez com uma palavra-passe provisória](#como-entrar-pela-primeira-vez-com-uma-palavra-passe-provisória).

O ecrã **Contacto e Suporte** (`/contactos`, ligação **Contactar o suporte** no ecrã de entrada)
indica o mesmo caminho para obter um convite ou alterar permissões: contactar o administrador da
sua organização.

<!-- captura: 00-primeiros-passos/contactos.png | /contactos -->
![Contacto e Suporte](img/00-primeiros-passos/contactos.png)

### Como terminar a sessão

1. No canto superior direito, clique no seu nome (ou nas suas iniciais).
2. Clique em **Terminar sessão**.

**Resultado:** volta ao ecrã de entrada.

**Expiração da sessão:** a sessão termina sozinha após um período sem actividade (8 horas, na
configuração por omissão) e, em qualquer caso, 12 horas depois de ter entrado. Quando isso
acontece, a próxima página que abrir leva-o ao ecrã de entrada; depois de entrar, volta à página
onde estava. Alterações feitas pelo administrador aos seus papéis, a desactivação do seu
utilizador ou uma mudança no estado da subscrição chegam à sua sessão em **15 minutos, no máximo**.

### Como usar a barra lateral

A barra lateral, à esquerda, lista os módulos agrupados (Compras & Procurement, Fornecedores,
Inventário & Activos, Vendas & POS, Finanças & Contabilidade, Recursos Humanos, Projectos,
Transporte & Logística, Suporte & Tickets, Plataforma & Analytics).

1. Clique num grupo para o abrir ou fechar; clique num item para abrir o ecrã. O item activo
   fica realçado.
2. Para recolher a barra a uma coluna de ícones, clique no botão no topo (**Recolher barra
   lateral**) ou prima **⌘B** (Mac) / **Ctrl+B** (Windows). Repita para expandir.
3. Com a barra recolhida, clique no ícone de um grupo para ver os seus itens num menu.

A escolha (recolhida ou expandida) fica guardada no navegador. Em ecrãs estreitos (telemóvel) a
barra começa recolhida e abre por cima do conteúdo.

<!-- captura: 00-primeiros-passos/dashboard.png | /dashboard -->
![Dashboard com a barra lateral e o cabeçalho](img/00-primeiros-passos/dashboard.png)

### Como procurar um ecrã (paleta de comandos)

1. Prima **⌘K** (Mac) ou **Ctrl+K** (Windows) em qualquer página.
2. Escreva parte do nome do ecrã (por exemplo «IVA» ou «Payroll»). A lista está agrupada por
   Início, Compras, Inventário, Vendas, Finanças, Recursos Humanos, Projectos, Operações e Analytics.
3. Use as setas e **Enter**, ou clique no resultado.

**Resultado:** o ecrã abre. Se nada corresponder, aparece «Nenhum resultado encontrado.» A paleta
procura ecrãs, não documentos nem registos.

> **Atenção:** a caixa «Procurar módulos, documentos…» no cabeçalho ainda não abre a paleta com
> um clique. Use o atalho de teclado.

### Como usar o cabeçalho

No topo de cada página encontra, da esquerda para a direita:

- o **caminho** da página (por exemplo *Administração › Utilizadores*) — cada parte é uma ligação;
- a caixa **Procurar módulos, documentos…** com o atalho **⌘K**;
- o **sino de notificações** — um número vermelho indica quantas notificações tem por ler
  (mostra «99+» acima de 99); clique para abrir `/notificacoes`;
- o botão **Alterar tema**;
- o **menu do utilizador** (o seu nome e e-mail, e **Terminar sessão**).

> **Atenção:** o item **Configurações** do menu do utilizador ainda não leva a nenhum ecrã.

### Como ver as notificações

1. Clique no sino, no cabeçalho.
2. Em **Notificações**, as não lidas aparecem realçadas com um ponto. Clique no visto para
   **Marcar como lida**, ou em **Marcar todas como lidas**.

Detalhes e preferências de entrega: ver [Plataforma e Administração](11-plataforma-e-administracao.md).

### Como mudar o tema (claro/escuro)

1. No cabeçalho, clique em **Alterar tema** (ícone do sol/lua).
2. Escolha **Claro**, **Escuro** ou **Sistema** (segue a configuração do seu computador).

### Como trabalhar com listas, fichas e formulários

As regras seguintes valem em todos os módulos.

**Listas**

- No topo há uma caixa **Pesquisar…** e filtros (por exemplo **Estado**). Os filtros em uso
  aparecem em **Filtros activos:**; remova-os um a um ou com **Limpar tudo**.
- Clique numa linha para abrir a ficha. O botão **⋯** no fim da linha abre as acções dessa linha
  (por exemplo **Ver detalhe**, **Editar**).
- Nas colunas com seta, clique no título para ordenar.
- Quando há mais registos, use **Seguinte** e **Anterior** no fundo da lista.
- Onde a exportação existe, há botões **CSV** e **XLSX** que descarregam o ficheiro (até 5 000
  linhas). Exportar é sempre permitido, mesmo em Modo de Leitura.
- No **XLSX**, os valores e montantes saem como números com formato `#,##0.00`, prontos a somar e
  ordenar no Excel (só um valor com mais de 15 algarismos sai como texto, para não perder precisão).
  No **CSV**, um texto que comece por `=`, `+`, `-` ou `@` sai com um apóstrofo (`'`) à frente, para
  que a folha de cálculo não o trate como fórmula; as colunas de valores não são alteradas.
- Cada pessoa pode pedir até 10 exportações por minuto do mesmo ecrã (o mesmo vale para o PDF das
  facturas, os recibos de salário e os mapas de IVA, INSS e IRPS). Acima disso, o pedido é recusado com
  «Demasiados pedidos. Tente mais tarde.» — espere um minuto e repita.

<!-- captura: 00-primeiros-passos/lista-exemplo.png | /clientes -->
![Exemplo de lista com pesquisa e filtros](img/00-primeiros-passos/lista-exemplo.png)

**Fichas (páginas de detalhe)**

- No topo: o nome do registo, o seu estado (etiqueta colorida) e os botões de acção
  (**Voltar**, **Editar**, e acções próprias do módulo).
- Por baixo, um resumo dos dados principais e **separadores** com o resto da informação
  (por exemplo **Papéis**, **Permissões**, linhas, histórico).

<!-- captura: 00-primeiros-passos/detalhe-exemplo.png | /clientes >primeiro -->
![Exemplo de ficha com separadores](img/00-primeiros-passos/detalhe-exemplo.png)

**Formulários**

- Criar e editar abrem numa **página própria** (por exemplo `/clientes/novo`), não numa janela
  por cima da lista. Os botões **Cancelar** e **Guardar**/**Criar** ficam no topo do formulário.
- Os campos com erro mostram a mensagem logo por baixo.
- Se tiver alterações por guardar e tentar sair, o GestPro pergunta «Tem alterações não guardadas.
  Pretende sair mesmo assim?» (ou o navegador avisa ao fechar o separador).
- Depois de guardar, uma mensagem breve no canto do ecrã confirma o resultado.

<!-- captura: 00-primeiros-passos/formulario-exemplo.png | /clientes/novo -->
![Exemplo de formulário em página própria](img/00-primeiros-passos/formulario-exemplo.png)

**Acções destrutivas**

- Desactivar, remover, anular ou cancelar pedem sempre confirmação numa janela com o que vai
  acontecer (por exemplo **Desactivar utilizador?** com **Cancelar** e **Confirmar Desactivação**).
  Nada acontece até confirmar.

## Estados

**Utilizador**

| Estado | Significado | Pode passar a | Quem |
|---|---|---|---|
| Activo | Pode entrar e trabalhar conforme os seus papéis. | Inactivo | ADMIN, GESTOR |
| Inactivo | Não consegue entrar («Este utilizador foi desactivado…»). | Activo (ver capítulo 11) | ADMIN, GESTOR (exige e-mail confirmado) |

**Endereço de e-mail de quem criou a conta**

| Estado | Significado | Pode passar a | Quem |
|---|---|---|---|
| Por confirmar | Pode trabalhar, mas não emite documentos fiscais nem cria/reactiva utilizadores. | Confirmado | O próprio, abrindo a ligação |
| Confirmado | Sem travões. | — | — |

**Subscrição da empresa** (resumo; detalhe no [capítulo 11](11-plataforma-e-administracao.md))

| Estado | Significado para quem usa |
|---|---|
| Período de Teste | Acesso completo durante 14 dias. |
| Activa | Acesso completo. |
| Modo de Leitura | Entra, consulta e exporta; não grava. Uma faixa no topo de todas as páginas mostra quantos dias faltam. |
| Acesso Fechado | Só o administrador (ADMIN ou GESTOR) entra, e apenas no ecrã **Subscrição**, para pagar; os restantes não entram. Os dados continuam guardados. |

## Erros frequentes

| Mensagem mostrada | Porquê | O que fazer |
|---|---|---|
| E-mail ou palavra-passe incorrectos. | Dados errados — ou demasiadas tentativas falhadas seguidas. | Verifique o e-mail e a palavra-passe. Se persistir, espere uns minutos, use **Esqueceu-se da palavra-passe?** ou peça ao administrador que reponha a palavra-passe. |
| Esta conta está desactivada. Contacte o administrador da sua empresa. | A sua identidade foi desactivada. | Fale com o administrador da empresa. |
| Este utilizador foi desactivado. Contacte o administrador da sua empresa. | O seu utilizador está Inactivo. | Fale com o administrador da empresa. |
| A sua identidade foi reconhecida, mas ainda não existe um utilizador associado numa empresa GestPro. Contacte o administrador da sua empresa. | A palavra-passe está certa, mas não há utilizador seu em nenhuma empresa. | Peça ao administrador que o crie. |
| A subscrição da sua empresa está fechada. Só um administrador pode entrar para regularizar o pagamento. | A subscrição terminou e o acesso da empresa está fechado; o seu perfil não gere a subscrição. | Fale com o administrador da empresa: ele entra e paga em **Subscrição**. |
| O acesso da sua empresa está suspenso pela GestPro. Contacte o suporte GestPro. | O acesso foi fechado pela GestPro (não por falta de pagamento). | Contacte o suporte GestPro. |
| O serviço de identidade não respondeu. Tente de novo dentro de momentos — não é problema das suas credenciais. | Falha temporária do serviço. | Tente de novo daí a pouco. |
| Já existe uma conta registada com este NUIT. Inicie sessão ou recupere a palavra-passe. | O NUIT já tem conta no GestPro. | Entre com a conta existente ou peça acesso ao administrador dela. |
| Este endereço de e-mail já está associado a uma conta GestPro. Cada pessoa tem uma única identidade, numa única empresa — quem gere duas empresas precisa de dois endereços de e-mail distintos. | O e-mail já pertence a outra conta. | Use outro endereço. |
| NUIT inválido (9 dígitos não repetidos) | O NUIT não tem formato válido. | Corrija o NUIT. |
| As palavras-passe não coincidem | A confirmação é diferente da palavra-passe. | Escreva a mesma nos dois campos. |
| A palavra-passe tem de ter pelo menos 10 caracteres | Palavra-passe curta. | Escolha uma com 10 ou mais caracteres. |
| Verificação anti-robô falhou. Actualize a página e tente de novo. | A verificação não foi aceite. | Actualize a página e repita. |
| Demasiados pedidos. Tente mais tarde. / Demasiados pedidos para este email. | Muitas tentativas de registo seguidas. | Espere e tente mais tarde. |
| A palavra-passe actual está incorrecta. | No ecrã de troca, a palavra-passe provisória está errada. | Escreva exactamente a que o administrador lhe deu. |
| A nova palavra-passe tem de ser diferente da actual | Repetiu a provisória. | Escolha outra. |
| Demasiadas tentativas. Tente novamente dentro de N minutos. | Muitas tentativas de troca falhadas. | Espere o tempo indicado. |
| A ligação de confirmação expirou (é válida 24 horas). Inicie sessão e peça uma nova a partir do aviso no painel. | Abriu a ligação passadas 24 horas. | Entre e clique em **Reenviar ligação** no Dashboard. |
| Já foram enviadas demasiadas mensagens. Tente novamente dentro de N minutos. | Pediu o reenvio muitas vezes. | Espere o tempo indicado. |
| Para emitir documentos fiscais é preciso confirmar o endereço de e-mail da conta — … | Tentou emitir com o e-mail por confirmar. | Confirme o e-mail (ver acima). Se já confirmou, termine a sessão e entre de novo. |
| Para criar utilizadores é preciso confirmar o endereço de e-mail da conta — … | Idem, ao criar um utilizador. | Idem. |
| Sem permissão para esta operação | O seu perfil não tem a permissão que esta acção exige. | Peça ao administrador que lhe atribua um papel com essa permissão. |
| Sem permissão — Não tem permissão para consultar esta página. Contacte o administrador do sistema. | Abriu o endereço de um ecrã que o seu perfil não pode consultar. | Idem. |
| Indique o e-mail / E-mail inválido | No ecrã **Recuperar palavra-passe**, o e-mail está vazio ou mal escrito. | Corrija o endereço. |
| Demasiados pedidos. Tente mais tarde. | Pediu mais de 10 exportações (ou PDF/mapas) por minuto no mesmo ecrã. | Espere um minuto e repita. |
| A sua subscrição terminou e a conta está em modo de leitura. Pode consultar e exportar tudo o que é seu; para voltar a gravar, subscreva um plano. | A empresa está em Modo de Leitura. | O administrador (ou gestor) subscreve um plano em **Subscrição** — ver capítulo 11. |

## Perguntas frequentes

**Esqueci-me da palavra-passe. Tenho de falar com o administrador?** Não necessariamente: no ecrã
de entrada, clique em **Esqueceu-se da palavra-passe?** e siga a ligação que recebe por e-mail. Se
o e-mail não chegar, o administrador pode repor-lhe a palavra-passe.

**Posso usar o mesmo e-mail em duas empresas?** Não. Cada e-mail pertence a uma única empresa
GestPro; use endereços diferentes.

**O registo pede cartão?** Não. Os 14 dias de teste são sem cartão; só paga quando subscrever um plano.

**Não recebi o e-mail de confirmação. Posso continuar a trabalhar?** Sim: pode configurar a empresa,
criar clientes e produtos, etc. Só não emite documentos fiscais nem cria utilizadores até confirmar.
