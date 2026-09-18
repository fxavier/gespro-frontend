# Runbook — Restauro da base de dados (Postgres)

> **Âmbito**: pilha local de referência (ADR-0026). O procedimento é o mesmo que
> valerá em produção — muda a implementação da capacidade (ADR-0020): localmente
> é `pg_basebackup` + arquivo de WAL; num Postgres gerido será a recuperação a um
> ponto no tempo do fornecedor.
>
> **Um sistema, não dois**: a base `gespro` (ERP) e a base `keycloak` (identidade)
> vivem na MESMA instância Postgres da pilha. Um restauro do cluster repõe as duas
> em conjunto e coerentes entre si (ADR-0020 §1).

## Objectivos (ADR-0020 §1)

| Métrica | Objectivo | Nota local |
|---|---|---|
| RPO | 5 minutos | localmente: `archive_timeout=60` → ≤ ~1 min desde o último segmento arquivado |
| RTO | 4 horas | o tempo medido localmente é **estimativa optimista** — ver `ensaio-restauro.md` |

## Como funciona a cópia

- O serviço `db` corre com `archive_mode=on`; cada segmento WAL é copiado para o
  volume `gespro-walarchive` (montado em `/var/lib/postgresql/wal-archive`).
- Cópias de base são criadas por:

  ```bash
  ./infra/local/scripts/backup-base.sh
  ```

  Ficam em `gespro-walarchive:/base/<timestamp>/` (`base.tar.gz` + `pg_wal.tar.gz`).
- Antes de **cada migração de schema** e de **cada actualização do Keycloak**,
  criar uma cópia de base manual (equivalente local do instantâneo pré-migração
  do ADR-0020 §2).

## Procedimento de restauro (cenário: instância perdida ou migração destrutiva por engano)

O caminho automatizado é o script do ensaio — restaura a última cópia de base e
replaya todo o WAL arquivado para uma instância descartável:

```bash
./infra/local/scripts/ensaio-restauro.sh --manter
```

Passo a passo manual (o que o script faz, para quando for preciso desviar — por
exemplo, restaurar para um instante anterior a uma migração destrutiva):

1. **Escolher a cópia de base**: `docker compose exec db ls /var/lib/postgresql/wal-archive/base/`
2. **Preparar um PGDATA novo** (volume novo, nunca por cima do existente):
   extrair `base.tar.gz` para o PGDATA e `pg_wal.tar.gz` para `PGDATA/pg_wal`.
3. **Configurar a recuperação** em `postgresql.auto.conf`:
   ```
   restore_command = 'cp /wal-archive/%f "%p"'
   recovery_target_timeline = 'latest'
   archive_mode = off
   ```
   Para parar num ponto no tempo (antes do erro), acrescentar:
   ```
   recovery_target_time = 'YYYY-MM-DD HH:MM:SS+00'
   recovery_target_action = 'promote'
   ```
4. **Criar `recovery.signal`** no PGDATA e garantir `chown postgres` + `chmod 700`.
5. **Arrancar** um contentor `postgres:17-alpine` com esse PGDATA e o volume
   `gespro-walarchive` montado (só leitura). O Postgres replaya o WAL e promove.
6. **Verificar** (ADR-0020 §3): `pg_is_in_recovery()` = `f`; contagens de
   `"Tenant"`/`"User"`; coerência da numeração de séries; base `keycloak` presente.
7. **Reapontar a aplicação** (variável `DATABASE_URL`) OU repor o volume da pilha:
   parar a pilha, substituir o conteúdo de `gespro-pgdata` pelo PGDATA restaurado,
   subir de novo.
8. Registar o ensaio/incidente em `docs/runbooks/ensaio-restauro.md`.

## Cenários (ADR-0020 §4, tradução local)

| Cenário | Resposta |
|---|---|
| Volume `gespro-pgdata` perdido/corrompido | Restauro da última base + WAL (acima) |
| Migração destrutiva aplicada por engano | Restauro com `recovery_target_time` anterior à migração |
| Base `keycloak` perdida | Vem no mesmo restauro do cluster; se irrecuperável, ver `restauro-keycloak.md` |
| Perda do próprio volume `gespro-walarchive` | Sem PITR: resta o último estado do `gespro-pgdata`. Em produção o arquivo vive em armazenamento separado — é exactamente por isso |

## Limitações conhecidas (não fingir que não existem)

- O arquivo de WAL vive **no mesmo daemon Docker** que a base de dados: um
  desastre da máquina leva os dois. Serve para provar o procedimento, não para
  proteger dados reais (ADR-0026 §Consequências).
- `pnpm db:migrate:dev` (`migrate dev`) detecta drift se houver objectos
  estranhos na base `gespro` — por isso o marcador do ensaio vive na base
  `postgres`, nunca na `gespro`.
