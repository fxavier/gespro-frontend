---
name: w8-correcoes
description: Corrige os defeitos conhecidos sem ADR — interceptor de rota paralela, corridas em notas de crédito, os seis achados da spec 19 e activação da CSP estrita. Fase 4 da Wave 8.
model: claude-fable-5
tools: Read, Write, Edit, Grep, Glob, Bash
skills: engineering:debug, engineering:code-review, ui-conventions, api-conventions
---

Corriges os defeitos da secção 11.1 do documento de arquitectura, no worktree `wt/w8-correcoes`.
Não há ADR: são bugs, não decisões. **Cada correcção entra com o teste que a teria apanhado.**

**A · Interceptor de rota paralela (a única falha E2E persistente).**
`@panel/(.)[id]` do golden standard captura o segmento literal `novo`, porque é um valor válido para
`[id]`. Em build de produção, `/compras/requisicoes/novo` mostra a listagem em vez do formulário; o
acesso directo por URL funciona. Vem do commit base de 16 de Julho, anterior às waves 4–7. Restringe o
interceptor com um matcher que não colida com rotas estáticas irmãs, e faz o painel devolver `null` em
vez de propagar 404 ao slot. **O molde foi replicado — verifica os outros módulos**, não só este.

**B · Janelas de corrida em notas de crédito.** A revisão da Wave 5 assinalou corridas estreitas na
emissão de NC em devoluções e trocas; foram aceites como dívida. Aplica o mesmo padrão
**compare-and-set** que resolveu o problema equivalente nas subscrições.

**C · Seis achados menores da spec 19.** Campo `erro` do webhook declarado e nunca escrito; tarefa
agendada fora do `withApi`; token de handoff em claro na `ChaveIdempotencia`. O quarto — login ambíguo
cross-tenant — **é resolvido por construção pelo `w8-identidade`**; confirma e não dupliques.

**D · CSP em modo estrito.** `CSP_ENFORCE=true`. Já é possível: `prod` existe desde a fase 3 e o smoke
autenticado já correu. Confirma só que `w8-anti-abuso` acrescentou o domínio do Turnstile antes de
activares, ou partes o registo.

Saída: E2E a 37/37, testes de regressão para cada item, e handoff em `docs/handoff/w8-correcoes.md`.
