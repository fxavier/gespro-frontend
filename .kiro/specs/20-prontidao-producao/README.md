# Spec 20 — Prontidão para Produção (Wave 8)

## Objectivo

Levar o GestPro do estado «funcionalmente construído e verificado em desenvolvimento» ao estado «em
produção, com clientes reais a pagar». Nada nesta spec é funcionalidade de negócio nova: é validação,
operação, fecho de fronteiras externas, e a substituição da autenticação própria por Keycloak.

## Onde está cada coisa

| Artefacto | Localização |
|---|---|
| **Diagnóstico** que originou a wave | `docs/GestPro-Arquitectura-e-Estado.pdf` — secções 10 (o que falta), 11 (o que melhorar), 12 (riscos e sequência) |
| **Design** — as decisões e as suas alternativas | `docs/decisions/` — ADR-0010 a ADR-0025 |
| **Tasks** por agente | [`tasks.md`](./tasks.md) |
| **Coordenação** — conflitos, propriedade de ficheiros, ordem de merge | `docs/handoff/execucao-paralela-w8.md` |
| **Agentes** executores | `.claude/agents/w8-*.md` |

Não há `design.md` nesta spec por decisão: **os ADRs são o design**. Duplicá-los num documento
paralelo criaria exactamente a divergência que o ADR-0003 proibiu entre domínios.

## As 17 decisões

**Identidade** — 0010 Keycloak como IdP · 0011 fronteira de autorização · 0012 alojamento · 0013 migração
**Bloqueadores** — 0014 rate limit distribuído · 0015 auditoria financeira · 0016 anti-abuso · 0021 fiscalidade SaaS
**Operação** — 0018 desempenho · 0019 telemetria e SLOs · 0020 continuidade · 0022 provisionamento
**Estrutura** — 0017 armazenamento · 0023 governação · 0024 gates · 0025 separação de domínio
**Infraestrutura** — 0026 adiamento da escolha de fornecedor e ambiente local de referência

## Fases

1. **Ambiente local de referência** — Docker Compose com Postgres, Keycloak, Valkey, MinIO, telemetria, e-mail e **duas instâncias da app**.
2. **Identidade e bloqueadores comerciais** — Keycloak, rate limit, auditoria, Stripe, captcha.
3. **Consolidação** — armazenamento, bugs conhecidos, gates, documentação.
4. **Separação de domínio** — dividir `pessoas-projetos`, a correr sozinho, no fim.
5. **Provisionamento** — **parada por decisão** (ADR-0026). Não arranca sem um ADR que escolha o fornecedor.

Detalhe em `docs/handoff/execucao-paralela-w8.md`.

## Regra que governa a wave

**Não abrir nenhuma frente funcional nova antes de concluir a fase 2.** O sistema não precisa de mais
funcionalidades — precisa de estar de pé, sob carga, com dinheiro de clientes a atravessá-lo.

## Dependências externas

O ADR-0026 eliminou quase todas: **a fase 1 corre inteiramente na máquina de quem a executa**, sem
conta de nuvem, sem conta de observabilidade e sem custo.

1. **Parecer fiscal** do ADR-0021 — contabilista certificado em MZ. Da ordem de semanas, e o único
   item cujo prazo não controlamos. Arranca no primeiro dia da fase 1.
2. **Stripe em modo de teste** e **Cloudflare** (Turnstile) — contas gratuitas, antes da fase 2.

## Revisões

- **Revisão 2**: os ADRs foram verificados contra o código antes de qualquer execução; doze
  incoerências corrigidas. Ver «Errata» em `docs/decisions/README.md`.
- **Revisão 3**: o **ADR-0026** adiou a escolha de fornecedor. O plano passou a ser local primeiro; a
  fase de provisionamento saiu do caminho crítico e está parada por decisão.
