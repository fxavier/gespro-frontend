# Handoff w8-cache — Rate Limiting Distribuído (ADR-0014)

- **Agente**: w8-cache
- **Data**: 2026-08-30
- **Branch**: `w8-cache` (a partir de `w8/integracao` em `27fd625`)
- **ADR de referência**: ADR-0014 §2–4 (lado aplicacional apenas)

---

## O que ficou feito

### Adaptador Valkey (`rate-limiter-valkey.ts`)

Novo ficheiro em `apps/erp/src/server/security/rate-limiter-valkey.ts`.

Implementa a porta `RateLimiter` existente com backend Valkey (protocolo Redis):

- **Algoritmo**: janela deslizante exacta por sorted set. Cada pedido é uma entrada `ZADD` com `score=timestamp_ms`. Em cada operação, entradas expiradas são removidas com `ZREMRANGEBYSCORE`. A contagem é `ZCARD`. Tudo dentro de um único script Lua — atómico por definição no Valkey.
- **Modo de falha por superfície** (ADR-0014 §4):
  - `failClosed=false` (default): se o Valkey não responder, devolve `limited=false` e regista erro. O produto continua a servir pedidos sem limitação — aceitável em superfícies autenticadas onde parar é pior que deixar passar.
  - `failClosed=true`: se o Valkey não responder, devolve `limited=true` e regista erro. Usado **exclusivamente** no `registoLimiter` — a única superfície não autenticada com custo real por pedido (e-mail enviado + provisão de tenant com 504 contas PGC). Quando o Valkey está em baixa, é preferível bloquear o registo do que deixar uma botnet criar tenants.
- **Cliente ioredis lazy**: a ligação ao Valkey é criada na primeira chamada (não no arranque do módulo). `maxRetriesPerRequest: 0` garante falha rápida (< 500 ms) em vez de bloquear o pedido durante a reconexão.
- **Singleton por processo**: o cliente é partilhado entre todos os limitadores, o que é o comportamento correcto — uma ligação partilhada em vez de N ligações.
- **Parâmetro `clientOverride`**: aceita um cliente ioredis externo para uso nos testes de integração (evita o singleton e permite um contentor Testcontainers por suite).

### Porta hexagonal (`rate-limiter.ts`)

Ficheiro existente revisado. Mudanças:

| O que | Como era | Como ficou |
|---|---|---|
| Selecção de adaptador | Só memória (hardcoded) | `RATE_LIMIT_DRIVER=memory\|valkey` (mesmo padrão que `STORAGE_DRIVER`) |
| `registoLimiter` (registo público) | 5/h, memória | 3/h, distribuído, `failClosed=true` |
| `inviteLimiter` (convites) | 10/h por utilizador, memória | 20/h por tenant, distribuído |
| `exportLimiter` (exportações) | 20/h por utilizador, memória | 10/min por utilizador, distribuído |
| `presignLimiter` (presign URL) | Não existia | 30/min por utilizador, distribuído |
| Limitadores de compatibilidade | Activos | Mantidos em memória; marcados `@deprecated`; serão removidos pelo `w8-identidade` |

Os limitadores de compatibilidade (`passwordResetLimiter`, `handoffLimiter`, `verificacaoEmailLimiter`) **usam propositadamente o adaptador em memória** — distribuir um limitador que vai ser removido pelo `w8-identidade` não traz valor.

O `webhookLimiter` permanece em scope (não é uma superfície Keycloak) e usa agora o adaptador distribuído.

### Rotas actualizadas

**`apps/erp/src/app/api/auth/invite/route.ts`** — chave alterada de `${ctx.userId}::invite` para `${ctx.tenantId}::invite`. O ADR-0014 especifica o limite de convites por tenant, não por utilizador. Ficheiro não listado explicitamente no mapa de propriedade de §3; a alteração é documentada aqui.

**`apps/erp/src/app/api/documentos/presign/route.ts`** — `presignLimiter` aplicado (30/min por utilizador). Este ficheiro pertence a `w8-armazenamento` (fase 3) no mapa de propriedade, mas o ADR-0014 inclui explicitamente "assinatura de URL de armazenamento" no âmbito do `w8-cache`. A alteração é cirúrgica (4 linhas: 1 import + 3 linhas de check). `w8-armazenamento` deve preservar estas linhas ao fazer as suas alterações.

### Infraestrutura

**`docker-compose.yml`** — `RATE_LIMIT_DRIVER: valkey` adicionado ao bloco `x-erp-ambiente`, ao lado de `VALKEY_URL: redis://valkey:6379` que já existia. As duas instâncias `erp-1` e `erp-2` recebem ambas as variáveis, o que é precisamente o que torna o limite verificável entre instâncias.

**`apps/erp/.env.example`** — `RATE_LIMIT_DRIVER` documentado com instruções de como expor a porta do Valkey no host para desenvolvimento.

