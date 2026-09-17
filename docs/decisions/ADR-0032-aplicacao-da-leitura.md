# ADR-0032 — Como a Leitura é aplicada

**Estado:** Proposto
**Data:** 2026-09-17
**Depende de:** ADR-0027 (§6, §7), ADR-0011 (§3), ADR-0020, ADR-0022 (§6), ADR-0026 (§2)
**Revê:** o critério de aceitação do ticket #33 sobre a suspensão imediata

## Contexto

O ADR-0027 §6 decidiu a **forma** do fim de vida de uma Assinatura: qualquer saída de `ATIVA` ou
`TRIAL` passa por **Leitura durante trinta dias**, a sessão abre, a escrita não passa, pagar e
exportar continuam a funcionar. O que não decidiu foi o **como** — e o como tem quatro escolhas
que não se desfazem em cinco minutos: que valor fica escrito no fim, como é que o pipeline sabe
que uma operação é uma escrita, quanto tempo demora uma suspensão a morder, e quem é o dono do
interruptor.

O que torna isto urgente não é o ADR: é o site. A FAQ de preços de `gestpro.co.mz` já publica
*«no fim do período escolhe um plano; se não escolher, a conta fica em leitura e os dados
permanecem disponíveis»*. Hoje o código faz o contrário — ao dia 15 o estado passa a `EXPIRADO`,
o `bloqueiaAcesso()` devolve `true` e o cliente **não entra sequer para exportar o livro-razão
que a lei moçambicana o obriga a conservar**. É uma promessa publicada que o produto desmente.

## Decisão

### 1. O estado terminal chama-se `FECHADA`, e é um valor novo

`EstadoAssinatura` ganha **dois** valores: `LEITURA` e `FECHADA`. Os estados vivos passam a ser
quatro — `TRIAL`, `ATIVA`, `LEITURA`, `FECHADA` — e `EXPIRADO`, `SUSPENSA` e `CANCELADA`
**deixam de ser escritos**, ficando no enum apenas para as linhas que já os têm.

Reaproveitar `CANCELADA` como terminal único era a alternativa mais barata: zero valores novos,
e a transição `CANCELADA → ATIVA` já existia para a reactivação. Recusada porque põe **«Cancelada»
na ficha de quem nunca cancelou nada** — quem deixou o Trial acabar não praticou acto nenhum. O
glossário é explícito a evitar nomes que mentem, e uma ficha de cliente é o pior sítio para
começar.

Manter os três terminais, um por motivo, era a outra alternativa: o motivo ficava no próprio
estado e o ecrã de Facturação não mudava. Recusada por duas razões. Obriga a guardar, à entrada
da Leitura, para onde se sai dela — informação que só serve para escolher entre três valores que
se comportam de forma idêntica. E **muda o significado de `SUSPENSA`**: hoje é «dunning esgotado,
e sem acesso»; passaria a ser «fechado trinta dias depois», que é outra coisa com o mesmo nome.

O custo aceite é explícito: **três valores mortos no enum**, que o próximo leitor vai encontrar e
querer «corrigir». É por isso que isto está escrito.

### 2. O bloqueio de escrita é por omissão; quem passa declara-se

O `createSafeAction` **recusa** em Leitura, e quem passa declara-o ao lado da permissão, com uma
bandeira única — `permiteEmLeitura` — como o ticket #33 exige («não numa lista central que alguém
se esquece de actualizar»). São ~58 actions de leitura (as que não declaram `revalidate`) mais as
três de subscrição: iniciar pagamento, abrir o portal e cancelar.

Derivar da presença de `revalidate` era tentador e custava zero anotações: acerta em 300 das 358
actions sozinho. Recusado pelo **modo de falha**. As 58 restantes passariam todas, e nem todas são
leituras — o bloqueio ficaria com buracos silenciosos. Com a bandeira, o erro possível é o inverso:
uma leitura por marcar **prende o cliente**, que reclama no dia seguinte. Entre um bloqueio que
falha a bloquear em silêncio e um que falha a deixar passar em voz alta, escolhe-se o segundo — e
um gate de CI recusa actions sem `revalidate` que também não declarem a bandeira, para a decisão
ser sempre explícita.

