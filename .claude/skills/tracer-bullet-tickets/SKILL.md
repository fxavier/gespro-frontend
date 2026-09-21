---
name: tracer-bullet-tickets
description: Partir um plano em tickets finos que atravessam todas as camadas e fecham num comando verificavel, com relacoes de bloqueio explicitas. Usar ao converter um spec ou ADR em tasks.md, ou quando um plano esta em prosa e precisa de virar trabalho executavel.
---

# Tickets tracer-bullet — GestPro

> Adaptado dos padrões de [mattpocock/skills](https://github.com/mattpocock/skills).

## A forma de um ticket

Um ticket é uma **fatia fina que atravessa todas as camadas** — schema → serviço → teste → UI — e
termina num comando que ou passa ou não passa. Não é uma camada inteira.

Sete tickets, um por camada, produzem sete entregas que só se verificam no fim, que é o mesmo que
não verificar. Um ticket fino entrega algo demonstrável e falha cedo, quando corrigir ainda é barato.

## Anatomia

```
- [ ] 4. <verbo no infinitivo> <objecto concreto>
  - [ ] 4.1 <passo com ficheiro nomeado>
  - [ ] 4.2 <passo com ficheiro nomeado>
  ✅ Gate: <comando que decide> / <critério mensurável>
```

**O gate não é opcional e não é uma opinião.** `pnpm check` verde, `npx vitest run <ficheiro>`,
`p95 < 400 ms`, `grep -c "saldoAtual" <ficheiro>` == 0, «a fixture bate ao cêntimo». «Revisto» ou
«funciona» não são gates.

## Regras

**Marca `[BLOCKING]` o que trava o resto.** Contratos (schema, tipos, interfaces) e núcleo puro são
quase sempre bloqueantes; UI quase nunca é.

**Marca `[HUMANO]` o que nenhum agente pode fazer.** Conhecimento de domínio que o modelo não tem,
decisões de negócio, validações legais. Um `[HUMANO]` não é substituível por gate verde nenhum, e
tem de estar escrito no ticket que não é.

**Ordena por qualidade do oráculo, não por camada.** O que se verifica com um property test vem
antes do que só se verifica com E2E. Aritmética antes de I/O, I/O antes de UI.

**Nomeia os ficheiros.** «Implementar o serviço» é um desejo. «`projecao.service.ts`:
`montarBuckets`, `expandirRecorrencia`» é uma task.

**Serializa o que partilha ficheiros.** Dois tickets paralelos sobre o mesmo `financas.prisma`
gastam mais em conflitos do que poupam em tempo.

**Migrações Prisma nunca são um ticket de agente.** Só o orquestrador as gera, em ordem
determinística.

## Teste final do plano

Lê a lista de gates de cima a baixo, sem ler as tasks. Se a sequência de gates não descrever a
funcionalidade a ganhar forma, os gates estão fracos — e um gate fraco é pior do que nenhum, porque
dá permissão para avançar.
