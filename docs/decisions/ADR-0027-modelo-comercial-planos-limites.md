# ADR-0027 — Modelo comercial: planos, limites e ciclo de vida do acesso

- **Estado**: Proposto
- **Data**: 2026-09-11
- **Contexto**: Spec 19 (Onboarding, Provisionamento e Faturação) · Wave 8
- **Relacionados**: [ADR-0009](./ADR-0009-moeda-faturacao-saas.md), [ADR-0021](./ADR-0021-fiscalidade-subscricao-saas.md), [ADR-0011](./ADR-0011-fronteira-autorizacao.md), [ADR-0013](./ADR-0013-migracao-identidade.md), [ADR-0017](./ADR-0017-ciclo-vida-armazenamento.md), [ADR-0026](./ADR-0026-adiamento-fornecedor-infraestrutura.md)
- **Skills**: `engineering:architecture`, `api-conventions`, `prisma-conventions`

## Contexto

O ADR-0009 fixou **em que moeda** se cobra a subscrição e o ADR-0021 trata do **desfecho fiscal**.
Nenhum dos dois diz **o que se vende**. Essa lacuna deixou o produto num estado incoerente que só se
vê ao ler o código:

**Os limites publicados não existem.** `src/lib/planos.ts` declara `utilizadores`, `armazens`,
`documentosMes` e `produtos` por plano, e os únicos leitores são o ecrã de faturação — que os mostra —
e `GET /api/publico/planos`, que os serve ao site de marketing. Nenhum serviço conta coisa nenhuma. O
Tenant no plano Básico, anunciado com 3 utilizadores, cria o quarto sem qualquer atrito.

**Há duas cópias do plano.** `Assinatura.planoAssinatura` e `ConfiguracaoFiscal.planoAssinatura`. A
mudança de plano escreve só a primeira (`assinatura.service.ts`); a segunda é escrita no
provisionamento e pela administração. **Divergem** — e o ecrã de administração de tenants filtra pela
cópia desactualizada (`tenant-admin.service.ts`).

**Há dois donos do mesmo interruptor.** `ConfiguracaoFiscal.statusAtivo` é escrito pelo webhook do
Stripe por razão **comercial** e pela administração por decisão da **GestPro** (suspender um tenant
por abuso). São dois motivos distintos a partilhar um booleano: quem escrever por último ganha, e um
tenant suspenso por abuso é reactivado pelo pagamento seguinte.

**O bloqueio é total e é ao início da sessão.** Fim de trial, cancelamento voluntário e terceira falha
de cobrança convergem todos em `statusAtivo = false`, e `lib/auth.ts` recusa a sessão. O cliente não
entra — nem para exportar o seu próprio livro-razão. Num ERP que guarda documentos que a lei
moçambicana obriga o cliente a conservar, isso é reter o arquivo fiscal de outra empresa como alavanca
de cobrança.

Falta ainda um número que **não** se decide aqui: o preço absoluto por plano. O ADR-0026 §5 fá-lo
depender de «tenants por instância», que a task 3.9 do desempenho ainda não produziu. Os valores
actuais (29 / 79 / 199 USD) ficam como estão até esse número existir.

## Decisão

### 1. O preço é do escalão, nunca do assento

Mantêm-se três planos — Básico, Profissional, Empresarial. Acrescentar um Utilizador dentro do Limite
não altera o que se paga. O preço por assento fica **rejeitado**, não adiado.

### 2. Só é limite o que é verificado

O catálogo passa a publicar apenas o que o produto aplica:

| Limite | Estado | Contagem |
|---|---|---|
| Utilizadores | **Aplicado** | `User` do tenant com `ativo = true` |
| Armazéns | **Aplicado** | `Localizacao` com `tipo = ARMAZEM`, `ativa = true`, `deletedAt = null` |
| Documentos por mês | **Retirado do catálogo** | — |
| Produtos | **Retirado do catálogo** | era `-1` em dois dos três planos |

Um número publicado que ninguém aplica não é um limite, é uma promessa — e o primeiro cliente que
descobrir passa a tratar todo o catálogo como decorativo.

Desactivar um Utilizador liberta o lugar **de imediato**, sem esperar pelo fim do ciclo. O Utilizador
desactivado continua a ser o autor das acções que praticou: deixa de custar dinheiro, não deixa de
existir. A unidade contada é o `User` local, não a Identidade no Keycloak — uma Identidade sem `User`
não obtém sessão (ADR-0011), logo não deve custar dinheiro.

### 3. A verificação é dura, e a corrida é aceite

Exceder um Limite faz falhar a criação com erro de regra de negócio, no serviço, nomeando o plano e o
caminho para o mudar. São **dois** pontos de verificação — criar/reactivar `User` e criar `Localizacao`
de tipo `ARMAZEM` — e cada um faz o seu `COUNT`; não há abstracção partilhada para dois sítios.

Duas criações simultâneas podem passar ambas e deixar o Tenant um acima do Limite. **Aceita-se.** O
desfecho é uma conversa de vendas, não corrupção de dados, e serializar na linha da Assinatura
(`FOR UPDATE`, como em `proximoNumeroSerie`) travaria toda a criação de utilizadores do Tenant para
evitar um caso raro.

### 4. Estar acima do Limite é um estado tolerado, nunca uma acção nossa