Derivar do verbo da permissão foi medido e é inviável: o catálogo tem 58 verbos distintos e
mistura idiomas (`update`/`editar`, `write`/`escrita`, `read`/`leitura`/`ver`/`listar`).

No `withApi` a regra é o método HTTP — são 22 rotas, 19 delas `GET`. As públicas (webhook, cron,
`/api/publico/*`) não têm sessão, e sem sessão não há nada a bloquear.

### 3. A suspensão pela GestPro morde em ≤ 15 minutos, não de imediato

O critério de aceitação do #33 — «invalida a sessão sem esperar pela revalidação» — **não se
cumpre**, e o ticket é corrigido para «≤ 15 minutos».

A razão é que já é assim hoje e foi decidido assim: o `tenantBloqueado()` é lido dentro do
`callbacks.jwt`, e o ADR-0011 §3 recusou expressamente a leitura por pedido («o `jwt` corre em
cada `auth()`, logo em praticamente cada Server Component, e uma consulta por pedido seria um
custo permanente para uma verificação que muda de mês a mês»). Revogar um papel, suspender um
tenant e mudar o estado comercial passam a ter **um prazo só**, que é o que se consegue explicar.

A alternativa em cache partilhada (Valkey) cortaria de imediato sem tocar no Postgres, mas criava
a **primeira chave de cache do produto** — que o ADR-0014 §5 proíbe antes de haver medição
(ADR-0018, pendente) — e punha o Valkey no caminho crítico da autenticação.

Quem precisar de cortar já continua a ter a via manual: `definirActivo(sub, false)` no Keycloak
mata a renovação do *refresh token*.

### 4. `ConfiguracaoFiscal.statusAtivo` fica morto; os donos verdadeiros são outros dois

O interruptor da GestPro **já existe e não é o `statusAtivo`**: é `Tenant.deletedAt`, que o
`auth.ts` já lê sozinho para recusar o login. O `statusAtivo` é a cópia partilhada que os dois
donos escrevem, e é dela que nasce o defeito que o ticket #35 nomeia — **um tenant suspenso por
abuso ser reactivado pelo pagamento seguinte**.

A separação obtém-se **tirando-lhe os escritores**, não acrescentando um interruptor. O
`sincronizarStatusAtivo` desaparece e a função de acesso passa a ler os dois donos verdadeiros:

```
estadoDeAcesso(assinatura.estado, tenantApagado) → 'aberto' | 'leitura' | 'fechado'
```

Pura e *client-safe*, testada como tabela de estados completa, sem base de dados — substitui o
`bloqueiaAcesso()` booleano.

