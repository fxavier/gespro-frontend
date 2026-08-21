# Registo de ensaios de cópia e restauro (ADR-0020 §3)

> **Como re-executar** (um comando, contra a pilha local):
>
> ```bash
> ./infra/local/scripts/ensaio-restauro.sh
> ```
>
> O script: cria uma cópia de base nova → escreve um marcador **depois** da cópia
> e força o arquivo do WAL → restaura para uma instância descartável → verifica o
> marcador (prova de replay de WAL, i.e., PITR e não só cópia) e as contagens →
> cronometra e imprime → destrói a instância. Detalhe do procedimento em
> [`restauro-bd.md`](./restauro-bd.md) e [`restauro-keycloak.md`](./restauro-keycloak.md).

## ⚠ Os números abaixo são estimativas optimistas

**O tempo medido localmente NÃO é o RTO.** Falta-lhe tudo o que só um ambiente
real tem: a rede entre a aplicação e a base de dados, o armazenamento de um
serviço gerido (IOPS, throughput, provisionamento de instância), a dimensão real
dos dados ao fim de meses de uso, e o próprio tempo de decisão humana durante um
incidente. O RTO real (objectivo: **4 horas**, ADR-0020 §1) só se valida no
ensaio contra produção, quando produção existir — fase 5, parada por decisão
(ADR-0026 §5). Até lá, estes valores servem para **provar o procedimento** e
apanhar passos em falta, não para prometer tempos.

## Medições previstas na fase 1

| # | Base de dados | Estado |
|---|---|---|
| 1 | Seed demo (`pnpm db:seed`) | ver registo abaixo |
| 2 | Volume do ADR-0018 (`pnpm db:seed:volume`, gerador do `w8-desempenho`) | **pendente** — o gerador ainda não existia à data do 1.º ensaio; o orquestrador re-cronometra no fecho da fase 1 com o MESMO comando |

## Registo de ensaios

<!-- Acrescentar uma secção por ensaio; nunca reescrever registos anteriores. -->

### 2026-08-21 — Ensaio nº 1 (local, BD do seed demo) — `ensaio-20260821T143633Z`

| Passo | Tempo |
|---|---|
| Cópia de base (`pg_basebackup`, tar+gzip, checkpoint fast) | **5 s** |
| Restauro: extracção + replay de WAL + promoção + aceitar ligações | **9 s** |
| **Total** | **15 s** |

- Executor: agente `w8-plataforma-local` (fase 1 da Wave 8).
- Origem: pilha local completa (`--profile full`), BD do seed demo (1 tenant,
  5 utilizadores) + BD `keycloak` com o realm `gespro` importado.
- Verificações: marcador escrito **depois** da cópia presente no restauro
  (replay de WAL confirmado — é PITR, não só cópia) · `Tenant`=1 · `User`=5 ·
  BD `keycloak` restaurada no mesmo cluster com 2 realms (`master`, `gespro`).
- Passos em falta apanhados pelo ensaio (o objectivo do ADR-0020 §3): o ponto de
  montagem do arquivo de WAL nasce `root:root` e o `archive_command` falha em
  silêncio sem o `chown` prévio (corrigido no `command` do serviço `db`); o
  marcador de verificação não pode viver na BD `gespro` senão o Prisma detecta
  drift (vive na BD `postgres`).
- **⚠ Estimativa optimista** (ver acima): 15 s com uma BD de brinquedo no mesmo
  disco local. Não é o RTO. O objectivo de 4 h continua **não validado**.

### (pendente) — Ensaio nº 2 (local, BD de volume do ADR-0018)

A re-execução com a BD carregada por `pnpm db:seed:volume` (gerador do
`w8-desempenho`, ainda não fundido à data do ensaio nº 1) fica para o fecho da
fase 1, pelo orquestrador — mesmo comando: `./infra/local/scripts/ensaio-restauro.sh`.
Também será uma estimativa optimista: mede a dimensão dos dados, mas continua
sem a rede nem o armazenamento de produção.
