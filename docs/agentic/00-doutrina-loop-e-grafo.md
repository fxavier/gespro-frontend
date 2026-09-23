# Doutrina de engenharia agêntica — loops e grafos

> Aplica-se a todo o trabalho executado por agentes neste repositório. O primeiro grafo concreto a
> seguir esta doutrina é o da spec 22 (`grafo-22-fluxo-de-caixa.md`).

## 1. As duas unidades

**Loop.** Um agente com um objectivo, um verificador **externo** ao agente, e o retorno do trabalho
reprovado ao agente até uma condição de paragem. É a unidade mínima. Tira o humano da verificação,
não da decisão.

**Grafo.** Vários loops ligados: ramos paralelos, verificadores, passagens de testemunho, vetos e
condições de paragem. O grafo **contém** loops; não os substitui. Um grafo só se justifica quando um
loop único não chega — trabalho que se divide em fatias com donos diferentes, ou que precisa de um
veto por um nó que não é o autor.

Fonte da distinção: [Bouchard, *Graph Engineering vs Loop Engineering*](https://www.louisbouchard.ai/graph-engineering-explained/);
[Perez, *From Loop Engineering to Graph Engineering*](https://medium.com/intuitionmachine/from-loop-engineering-to-graph-engineering-d3ebeb08511c).

## 2. A regra que torna isto engenharia e não teatro

> **A prova tem de vir de fora do sistema.**

Vários agentes no mesmo modelo, a ler o mesmo contexto defeituoso, validam-se uns aos outros com
enorme confiança. É o modo de falha característico do grafo: *disparate organizado à escala*. Um nó
`revisor` que só lê o diff do nó `autor` e diz «está bom» não é um verificador — é um segundo voto
do mesmo eleitor.

Neste repositório, prova externa é uma destas quatro coisas, por ordem de força:

1. **Um invariante matemático que o código tem de satisfazer** e que um property test tenta
   falsificar com milhares de casos gerados (`I1`…`I10` da spec 22).
2. **Uma golden fixture** com números apurados antes da implementação e versionados. Actualizar uma
   fixture para a suite passar é falsificação de prova; qualquer alteração exige justificação
   escrita no PR.
3. **Um processo externo que corre o produto a sério**: `pnpm check`, `pnpm gates`,
   `pnpm test:integration` (Testcontainers, Postgres real), `pnpm e2e` (Playwright contra a app,
   DB e Keycloak reais), `pnpm build` (standalone), k6.
4. **Um humano** com conhecimento que o modelo não tem. Caro e lento — reservado para o que nenhum
   dos três anteriores consegue ver (spec 22, task 15.3).

Uma opinião de um agente **nunca** é prova. Um nó revisor é útil para encontrar problemas; o que o
autoriza a travar um merge é o veredicto sobre um checklist, e o que fecha a porta é o §3.

## 3. Todo o loop declara quatro coisas, por escrito

Um nó sem as quatro não entra no grafo.

| Campo | Pergunta | Mau exemplo | Bom exemplo |
|---|---|---|---|
| **Objectivo** | O que fica feito? | «melhorar a projecção» | «`montarBuckets` passa `I2` para DIARIA/SEMANAL/MENSAL» |
| **Verificador** | Que comando decide? | «o revisor lê» | `npx vitest run projecao.property.test.ts` |
| **Paragem** | Quando é que pára, mesmo falhando? | — | 3 iterações falhadas ⇒ escala ao orquestrador |
| **Veto** | Quem trava e porquê? | — | `code-reviewer`: qualquer BLOCKER |

**A condição de paragem não é opcional.** Um loop sem tecto de iterações não converge: degrada.
O padrão de degradação é conhecido — às três voltas o agente começa a adaptar o teste ao código em
vez do código ao teste. Três é o tecto por omissão neste repositório; à terceira falha o nó pára,
escreve o que tentou e devolve ao orquestrador. **Um teste alterado para passar é um BLOCKER
automático**, verificável por `git diff` sobre os ficheiros `__tests__/`.

## 4. Como se desenha o grafo

1. **Fatiar por dono, não por camada.** Um nó dono de «schema→serviço→teste→UI» de uma fatia fina
   produz algo verificável. Sete nós, um por camada, produzem sete entregas que só se verificam no
   fim — que é o mesmo que não verificar.
2. **Serializar o que partilha ficheiros.** Paralelismo em cima do mesmo `financas.prisma` gasta
   mais em resolução de conflitos do que poupa em wall-clock. Na spec 22, WS-1 e WS-2 são
   sequenciais por esta razão e só por esta razão.
3. **Isolar o núcleo puro cedo.** Funções puras (`montarBuckets`, `classificarVariacoes`) são onde
   os invariantes vivem e onde os property tests correm em milissegundos. Um nó que produz núcleo
   puro tem o melhor verificador disponível; um nó que produz UI tem o pior. Ordena em conformidade.
4. **Um nó, uma pergunta.** «Implementa a projecção» não é um nó. «`expandirRecorrencia` satisfaz
   `I5`» é.
5. **Nunca paralelizar migrações.** Só o orquestrador as gera (regra pré-existente do repositório).

## 5. Papéis

| Papel | Quem | Pode escrever código? | Poder |
|---|---|---|---|
| Orquestrador | `orchestrator` | Não (excepto migrações) | Atribui, resolve conflitos, faz merge |
| Autor | `feat-*` | Sim, no seu worktree | Nenhum sobre merge |
| Verificador | `verificador-fluxo-caixa` | **Só** `__tests__/` e fixtures | Veto por invariante falhado |
| Revisor | `code-reviewer` | Não | Veto por BLOCKER |
| Humano | tu | — | Veto absoluto; único dono das tasks `[HUMANO]` |

**O verificador nunca escreve código de produção e o autor nunca escreve o teste que o julga.**
Esta separação é o que impede o modo de falha do §2 dentro de um único loop: quem escreve o
oráculo não tem incentivo em fazê-lo passar.

## 6. O que isto não resolve

- Não substitui saber o que se quer. Um grafo executa um spec errado com a mesma eficiência com que
  executa um certo.
- Não valida conhecimento de domínio que nenhum oráculo automático tem (a classificação
  contabilística de uma conta face ao Decreto 70/2009). Isso é sempre §2.4.
- Não torna o trabalho mais barato por nó. Torna-o verificável, que é outra coisa.

## 7. Skills

As skills em `.claude/skills/` são as disciplinas que os nós invocam. As que são invocadas pelo
modelo (`tdd`, `diagnosing-bugs`, `domain-modeling`, `revisao-dois-eixos`) são primitivas
reutilizáveis; as invocadas pelo utilizador (`tracer-bullet-tickets`) orquestram. Uma skill
invocada pelo utilizador não chama outra skill invocada pelo utilizador.

As skills `tdd`, `diagnosing-bugs`, `domain-modeling`, `revisao-dois-eixos` e
`tracer-bullet-tickets` são **adaptações** dos padrões de [mattpocock/skills](https://github.com/mattpocock/skills)
às convenções do GestPro (pt-PT, `pnpm check`/`gates`, Prisma/Next, invariantes).
Texto original; a dívida intelectual é ao trabalho dele.