A coluna **não é apagada aqui**: fica morta e cai na mesma migração de contracção que já vai
apagar o `planoAssinatura` (ticket #38), respeitando expandir/contrair do ADR-0022 §6. Nesta
entrega a migração é só aditiva: os dois valores do enum e a data de fim da Leitura.

Fica registado o que **não** se decidiu: `Tenant.deletedAt` continua a fazer dois trabalhos —
«apagado» e «suspenso por decisão nossa». São coisas diferentes a partilhar uma coluna. Separá-las
alarga o âmbito para além do #35 e obriga a rever tudo o que hoje lê `deletedAt`; fica nomeado
para quem lhe pegar.

### 5. O relógio dos trinta dias é uma data absoluta

`Assinatura` ganha `leituraFim DateTime?`, simétrico ao `trialFim` que já existe. O processo
agendado fica com a mesma forma (`campoFim < now()`) e o índice com o mesmo feitio, e dar mais uma
semana a um cliente passa a ser um `UPDATE` numa data em vez de aritmética. Guardar o **início** e
somar trinta dias na consulta foi recusado pela mesma razão.

Derivar de `updatedAt` foi recusado por ser frágil ao ponto de ser perigoso: qualquer escrita na
linha — `motivoCancelamento`, `tentativasFalhadas` — reiniciaria o relógio do cliente.

## O que isto custa

**O cliente em Leitura vê uma faixa, não botões desactivados.** O `PageHeader` recebe `actions`
como `ReactNode` livre em 240 sítios, e é no mesmo bloco que vivem os botões de **Exportar** —
desactivá-lo bloquearia exactamente o que tem de continuar a passar. A faixa é persistente e vive
no *layout* do painel, não só no `/dashboard` como o aviso de e-mail: a pessoa bate no bloqueio em
qualquer página. O que escapar falha com `BusinessRuleError('ACESSO_LEITURA')`.

**Os avisos de subscrição nunca saíram, e é agora que se descobre.** O
`notificarAdministradores` grava com `tx.notificacao.createMany` e `estadoEnvio: 'PENDENTE'`,
contornando o `notificacao.service.criar()`, que é quem despacha — e nada varre as pendentes.
«Período de teste terminado», «Subscrição suspensa», «Subscrição reactivada»: nenhum desses
e-mails alguma vez foi enviado. Numa funcionalidade cujo ponto é o cliente ser avisado e poder
voltar a pagar, isto deixa de ser dívida de outra spec e passa a ser parte desta.

**Nada disto tem efeito sem alguém a chamar o cron.** Não há produção (ADR-0026 §5) e nenhuma das
quatro rotas `/api/cron/*` é chamada por coisa nenhuma no repositório. O agendador passa a ser um
serviço do `docker-compose` no perfil `full` — coerente com o ADR-0026 §2, que faz do ambiente
local a encarnação executável da topologia — com o contrato (rotas, horários, segredo) escrito no
runbook para quem provisionar produção.

## Consequências

- **Migração aditiva**: `EstadoAssinatura` ganha `LEITURA` e `FECHADA`; `Assinatura` ganha
  `leituraFim` e o índice `[estado, leituraFim]`. Acrescentar valores a um enum é seguro.
- **Máquina de estados**: `TRIAL|ATIVA → LEITURA`, `LEITURA → {ATIVA, FECHADA}`,
  `FECHADA → ATIVA`. As três saídas convergem: trial expirado, `subscription.deleted` e dunning
  esgotado passam a escrever `LEITURA` em vez de `EXPIRADO`, `CANCELADA` e `SUSPENSA`.
- **`StatusBadge`** ganha `LEITURA` e `FECHADA` no mapa único, senão aparecem em bruto.
- **`expirar-trials`** passa a fazer duas coisas — abrir a Leitura e fechá-la ao fim dos trinta
  dias — em vez de se criar um quarto processo agendado (ticket #36).
- **Os tickets #33 e #35 mudam de forma**: o #33 perde o critério da suspensão imediata e o #35
  deixa de precisar de um interruptor novo. Ambos ficam mais pequenos do que estavam escritos.
- **Glossário**: `CONTEXT.md` ganhou o termo **Fechado** nesta mesma sessão.

**Reversível:** se a Leitura se revelar uma alavanca de cobrança fraca, voltar ao corte total é
mudar a função de acesso num sítio — ela é pura e é a única a arbitrar. O que não é reversível de
graça são os valores do enum, e é por isso que o §1 existe.

## Verificação

Tabela de estados completa sem base de dados para `estadoDeAcesso`. Teste que uma excepção **em
falta** prende o cliente e outro que uma excepção **a mais** não fura o bloqueio (#33). Fronteira
exacta dos trinta dias, e idempotência do processo agendado (#36). Um pagamento bem-sucedido
**não** reabre um tenant fechado por decisão da GestPro (#35). E o *smoke* que nenhum teste
apanha: trial com `trialFim` no passado → cron → Leitura → sessão abre, listagem carrega,
exportação sai, gravação recusa, checkout passa.