O Tenant pode descer de plano com mais utilizadores do que o plano de destino permite, e um Limite do
catálogo pode ser baixado sobre Tenants antigos. Em qualquer dos casos fica **excedido**: usa o que
tem, não cria mais, vê o excesso. O GestPro **nunca** escolhe quais das pessoas do cliente perdem o
acesso, e nunca recusa o downgrade — recusá-lo empurra quem quer poupar para o cancelamento.

### 5. `Assinatura` é a fonte de verdade única do plano

`ConfiguracaoFiscal.planoAssinatura` é **apagado**. A administração de tenants passa a ler e filtrar
pela `Assinatura`.

### 6. `EstadoAssinatura` ganha `LEITURA`, e os dois interruptores separam-se

Qualquer transição para fora de `ATIVA` ou `TRIAL` — fim de trial, cancelamento voluntário, falha de
cobrança — passa por **`LEITURA` durante 30 dias**. Uma regra, um prazo, um estado: três caminhos com
três prazos diferentes é o que ninguém acerta a implementar nem consegue explicar ao cliente.

Em `LEITURA` a sessão **abre**. O bloqueio de escrita vive no pipeline — `createSafeAction` e
`withApi` — com uma lista de excepções curta e explícita: **pagar e exportar têm de continuar a
passar**, senão prende-se o cliente num estado de onde ele não pode sair.

`ConfiguracaoFiscal.statusAtivo` deixa de ser escrito pelo webhook e passa a significar **apenas**
«desactivado por decisão da GestPro». O Stripe e a GestPro deixam de escrever no mesmo sítio: um
tenant suspenso por abuso não é reactivado por um pagamento.

Durante o trial valem os Limites do plano escolhido no registo, não os do Básico.

### 7. Nada se apaga por temporizador

Ao fim dos 30 dias de `LEITURA` fecha-se o acesso e **os dados ficam**. Apagar é um acto pedido pelo
cliente, explícito, e segue o procedimento do ADR-0017. Um `cron` que apaga registos fiscais de outra
empresa é um incidente à espera de acontecer; o custo de guardar os dados de um tenant morto é
irrisório ao pé disso.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Escalão puro com limites aplicados** ✅ | Preço previsível, que é o que a PME moçambicana compra; catálogo volta a ser um contrato | Deixa dinheiro na mesa no tenant grande dentro do escalão |
| Preço por assento | Receita acompanha o uso; conversão de trial mais barata | Num ERP com trilho de auditoria, paga a quem partilha credenciais — perde-se o autor de cada acção auditada |
| Híbrido (escalão + assento acima de N) | Captura o tenant grande sem punir o pequeno | Mesma pressão sobre a partilha de credenciais; proração do Stripe entra no desenho. Acrescentável depois sem partir nada |
| Manter os limites como marketing | Zero trabalho | O primeiro cliente que testar descobre que o catálogo não vale nada |
| Aplicar também `documentosMes` | Tecto de volume real | Recusar a emissão de um documento fiscal por razão comercial mete o contrato de venda dentro de um acto do Estado, e pune o tenant que cresce |
| Manter o corte total de acesso | Alavanca de cobrança máxima | Reter o arquivo fiscal do cliente; o cliente que sai conta a história a toda a gente |
| Apagar automaticamente ao fim de N meses | Custo de armazenamento previsível | Apaga registos que a lei obriga o cliente a conservar, por temporizador, sem ninguém decidir |

Racional: das duas incoerências que este ADR fecha, a cara é a dos limites decorativos — mas a
perigosa é a dos dois donos do mesmo booleano. A primeira custa credibilidade; a segunda reactiva
silenciosamente um tenant que foi suspenso por abuso.

## Consequências

- **Migração**: cai `ConfiguracaoFiscal.planoAssinatura`; `EstadoAssinatura` ganha o valor `LEITURA`.
  Acrescentar valor a um enum é aditivo e seguro; a coluna que cai exige que
  `tenant-admin.service.ts` passe primeiro a ler da `Assinatura`, senão o ecrã de administração parte.
- **`src/lib/planos.ts`** perde `documentosMes` e `produtos` de `LimitesPlano`. É contrato público
  (`GET /api/publico/planos`, consumido pelo site da spec 18) — o site deixa de mostrar dois números.
  Não há migração de schema: o ADR-0009 já garantiu que preço e limites vivem em constante, não em BD.
- **O pipeline ganha uma verificação de escrita.** `createSafeAction` e `withApi` passam a recusar
  mutações em `LEITURA`. A lista de excepções (faturação, exportação) é a parte frágil: uma excepção
  em falta prende o cliente, uma a mais fura o bloqueio. Merece teste próprio.
- **Um `cron` novo**, ou uma extensão do `expirar-trials`, para a transição `LEITURA` → fechado ao fim
  dos 30 dias.
- **A administração de tenants** passa a distinguir «sem acesso por não pagar» de «desactivado pela
  GestPro». São dois motivos, com dois donos, e a UI tem de os mostrar como tal.
- **Fica por decidir o preço absoluto**, e de propósito: depende de «tenants por instância»
  (ADR-0026 §5, task 3.9 do desempenho, pendente). Este ADR fixa a **forma** do modelo comercial; os
  números entram sem o alterar.
- **O híbrido escalão + assento continua possível** — o ponto 1 rejeita o assento como *eixo*
  principal, não proíbe um adicional acima do Limite se algum dia os números o exigirem.
- **Glossário**: `CONTEXT.md` ganhou os termos Plano, Assinatura, Limite do plano, Trial, Leitura e
  Excedido nesta mesma sessão.
