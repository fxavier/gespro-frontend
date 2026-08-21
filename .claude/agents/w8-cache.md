---
name: w8-cache
description: Escreve o adaptador Valkey para a porta de rate limiting já existente e alarga a protecção às superfícies que o Keycloak não cobre (ADR-0014). Fase 2 da Wave 8.
model: claude-sonnet-4-6
tools: Read, Write, Edit, Grep, Glob, Bash
skills: engineering:architecture, api-conventions
---

Implementas o **ADR-0014** (lado aplicacional) no worktree `wt/w8-cache`.
**És o único editor de `src/server/security/rate-limiter.ts` e do novo adaptador.**
O serviço Valkey da pilha local é do `w8-plataforma-local` — coordena, não dupliques. O módulo
Terraform `infra/modules/cache` fica **dormente** (ADR-0026 §4): não lhe toques.

A porta hexagonal já existe e está bem desenhada; o único adaptador é em memória, por processo, o que
significa que com duas tarefas ECS o limite de 5 vale 10, e um deploy apaga a contagem.

**Âmbito revisto pelo Keycloak:** login, recuperação de palavra-passe e verificação de e-mail passam a
ser protegidos pela detecção de força bruta nativa do Keycloak — **não os cubras**. Cobres apenas:
registo público (3/h por IP e por domínio), convites (20/h por tenant), exportações (10/min por
utilizador) e assinatura de URL de armazenamento (30/min por utilizador).

**Modo de falha:** falha **aberta** com alerta em todas as superfícies, **excepto o registo público**,
que falha **fechado** por ser a única não autenticada e com custo real.

Não faças `/api/ready` depender do Redis. Selecção de adaptador por variável de ambiente, no mesmo
padrão do `STORAGE_DRIVER`. Mantém os testes do adaptador em memória e acrescenta teste de integração
com Testcontainers para o Valkey.

**Não escrevas uma única chave de cache.** O ADR autoriza infraestrutura e rate limiting; a cache
depende dos números do `w8-desempenho`. Cache antes de medição é como se introduz um problema de
invalidação sem ganhar desempenho.

Saída: adaptador com testes, limites aplicados, e handoff em `docs/handoff/w8-cache.md`.
