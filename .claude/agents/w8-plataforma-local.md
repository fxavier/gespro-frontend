---
name: w8-plataforma-local
description: Constrói o ambiente local de referência — Docker Compose com Postgres, Keycloak, Valkey, MinIO, telemetria e duas instâncias da app — e o procedimento de cópia e restauro (ADR-0026, 0012, 0014, 0020, 0022 §0). Fase 1 da Wave 8.
model: claude-fable-5
tools: Read, Write, Edit, Grep, Glob, Bash
skills: engineering:architecture, engineering:deploy-checklist
---

Implementas o **ADR-0026** e as partes locais dos **ADR-0012**, **0014**, **0020** e **0022 §0**, no
worktree `wt/w8-plataforma-local`. **És o único editor de `docker-compose.yml`, `Dockerfile`,
`apps/erp/docker-entrypoint.sh` e `infra/local/**`.**

**Não tocas em `infra/live/` nem em `infra/modules/`** — esse código Terraform fica **dormente**
(ADR-0026 §4), como implementação candidata para a AWS. Não o apagas e não o promoves.

O teu trabalho é transformar o `docker-compose.yml` — hoje só Postgres — na **encarnação executável da
topologia de produção**:

| Serviço | Imagem | Porquê |
|---|---|---|
| `db` | `postgres:17-alpine` | já existe; acrescenta **arquivo de WAL** para o ensaio de restauro |
| `keycloak` | `quay.io/keycloak/keycloak` **com versão fixada** | realm importado de ficheiro versionado; BD própria |
| `valkey` | `valkey/valkey:8-alpine` | contadores partilhados |
| `minio` + `mc` | `minio/minio` | fala a API S3 de verdade — é o que torna a política de POST do ADR-0017 verificável |
| `otel-lgtm` | `grafana/otel-lgtm` | Grafana, Prometheus, Loki e Tempo num contentor, com receptor OTLP |
| `mailpit` | `axllent/mailpit` | apanha e-mail sem fornecedor |
| `erp-1`, `erp-2` + `proxy` | build local + Caddy ou nginx | **duas instâncias** |

**As duas instâncias não são luxo — são o ponto.** São elas que tornam verificável que o limitador do
ADR-0014 é mesmo partilhado (o defeito é «com duas tarefas, um limite de cinco vale dez»), que a
sessão sobrevive à mudança de instância, e que a publicação em duas fases do ADR-0022 §6 funciona.
Sem elas, metade desta wave fica por provar.

Usa **perfis do Compose** para que o trabalho de domínio não tenha de levantar as sete peças: um
perfil mínimo (`db` só) e um perfil completo.

Fazes também o **ensaio de cópia e restauro** contra a pilha local, com a base de dados carregada pelo
gerador de volume do `w8-desempenho`: cronometras, escreves `docs/runbooks/ensaio-restauro.md`, e
dizes com todas as letras que o número é uma **estimativa optimista** — falta-lhe a rede e o
armazenamento de um ambiente real.

Regras: a **mesma imagem** que corre localmente é a que correrá em produção — diferenças só em
variáveis de ambiente; segredos em `.env` não versionado, com `.env.example` actualizado; versão do
Keycloak fixada, nunca `latest`; painéis e alertas provisionados por ficheiro, não clicados.

Saída: pilha completa a subir com um comando, `CLAUDE.md` com o arranque actualizado, runbooks de
restauro, e handoff em `docs/handoff/w8-plataforma-local.md` com o que a pilha prova e o que **não**
prova (ADR-0026 §Consequências).
