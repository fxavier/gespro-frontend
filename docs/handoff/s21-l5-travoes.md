# Handoff — spec 21, lane L5 (`s21-travoes`), tarefa 5

Ramo: `s21-travoes`, criado de `ws-21` com a **L1** (registo com palavra-passe) e a **L4**
(`email_verified` na sessão) já fundidas.
Governa: **ADR-0031**, secção «O que a verificação pendente trava»; ADR-0027 §3 e §6;
`design.md` §5; `docs/handoff/s21-l4-verificacao-email.md` §4.
**Migrações: nenhuma.** O estado de verificação continua a viver só no Keycloak.

## 1. O que ficou feito

| Tarefa | Estado |
|---|---|
| 5.1 Emitir documento fiscal recusado sem verificação | feito |
| 5.2 Criar **ou reactivar** `User` recusado sem verificação | feito |
| 5.3 Checkout, Portal e exportação passam — com teste explícito | feito |
| 5.4 Transição nos dois sentidos para 5.1 e 5.2 | feito |

`pnpm check` verde (93 ficheiros, 1363 testes — eram 91/1326), `pnpm gates` verde.

## 2. Onde está cada travão, e porquê ali

### 5.1 — emitir documento fiscal

`apps/erp/src/server/services/financas/faturacao.service.ts`, função local
`exigirEmailConfirmadoParaEmitir()`, chamada **como primeira instrução** de **quatro** funções:

| Porta | Porquê |
|---|---|
| `emitirFatura` | óbvia |
| `emitirNotaCredito` | óbvia — e é por aqui que passam `devolucao.service` e `troca.service`, que a recebem injectada |
| `emitirNotaDebito` | óbvia |
| `converterProformaEmFatura` | **não é óbvia**: cria uma `Fatura` já `EMITIDA` sem passar por `emitirFatura`. Um travão que só olhasse para as três primeiras deixava esta porta aberta |

Proformas e cotações comerciais **não** são travadas: não são documentos fiscais e cabem no
«configurar, importar, explorar» que o ADR-0031 existe para libertar. Há uma **sentinela para
cada uma** — `criarProforma` e `criarCotacaoComercial` — e são sentinelas, não redundância: o
que importa aqui é a direcção do erro. Um travão a mais numa cotação prende alguém a meio de
uma venda por um documento sem efeito fiscal nenhum, e é o tipo de coisa que uma refactorização
futura acrescenta sem ninguém reparar.

### A venda POS — exclusão deliberada, não esquecimento

`comercial/venda.service.ts` (`criar`) puxa um número da série `VENDA` e grava uma `Venda` com
talão a dinheiro **sem passar por nenhuma das quatro portas acima**. Foi visto e **decidiu-se
não travar**:

- travar o POS partia «configurar, importar, explorar passa», que é o ponto inteiro do
  ADR-0031: quem acaba de se registar e quer ver o produto a funcionar começa justamente por
  bater uma venda de balcão;
- o talão do POS não é o acto irreversível e com efeito para terceiros que o ADR-0031 nomeia —
  é o registo interno de uma venda. Quando essa venda vira **factura**, passa por
  `emitirFatura`, e aí o travão morde;
- travar o POS por causa da série seria travar pela numeração e não pelo efeito, e a série
  `VENDA` convive no mesmo enum com as fiscais por razões de implementação, não de fiscalidade.

Fica escrito porque uma omissão não registada lê-se como esquecimento, e alguém a «corrigiria».
A fronteira do conceito «documento fiscal» é matéria do ADR-0031 — o orquestrador regista-a lá,
não esta lane.

O travão corre **antes** de `prismaBase.$transaction` — nunca se abre transacção para um pedido
que vai ser recusado, e a recusa nunca acontece depois de gravar. Há teste a fixá-lo.

### 5.2 — criar ou reactivar `User`

`apps/erp/src/server/services/plataforma/user-admin.service.ts`, função local
`exigirEmailConfirmadoParaGerirUtilizadores(acto)`:

- `criarUtilizador` — **primeira instrução de todas**, antes até do `inviteLimiter.consume`:
  não se gasta quota do limitador de convites num pedido que nunca vai passar. Trava os dois
  modos de acesso (convite e palavra-passe atribuída): o vector é convidar terceiros, não o
  transporte da credencial.
- `actualizarUtilizador` — só quando `input.ativo === true` e o utilizador estava inactivo.
  **Reactivar conta como criar**: uma identidade desligada que volta a ligar-se é entrada nova
  no produto, e `desactivar → reactivar` seria a porta das traseiras óbvia de um travão que só
  olhasse para a criação.
