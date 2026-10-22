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

## Produção (IaC AWS, nunca aplicado — ADR-0026 §5, #575)

O que o `infra/live/prod` declara, e o que fica por fazer à mão. **Nada disto foi
exercido**: o IaC nunca foi aplicado (`docs/status.md`). Verificador offline das
declarações: `terraform -chdir=infra/live/prod init -backend=false && terraform
-chdir=infra/live/prod test` (fornecedor dobrado — prova o que o plano pede, não
que a AWS o aceita).

### O que está declarado

| Capacidade (ADR-0020 §2) | Onde | Valor |
|---|---|---|
| Recuperação a um ponto no tempo | `modules/rds` — os backups automáticos do RDS **são** o PITR | `backup_retention_days = 35` (prod), `7` (dev) |
| Backups sobrevivem ao apagamento da instância | `retain_automated_backups = true` → `delete_automated_backups = false` | prod |
| Snapshot final ao destruir | `skip_final_snapshot = false`, `final_snapshot_identifier = gespro-prod-final-snapshot` | prod |
| Etiquetas nos snapshots | `copy_tags_to_snapshot = true` | sempre |
| Destruição acidental | `deletion_protection = true` | prod |
| Multi-AZ | `multi_az = true` | prod |
| Objectos: versionamento + réplica noutra região + Object Lock | `modules/storage` — ver «Objectos» abaixo | prod |

### Restaurar a um ponto no tempo (instância perdida, migração destrutiva)

O restauro cria **sempre uma instância nova**; nunca escreve por cima da actual.

```bash
# 1. Janela restaurável (LatestRestorableTime ≈ agora − 5 min)
aws rds describe-db-instances --db-instance-identifier gespro-prod-postgres \
  --query 'DBInstances[0].[LatestRestorableTime,BackupRetentionPeriod]'

# 2. Restaurar para o instante anterior ao erro (UTC), na mesma subnet/SG
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier gespro-prod-postgres \
  --target-db-instance-identifier gespro-prod-postgres-restauro-<aaaammddhhmm> \
  --restore-time 2026-10-22T09:41:00Z \
  --db-subnet-group-name gespro-prod-db-subnet-group \
  --vpc-security-group-ids <rds_sg_id> \
  --db-parameter-group-name gespro-prod-pg17 \
  --multi-az --no-publicly-accessible
# (instância apagada: --source-dbi-resource-id em vez do identificador; os
#  backups mantidos aparecem em `aws rds describe-db-instance-automated-backups`)

# 3. Verificar (ADR-0020 §3): contagens de "Tenant"/"User", coerência das séries.
# 4. Reapontar: actualizar o segredo DATABASE_URL e reimplantar o App Runner.
#    O Terraform passa a ver deriva — importar a instância nova ou renomear (a
#    decisão é de quem conduz o incidente; registá-la no relatório).
```

### Requisito: instantâneo antes de cada migração — **depende da #574**

O ADR-0020 §2 pede um instantâneo manual antes de cada migração de schema,
retido 90 dias. Hoje o `prisma migrate deploy` corre no `docker-entrypoint.sh`,
**no arranque de cada réplica** — não há um passo de *deploy* único onde o
instantâneo caiba (é exactamente a #574). Este runbook não inventa esse passo;
fixa o que ele tem de fazer quando a #574 o criar:

1. Antes de `migrate deploy`, e só se houver migrações pendentes
   (`prisma migrate status`):
   `aws rds create-db-snapshot --db-instance-identifier gespro-prod-postgres
   --db-snapshot-identifier gespro-prod-pre-migracao-<sha>-<aaaammddhhmm> --tags Key=Motivo,Value=pre-migracao`
   e esperar `aws rds wait db-snapshot-available`.
2. Falhar o *deploy* se o instantâneo falhar — sem instantâneo não há migração.
3. Retenção de 90 dias: os instantâneos manuais **não expiram sozinhos**; o
   passo apaga os `pre-migracao` com mais de 90 dias (ou uma regra do AWS
   Backup, se a #574 a preferir).
4. A role do pipeline precisa de `rds:CreateDBSnapshot`, `rds:DescribeDBSnapshots`,
   `rds:DeleteDBSnapshot` e `rds:AddTagsToResource`, limitadas à instância.

Enquanto a #574 não fecha, o PITR de 35 dias cobre a migração destrutiva
(restaurar para o instante anterior ao arranque da réplica que migrou) — com um
RPO de minutos em vez de zero.

### Objectos (bucket de documentos)

- **Versionamento** + **Object Lock em modo GOVERNANCE**, retenção por omissão de
  `retencao_documentos_fiscais_anos` (10). A app (Get/Put/DeleteObject) só cria
  marcadores de apagamento; nenhuma versão é apagável por ela.
- **Réplica** em `replica_region` (`gespro-uploads-prod-replica`, STANDARD_IA),
  com versionamento e o mesmo bloqueio. Os marcadores de apagamento replicam.
- **Repor um objecto apagado**: listar versões
  (`aws s3api list-object-versions --bucket gespro-uploads-prod --prefix tenant/<id>/…`)
  e apagar o marcador (`delete-object --version-id <id-do-marcador>`); a versão
  anterior volta a ser a corrente.
- **Purgar um objecto bloqueado** (pedido de apagamento de dados pessoais,
  ficheiro carregado por engano): só uma role de emergência com
  `s3:BypassGovernanceRetention` + `s3:DeleteObjectVersion`, com
  `--bypass-governance-retention`, nos **dois** buckets; o acto fica no CloudTrail
  e é registado no relatório do pedido. Essa role não é criada pelo IaC.
- **A verificar no primeiro apply [HUMANO]**: o S3 exige um checksum
  (`Content-MD5`/`x-amz-checksum-*`) nas escritas para um bucket com retenção
  por omissão. O `PutObject` do SDK v3 da app envia CRC32 por omissão; o
  **upload do browser por POST assinado** (#430) não envia checksum nenhum.
  Confirmar que um upload real passa; se o S3 o recusar, a correcção é na app
  (fora do IaC).

## Ensaio contra produção — [HUMANO], quando houver produção

O critério da #575 («registo de ensaio com tempo medido ≤ RTO para a BD do ERP e
do Keycloak») **não é exequível sem produção** (ADR-0026 §5). Quando houver:

1. Restaurar a ponto no tempo (acima) as bases do ERP **e** do Keycloak
   (instância da #572 — ver `restauro-keycloak.md`) para instâncias descartáveis.
2. Apontar-lhes uma instância da app num ambiente separado; autenticar, emitir
   uma factura, correr um balancete, confirmar a numeração de série.
3. Repor um objecto apagado do bucket e ler um objecto da réplica.
4. Cronometrar cada passo e registar em `ensaio-restauro.md` (secção «Produção»).
   Tempo acima do RTO de 4 h → ajustar o RTO ou o procedimento, nunca fingir.
5. Destruir as instâncias descartáveis.

## Limitações conhecidas (não fingir que não existem)

- O arquivo de WAL vive **no mesmo daemon Docker** que a base de dados: um
  desastre da máquina leva os dois. Serve para provar o procedimento, não para
  proteger dados reais (ADR-0026 §Consequências).
- `pnpm db:migrate:dev` (`migrate dev`) detecta drift se houver objectos
  estranhos na base `gespro` — por isso o marcador do ensaio vive na base
  `postgres`, nunca na `gespro`.