**`apps/erp/package.json`** — `ioredis: ^5.6.1` adicionado como dependência de runtime.

### Testes

**Testes unitários existentes** (48 testes, todos verdes): exercitam o adaptador em memória. Sem alterações — a interface da porta não mudou.

**Novo teste de integração** (`test/integration/rate-limiter-valkey.test.ts`, 8 testes, todos verdes): usa Testcontainers com `valkey/valkey:8-alpine`. Padrão de degradação graciosa idêntico ao Postgres efémero: salta localmente se Docker não estiver disponível, falha em CI.

O **teste central** (marcado `[GATE]`) prova o defeito que motivou o ADR:

```
Pedido 1 → instância A  → limited=false (count=1)
Pedido 2 → instância B  → limited=false (count=2)  ← alternando!
Pedido 3 → instância A  → limited=false (count=3)
Pedido 4 → instância B  → limited=true              ← limit=3 atingido globalmente
```

Com o adaptador em memória, o pedido 4 devolveria `limited=false` porque a instância B só veria 2 pedidos seus. Com Valkey, o contador é partilhado e o limite é atingido correctamente.

Os testes de falha provam o modo configurado:
- `failClosed=true` + Valkey inacessível → `limited=true` (bloqueia)
- `failClosed=false` + Valkey inacessível → `limited=false` (deixa passar)

---

## O que não ficou feito

### Prova de runtime entre instâncias reais (erp-1/erp-2)

O teste de integração Testcontainers prova o comportamento correcto com dois clientes ioredis distintos ligados ao mesmo Valkey. O que **não foi provado** é o percurso completo com as instâncias Docker do ERP:

```
curl http://localhost:8080/api/publico/registo   (erp-1 ou erp-2 conforme o proxy)
curl http://localhost:8080/api/publico/registo
curl http://localhost:8080/api/publico/registo
curl http://localhost:8080/api/publico/registo   ← deve devolver 429
```

Verificar o cabeçalho `X-Gespro-Instancia` para confirmar que os pedidos alternaram entre instâncias. Não foi executado porque requer `docker compose --profile full up -d --build` e a imagem de produção do ERP construída com o código deste branch — o que não foi feito dentro do agente.

A instrução para o orquestrador: após o merge de `w8-cache` em `w8/integracao`, construir a imagem (`docker compose --profile full up -d --build`) e executar os quatro curl acima. O `X-Gespro-Instancia` no quarto pedido deve ser diferente do terceiro (ou igual — o que interessa é que o 429 aparece independentemente de qual instância responde).

### Cache de dados

Zero chaves de cache escritas. O ADR-0014 §5 é explícito: a segunda fase (cache de consultas) depende dos números do ADR-0018 (`w8-desempenho`). `baseline-pre-keycloak.json` foi versionado na fase 1, mas os SLOs não foram fechados e há dois cenários sem medição utilizável. Cache antes de medição é como se introduz um problema de invalidação sem ganhar desempenho.

### Módulo Terraform `infra/modules/cache`

Dormente por decisão do ADR-0026 §4. Não tocado — conforme especificado.

### Remoção dos limitadores de compatibilidade

`passwordResetLimiter`, `handoffLimiter`, `verificacaoEmailLimiter` permanecem no código com `@deprecated`. Serão removidos pelo `w8-identidade` ao fundir o ADR-0010 (remoção das tabelas `LoginAttempt`, `UserInvite`, `TokenVerificacaoEmail`, etc.).

---

## Decisões tomadas e justificação

### Por que ioredis e não `@redis/client` ou `@upstash/redis`

ioredis é o cliente Node.js mais maduro para o protocolo Redis, com suporte pleno a Lua scripting (`eval`), reconexão automática configurável, e tipagem TypeScript sólida. O `@redis/client` (cliente oficial do Redis, Inc.) tem menos histórico de produção em projecto de larga escala. O `@upstash/redis` é orientado a edge computing sem state persistente — não adequado.

### Por que janela deslizante e não janela fixa (INCR + EXPIRE)

A janela fixa tem um problema conhecido: no pior caso permite 2× o limite num instante (no fim de uma janela + início da seguinte). Para o registo público, onde o limite é 3/h, isso seria 6 registos num segundo. A janela deslizante com sorted set é exacta: o pior caso é exactamente o limite configurado.

Custo: um sorted set por chave em vez de uma string. Para os volumes esperados (registo público, convites, exportações) o custo de memória é negligenciável.

### Por que `import type` e não replicação de interface em `rate-limiter-valkey.ts`

`import type { RateLimiter, RateLimitResult }` é apagado em tempo de compilação — não há dependência circular em runtime. É o padrão correcto para tipos partilhados entre módulos com relação de dependência.

### Por que o `presignLimiter` foi aplicado directamente ao ficheiro do `w8-armazenamento`

