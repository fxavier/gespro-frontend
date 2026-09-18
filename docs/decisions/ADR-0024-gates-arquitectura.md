# ADR-0024 — Reforço dos gates de arquitectura

- **Estado**: Proposto
- **Data**: 2026-08-21
- **Contexto**: Spec 20 (Prontidão para Produção) · Wave 8
- **Relacionados**: [ADR-0003](./0003-gate-wave1-arbitragens.md), [ADR-0015](./ADR-0015-auditoria-documentos-financeiros.md), [ADR-0023](./ADR-0023-governacao-documentacao.md)
- **Skills**: `engineering:architecture`, `engineering:tech-debt`

## Contexto

O GestPro tem três gates de arquitectura em `scripts/gate-*.mjs`, todos a zero violações: modais fora
do permitido, `'use client'` em páginas de listagem e detalhe, e *imports* de dados simulados. Provaram
o seu valor — mantiveram invariantes de interface intactas em 219 páginas migradas por sete agentes em
paralelo.

O padrão que os une é claro: **quando uma invariante é verificada por automação, sobrevive; quando
depende de disciplina, erode.** Esta wave junta evidência a essa observação, através de três falhas
com a mesma forma:

- A auditoria dos documentos financeiros ficou por fazer porque a intenção estava num **comentário**,
  não num gate (ADR-0015).
- Três ADRs colidiram no número 0005 porque a numeração dependia de as pessoas consultarem um índice
  (ADR-0023).
- Cerca de 140 violações das regras do compilador React foram rebaixadas a aviso na Wave 0, com o
  compromisso de as levar a zero nas *waves* de interface. Continuam por resolver, porque um aviso não
  falha nada.

Há ainda uma invariante central da arquitectura que **nunca teve gate nenhum**: a comunicação entre
domínios apenas por funções de contrato publicadas. É a regra que sustenta o monólito modular inteiro,
está no `CLAUDE.md` e no [ADR-0003](./0003-gate-wave1-arbitragens.md), e nada a verifica. Hoje é
respeitada; nada impede que o próximo agente com pressa importe um serviço interno de outro domínio.

## Decisão

**Acrescentar três gates e converter os avisos tolerados em erros, por etapas.**

### 1. Gate de fronteira entre domínios — `gate-dominios.mjs`

Um ficheiro em `src/server/services/<A>/` só pode importar de `src/server/services/<B>/` se o alvo for
um **contrato publicado**: o `index.ts` do domínio ou um ficheiro `*.interface.ts`. Importar
`*.service.ts` de outro domínio **falha o merge**.

Excepção declarada e única: `stock.service.ts`, `caixa.service.ts`, `faturacao.service.ts` e
`contabilidade.service.ts` são importados directamente pelos consumidores por serem os pontos de
entrada dos contratos A e D. Ficam numa lista branca explícita no gate, com comentário a explicar
porquê — e quem lá quiser acrescentar uma entrada tem de justificar por escrito, em revisão.

É o gate mais importante desta wave: protege a invariante de que depende toda a arquitectura.

### 2. Gate de auditoria — `gate-auditoria.mjs`

Definido no ADR-0015. Todo o modelo de `financas.prisma` que represente documento ou movimento
monetário tem de constar de `AUDIT_MODELS`. Impede que a omissão que originou aquele ADR se repita.

### 3. Gate de índice de ADR

Definido no ADR-0023. Corre como teste em vez de gate, por ser mais natural exprimi-lo assim.

### 4. Avisos convertidos em erros, por etapas

As cerca de 140 violações não se resolvem num *pull request* sem gerar uma revisão que ninguém lê. O
plano é:

| Etapa | Acção |
|---|---|
| 1 | Inventariar por regra e por módulo, e publicar a contagem em `docs/handoff/w8-lint.md` |
| 2 | Fixar a contagem actual como **tecto**: o CI falha se o número **subir**. Impede a erosão imediatamente, sem exigir a correcção completa |
| 3 | Corrigir por módulo, baixando o tecto a cada *pull request* |
| 4 | Quando chegar a zero, promover a regra a erro e remover o mecanismo de tecto |

O tecto é a parte que interessa: converte um problema que cresce num problema que só encolhe.

### 5. Fixação de versões

O especificador de TypeScript passa de `^5` para versão exacta, em ambas as aplicações. O
[documento de arquitectura](../GestPro-Arquitectura-e-Estado.pdf) apurou que a divergência 5.9.3/5.8.3
registada no *handoff* da Wave 7 **não é reproduzível** no repositório actual — o ficheiro de *lock*
resolve 5.8.3 para as duas. O que subsiste é a causa: um especificador com intervalo permite que uma
instalação sem *lock* volte a introduzir a diferença, e com ela erros de tipo que o portão não vê.
Ferramentas que decidem se o código compila são fixadas exactamente.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Gates em script próprio, com tecto para o lint** ✅ | Consistente com o que já existe e funciona; mensagens de erro específicas do domínio; o tecto trava a erosão sem exigir correcção total já | Mais três scripts para manter; verificação por análise de texto, não de árvore sintáctica |
| Regra ESLint personalizada (`no-restricted-imports`) | Integrada na ferramenta que já corre; funciona no editor | O repositório já tem `eslint-rules/` — mas a fronteira entre domínios exige conhecer o domínio do ficheiro **de origem**, o que é mais natural num script próprio |
| `dependency-cruiser` | Feita exactamente para isto; grafo de dependências e visualização | Mais uma ferramenta e mais um formato de configuração para uma regra que se exprime em 40 linhas |
| Corrigir os 140 avisos de uma vez | Fecha o assunto | Um *pull request* dessa dimensão não é revisto com atenção; e não impede que voltem a aparecer |
| Não acrescentar gates | Zero trabalho | A fronteira entre domínios continua sem verificação — e é a invariante de que depende a arquitectura toda |

## Consequências

- **Cinco gates em vez de três**, mais um teste de índice. O comando `pnpm gates` cresce e continua a
  correr em segundos — são verificações de texto, não compilação.
- **O gate de domínios pode revelar violações já existentes.** Se revelar, a primeira execução
  documenta-as e cada uma é triada: corrigir ou justificar na lista branca. Não se acrescenta à lista
  branca por conveniência.
- **O tecto do lint tem de ser um número num ficheiro versionado** para que baixar exija *pull request*
  e subir seja impossível. É o mesmo padrão do limiar de desempenho do ADR-0018.
- **Fixar o TypeScript significa actualizá-lo deliberadamente**, com *pull request* próprio. É o
  comportamento pretendido para uma ferramenta que decide se o código compila.
- **Custo de manutenção real.** Um gate mal escrito que gere falsos positivos é pior do que gate
  nenhum: ensina a equipa a contorná-lo. Cada gate novo entra com testes próprios, exercitando um caso
  que passa e um que falha.
- **Isto é a conclusão operacional do documento de arquitectura**: as invariantes que sobreviveram três
  meses e sete *waves* paralelas foram as que tinham automação. As que dependiam de disciplina — a
  auditoria, a numeração de ADR, os avisos de lint — erodiram todas.