- **Desactivar não é travado**, nem por aqui nem por `desactivarUtilizador`. Um estado de onde
  o cliente não pode sair é uma armadilha (ADR-0027 §6, mesmo argumento do `LEITURA`), e fechar
  uma conta nunca pode depender de um e-mail. Mudar o nome, atribuir papéis e repor a
  palavra-passe de quem **já existe** também passam — não criam ninguém.

### 5.3 — o que tem de passar

`apps/erp/src/server/services/plataforma/__tests__/travao-verificacao-nao-trava.test.ts`.
Nenhum código de produção foi alterado para isto — é o ponto. O ficheiro chama
`iniciarCheckout`, `abrirPortalCliente` e a **rota real** `GET /api/export/[modulo]` (registry
real, só a leitura de domínio dublada) com uma sessão cujo `emailVerificado` é `false`, e exige
200/sucesso. Serve de detector: se alguém acrescentar uma verificação de e-mail a qualquer um
dos três caminhos — no serviço, no `withApi` ou no `createSafeAction` — é aqui que acende.

## 3. Códigos de erro estáveis criados

| Código | Onde | Estado HTTP |
|---|---|---|
| `EMAIL_POR_CONFIRMAR_EMISSAO` | `financas/faturacao.service.ts` | 409 (`BusinessRuleError`) |
| `EMAIL_POR_CONFIRMAR_UTILIZADORES` | `plataforma/user-admin.service.ts` | 409 (`BusinessRuleError`) |

**Dois códigos, não um.** Não há abstracção partilhada, e não faria sentido partilhar o código
de erro de dois travões que vivem em serviços diferentes, são verificados por leituras
diferentes e dizem coisas diferentes a quem os lê. A UI consegue distingui-los sem ler a
mensagem. A mensagem de 5.2 muda de verbo («criar utilizadores» / «reactivar utilizadores») —
quem leva com a recusa ao reactivar não recebe um texto que só fala de criar.

## 4. Sem abstracção partilhada — e porquê não protestei

Cada travão é uma função privada do seu ficheiro, com a sua própria leitura da sessão. Não
existe `guardaVerificacao()`, e concordo que não deve existir: são **dois** sítios, e dois
sítios não justificam um mecanismo. É a mesma escolha e o mesmo racional do ADR-0027 §3 para os
limites de plano, e tem aqui uma razão adicional — os dois travões não são o mesmo travão. O da
emissão é binário; o dos utilizadores discrimina criar de reactivar de desactivar. Uma
abstracção comum teria de crescer um parâmetro no primeiro dia.

`safe-action.ts` e `with-api.ts` **não foram tocados** — são do #33 do ADR-0027, e um travão
global no pipeline é exactamente o que este spec não faz: dois actos recusados, o resto do
produto a passar.

O travão vive no **serviço**, não no formulário: um botão desactivado não é defesa, porque a
Server Action aceita o que lhe mandarem.

**Desvio de convenção, nomeado:** `await auth()` dentro de um serviço de domínio quebra a regra
da casa de que «o serviço recebe `Ctx` e não vai buscar contexto sozinho». Foi deliberado e não
tinha alternativa dentro desta lane: o ADR-0031 manda verificar no próprio serviço com a sua
leitura, e a alternativa limpa — pôr `emailVerificado` no `Ctx` — obrigava a tocar no
`safe-action.ts`, que é do #33 do ADR-0027 e está fora da lane. O sítio certo para isto
regressar à convenção é quando o #33 reescrever o pipeline: aí o `emailVerificado` entra pelo
`Ctx` e as duas funções de travão passam a lê-lo do parâmetro em vez da sessão, sem mudar nem o
sítio do travão nem os códigos de erro.

## 5. A janela dos 15 minutos — como foi tratada

Confirmar o e-mail só chega à sessão na re-resolução seguinte (ADR-0031 §6, ADR-0011): há uma
janela real, até 15 minutos, em que alguém já confirmou e o travão ainda morde. **Não foi
resolvida com uma chamada ao Keycloak** — seria uma chamada de rede por operação para encurtar
um atraso de minutos, e o ADR-0031 §6 proíbe-a explicitamente.

Foi tratada onde custa nada: **na mensagem**. As duas recusas terminam com

> «Se já confirmou há pouco, a sessão só o reflecte na actualização seguinte (até 15 minutos) —
> terminar e iniciar sessão outra vez aplica a confirmação de imediato.»

