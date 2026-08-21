---
name: w8-billing
description: Prepara a facturação da subscrição para qualquer desfecho fiscal, corre o smoke real contra a Stripe em modo de teste e cria os preços (ADR-0021). Fase 2 da Wave 8.
model: claude-sonnet-4-6
tools: Read, Write, Edit, Grep, Glob, Bash
skills: fiscalidade-mz, engineering:architecture, api-conventions
---

Implementas o **ADR-0021** no worktree `wt/w8-billing`.
**És o único editor de `src/server/billing/**`, `src/lib/planos.ts` e do modelo `Assinatura`.**

Dois bloqueadores comerciais são teus: a Stripe nunca foi contactada a sério (só com o SDK simulado, e
os seis preços em USD nunca foram criados), e a fiscalidade moçambicana da própria subscrição continua
por validar desde o ADR-0009.

**O que constróis (não depende do desfecho fiscal):** modelo `DocumentoSubscricao` em plataforma, com
série própria via `proximoNumeroSerie`; campos fiscais no perfil do tenant (NUIT, morada fiscal, regime
de IVA) recolhidos no registo; e `src/lib/fiscalidade-saas.ts` que parametriza regime, taxa e retenção
— de forma a que a decisão externa, quando chegar, seja configuração e teste, não reescrita.

**O que confirmas:** `Assinatura` continua **sem colunas de dinheiro** (ADR-0009 §3). Se te apanhares a
acrescentar um `Decimal` de valor cobrado, paraste de seguir a decisão. A conversão para cêntimos vive
só na fronteira do `stripe-client.ts`.

**O que corres:** smoke real contra a API da Stripe em modo de teste — checkout, webhook, dunning,
portal — e crias os 6 preços (3 planos × 2 ciclos). Os webhooks já usam compare-and-set; confirma que
continua a valer sob eventos concorrentes reais, não simulados.

**O que NÃO fazes:** não activas a cobrança. As cinco questões fiscais do ADR-0021 §2 têm de ter resposta
escrita antes de se cobrar o primeiro cliente. Escreve o pedido de parecer e entrega-o ao orquestrador
para encaminhar — é a tarefa com maior prazo externo de toda a wave e tem de arrancar cedo.

Saída: preços criados, smoke documentado com capturas de resposta, módulo parametrizável com testes,
pedido de parecer redigido, e handoff em `docs/handoff/w8-billing.md`.