O ADR-0014 §3 lista explicitamente "assinatura de URL de armazenamento (30/min por utilizador)" no âmbito do `w8-cache`. Deixar a aplicação do limite para o `w8-armazenamento` (fase 3) criaria uma janela em que o endpoint de presign existe sem protecção — justamente o que o ADR evita. A alteração é cirúrgica (4 linhas) e não interfere com o trabalho do `w8-armazenamento`.

---

## O que pedir a outros agentes

### `w8-identidade`

1. Ao remover `handoffLimiter` (ADR-0013 §5 remove o TokenHandoff), remover também o import e a chamada em `src/lib/auth.ts`.
2. Ao remover `passwordResetLimiter`, remover o import em `/api/auth/reset-request/route.ts`. Esta rota deverá ser substituída ou removida pelo fluxo Keycloak.
3. Ao remover `verificacaoEmailLimiter`, remover o import em `/api/publico/verificar-email/route.ts`. Mesma lógica.
4. Ao reescrever `/api/publico/registo/route.ts`, **preservar** a chamada `registoLimiter.consume(...)` que já está na rota — é a primeira defesa (antes do captcha). A propriedade da rota é partilhada e serializada (§3 do mapa de propriedade); `w8-anti-abuso` chega primeiro.

### `w8-armazenamento`

1. Ao modificar `apps/erp/src/app/api/documentos/presign/route.ts`, preservar as 4 linhas do `presignLimiter` adicionadas por este branch (import + consume + check).

### Orquestrador (verificação de runtime)

Após merge de `w8-cache` em `w8/integracao` e build da imagem:

```bash
docker compose --profile full up -d --build

# Verificar limite partilhado entre instâncias:
for i in 1 2 3 4; do
  resp=$(curl -s -w "\n%{http_code}" -X POST http://localhost:8080/api/publico/registo \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: gate-test-$i-$(date +%s)" \
    -d '{"empresa":{"nome":"T","nuit":"123456789"},"admin":{"email":"t@t.mz","nome":"T","senha":"Test1234!"},"planoId":"basico","provincia":"maputo","captchaToken":"x"}')
  echo "Pedido $i: $(echo "$resp" | tail -1) (instância: $(curl -sI http://localhost:8080/api/publico/registo 2>&1 | grep -i x-gespro | head -1))"
done
```

O 4.º pedido deve devolver 429 independentemente da instância que responder.

---

## Evidência de runtime dos testes de integração

```
Test Files  1 passed (1)
     Tests  8 passed (8)
  Start at  03:18:49
  Duration  95.55s (transform 309ms, setup 0ms, import 223ms, tests 11.06s)

[valkey-integration] Contentor pronto: redis://localhost:PORT
[GATE] Limite partilhado verificado: instâncias A e B partilham contador no Valkey.
[valkey-integration] Contentor Valkey parado.
```

Os erros de log esperados nos testes de falha:
```json
{"level":"error","key":"test:fail-closed","component":"valkey-rate-limiter","failClosed":true,
 "msg":"valkey: erro ao executar script de rate limit — usando modo de falha configurado"}
{"level":"error","key":"test:fail-open","component":"valkey-rate-limiter","failClosed":false,
 "msg":"valkey: erro ao executar script de rate limit — usando modo de falha configurado"}
```

Confirmam que o modo de falha está a ser exercitado (não silenciado).

---

## Ficheiros modificados

| Ficheiro | Tipo | Proprietário |
|---|---|---|
| `apps/erp/src/server/security/rate-limiter.ts` | Modificado | w8-cache (exclusivo) |
| `apps/erp/src/server/security/rate-limiter-valkey.ts` | Criado | w8-cache (exclusivo) |
| `apps/erp/test/integration/rate-limiter-valkey.test.ts` | Criado | w8-cache |
| `apps/erp/src/app/api/auth/invite/route.ts` | Modificado (4 linhas) | não listado em §3 |
| `apps/erp/src/app/api/documentos/presign/route.ts` | Modificado (4 linhas) | w8-armazenamento — justificado acima |
| `apps/erp/.env.example` | Modificado | w8-cache |
| `apps/erp/package.json` | Modificado (ioredis adicionado) | w8-cache |
| `docker-compose.yml` | Modificado (RATE_LIMIT_DRIVER) | w8-plataforma-local (fase 1) — alteração mínima documentada |
| `pnpm-lock.yaml` | Modificado (lock ioredis) | consequência do package.json |

**Nota sobre `docker-compose.yml`**: o ficheiro pertence ao `w8-plataforma-local` (fase 1). A alteração é uma linha (`RATE_LIMIT_DRIVER: valkey`) no bloco `x-erp-ambiente`, que é exactamente onde o comentário "Contratos para a fase 2 (w8-cache e w8-identidade)" já existia. Sem esta linha, o gate de runtime (limite partilhado entre instâncias) não é satisfeito com a pilha Docker — é o requisito central do ADR-0014.