Assim a mensagem é verdadeira nos dois casos — para quem não confirmou e para quem confirmou há
dois minutos — e dá a saída imediata a quem está na janela, em vez de o deixar a carregar em
«reenviar». É a mesma escolha que a L4 já fez no aviso do painel (`?verificacao=ok`); aqui
aplica-se ao sítio onde a pessoa bate quando não passou pelo painel. **Há testes a exigir esta
frase**, nos dois travões: se alguém encurtar a mensagem, acendem.

Nota deliberada: não se distingue «nunca confirmou» de «confirmou agora». Distinguir exigiria
ler o Keycloak — que é precisamente o que não se faz.

## 6. Fail-closed, e o que isso implica

A leitura é `session.user.emailVerificado === true`. Tudo o resto — sessão nula, `user` ausente,
campo ausente (JWT emitido antes da L4), valor que não seja o booleano `true` — conta como **não
confirmado**. É o que a L4 já faz com o claim em falta, e é o lado seguro para um acto
irreversível e com efeito para terceiros. Há teste para cada uma destas variantes.

**Consequência a assumir: estes dois caminhos deixaram de servir chamadores sem sessão.** Hoje
não há nenhum (as quatro rotas de cron não emitem nem criam utilizadores; o provisionamento cria
o primeiro `User` directamente em Postgres, não pelo serviço; os seeds só mencionam
`emitirFatura` num comentário). Quem vier a construir **facturação recorrente**, um cron de
emissão ou uma importação em lote de colaboradores vai bater nisto.

Para que essa pessoa tropece **antes** e não depois, o aviso não fica só aqui: está no
**docblock de cada travão**, em negrito, na primeira coisa que se lê ao abrir a função —
incluindo o que **não** fazer, que é abrir uma excepção ao travão. A decisão que falta tomar
nesse dia é o que significa «e-mail confirmado» para um processo sem pessoa, e essa decisão é de
ADR, não de quem estiver a escrever o cron.

## 7. `await import('@/lib/auth')` — porquê, e o que evitou

A sessão entra nos dois serviços por **import dinâmico**, não estático. Duas razões:

1. `@/lib/auth` arrasta o `next-auth` inteiro. `faturacao.service.ts` é importado por todos os
   caminhos de leitura de facturação e `user-admin.service.ts` por todas as páginas de
   core-tenancy — inclusive as que nunca emitem nem criam nada. Com import dinâmico, o custo só
   existe quando o travão corre. É o mesmo motivo (e o mesmo padrão) com que a L4 importa o
   transporte de e-mail dentro de `keycloak.ts`.
2. **Medido, não suposto:** com import estático, quatro ficheiros de teste que nada têm que ver
   com este spec deixavam de carregar (`comercial/venda-integracao`,
   `compras/state-machines.property`, `operacoes/ticket-sla`,
   `plataforma/wave3-integration`) — `next-auth` não resolve fora do runtime do Next. Com import
   dinâmico, **zero** ficheiros fora da lane precisaram de ser tocados.

Nos testes, `vi.mock('@/lib/auth', …)` cobre o import dinâmico na mesma — é o padrão já usado em
seis ficheiros do repositório.

## 8. Como se provou que os travões travam

Cada teste foi **desfeito e visto a acender**. Dezassete mutações aplicadas ao código de
produção, todas com a suite a falhar:

- travão removido de cada uma das quatro portas de emissão, **uma a uma**, e das quatro de uma
  vez;
- travão tornado vacuoso (`return` imediato), nos dois serviços;
- fail-closed trocado por fail-open (`!== false`), nos dois serviços;
- mensagem encurtada sem a frase dos 15 minutos, nos dois serviços;
- travão removido da criação e da reactivação de `User`, separadamente;
- **travões a mais**: verificação posta em `criarProforma`, na desactivação de `User`, no
  Checkout, no Portal e na rota de exportação.

Nenhuma mutação passou silenciosa. Acrescentou-se depois uma décima oitava (travão a mais em
`criarCotacaoComercial`), que também acende.

**O guião não sobreviveu.** As mutações foram aplicadas e revertidas em `/tmp`, e nada disso
está no repositório — portanto **esta secção é testemunho, não é reproduzível por quem a lê**.
Foi escolha e não descuido: os guiões casam com o código-fonte por correspondência literal de
texto (a linha exacta da chamada, o cabeçalho exacto da função). Comprometidos, deixariam de
encontrar as âncoras ao primeiro `rename` e passariam a «não encontrei nada, portanto está
tudo bem» — uma ferramenta de verificação que apodrece em silêncio é pior do que nenhuma. Quem
quiser reproduzir: apagar cada `await exigirEmailConfirmado*` e cada linha marcada nas famílias
acima, e correr os três ficheiros de teste.

