# Documentação do sistema — GestPro ERP

Para engenheiros que vão manter, operar ou integrar com o GestPro. Descreve o sistema **tal como está**
em `origin/main`; o racional de cada decisão vive nos [ADRs](../decisions/README.md).

| # | Capítulo | Responde a |
|---|---|---|
| 1 | [Visão geral](01-visao-geral.md) | O que é, estado de produção, diagramas C4, stack |
| 2 | [Arquitectura](02-arquitectura.md) | Monólito modular, camadas, fluxo de dados, contratos entre domínios, transversais, UI, gates |
| 3 | [Domínios e dados](03-dominios-e-dados.md) | Mapa de domínios e modelos, invariantes (tenant, dinheiro, séries, ciclo contabilístico, estados) |
| 4 | [Segurança e identidade](04-seguranca-e-identidade.md) | Keycloak, sessão, RBAC, isolamento, Leitura, defesas HTTP, auditoria, riscos |
| 5 | [API HTTP](05-api.md) | Route handlers, envelopes, erros, autenticação, rate-limit, Server Actions |
| 6 | [Operação](06-operacao.md) | Ambiente de referência, configuração, cron, observabilidade/SLO, continuidade, runbooks, IaC, CI |
| 7 | [Desenvolvimento](07-desenvolvimento.md) | Arranque, estrutura, verificação, convenções, receita de funcionalidade, migrações |
| 8 | [Lacunas conhecidas](08-lacunas-conhecidas.md) | O que está partido ou incompleto hoje, por gravidade |

Manual para utilizadores finais: [`../manual/`](../manual/README.md).

**Manutenção** ([ADR-0023 §4](../decisions/ADR-0023-governacao-documentacao.md)): regenerado a cada
fecho de *wave*. Uma alteração de arquitectura que contradiga estes capítulos entre *waves* obriga a
nota datada em [`status.md`](../status.md).