## 9. Ficheiros

**Novos**
- `apps/erp/src/server/services/financas/__tests__/travao-emissao-verificacao.test.ts` (19 testes)
- `apps/erp/src/server/services/plataforma/__tests__/travao-verificacao-nao-trava.test.ts` (4 testes)

**Alterados (dentro do que a lane possui)**
- `apps/erp/src/server/services/financas/faturacao.service.ts` — **só acrescentado**: a função
  do travão, quatro chamadas, e o aviso da §6 no docblock. Nada do que lá estava mudou de
  comportamento.
- `apps/erp/src/server/services/plataforma/user-admin.service.ts` — idem: a função do travão e
  duas chamadas.
- `apps/erp/src/server/services/plataforma/__tests__/user-admin.service.test.ts` — dublagem de
  `@/lib/auth` (por omissão **confirmado**, para os testes que já existiam continuarem a
  exercitar o que exercitavam) + 14 testes do travão. O diff do ficheiro é só adição.

  Nota de padrão, para quem escrever os próximos testes deste ficheiro: o `prepararCriacao()`
  que escrevi **não** usa `mockResolvedValueOnce`, e é de propósito. Quando um travão recusa
  cedo, as respostas enfileiradas não chegam a ser consumidas e o `vi.clearAllMocks()` do
  `beforeEach` **não** esvazia a fila — o teste seguinte herda-as e falha por um motivo que não
  tem nada que ver com ele. Apanhei-o na primeira corrida destes testes; a saída é um contador
  local, que não deixa resíduo. Os testes que já existiam no ficheiro usam `…Once` e estão
  correctos, porque consomem sempre o que enfileiram — o padrão só se parte quando há uma recusa
  antecipada pelo meio.

**Nada mais foi tocado.** `safe-action.ts`, `with-api.ts`, `lib/auth.ts`, `keycloak.ts`,
`middleware.ts`, `next.config.ts`, `provisioning/**`, `app/registo/**`, `api/publico/**`,
`apps/site/**`, `docs/decisions/**` e `.kiro/**` estão intactos.

## 10. Gaps deixados, com motivo

1. **A skill `estado-com-escritor` não existe** — nem em `.claude/skills/` deste repositório nem
   em `~/.claude/skills/`. É nomeada pela tarefa 5, pelo `design.md` §5 e pelo Requisito 8.5.
   Seguiu-se o que os três documentos dizem dela por extenso (transição nos dois sentidos, teste
   por travão) e acrescentou-se a prova por mutação da §8. Alguém tem de decidir se a skill vai
   ser escrita ou se as referências devem ser corrigidas.
2. **Sem E2E.** A tarefa 9.2 (registo → sessão → aviso → verificação → travão levantado) é do
   orquestrador na fase 4. O que esta lane prova é unitário, mas prova-o nos dois sentidos e com
   as mutações a acender.
3. **A UI não mostra estes erros de forma distinta.** As Server Actions devolvem
   `ActionResult.error.code` com os dois códigos novos; os formulários mostram a mensagem, que é
   explícita e suficiente. Se se quiser um ecrã dedicado («confirme o e-mail para emitir»), é
   trabalho de UI e não desta lane.
4. **O segundo travão de `criarUtilizador` (#37 do ADR-0027, limite de Utilizadores do plano)
   não teve terreno preparado**, como pedido. Quando entrar, fica lado a lado com este, sem
   abstracção comum — e a ordem natural é o limite **depois** deste, porque este é mais barato
   (não conta nada).
5. **Exclusões deliberadas, todas nomeadas para ninguém as ler como esquecimento:**
   `converterCotacaoEmProforma` (produz uma proforma, e é a função vizinha de uma que **é**
   travada), `criarProforma` e `criarCotacaoComercial` (têm sentinela a fixá-lo) e a **venda
   POS** de `comercial/venda.service.ts`, com o porquê por extenso na §2. A fronteira do
   conceito «documento fiscal» é matéria de ADR e fica para o orquestrador registar no
   ADR-0031.

## 11. Contra o design — nada

Nenhuma decisão desta lane contraria o ADR-0031, o ADR-0027 ou o `design.md`. Não há migrações.
Não se abriram nem alteraram ADRs.
