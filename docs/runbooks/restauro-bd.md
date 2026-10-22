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

## Produção (Railway + bucket S3 dos documentos — ADR-0050)

A produção corre no **Railway** (ADR-0050 §1): os dois Postgres (`postgres-erp`,
`postgres-keycloak`) são serviços geridos com recuperação a um ponto no tempo, e
**o restauro cria um serviço novo**, nunca escreve por cima do actual. O
procedimento (consola do Railway: escolher o instante UTC anterior ao erro,
restaurar as **duas** bases para o mesmo instante, verificar como no passo 6
acima, reapontar `DATABASE_URL`) e a janela de PITR (D3) vivem no runbook de
deploy do Railway (ADR-0050 §6); o ensaio cronometrado contra produção é
[HUMANO] (ADR-0050, passo 7). O instantâneo antes de cada migração é o instante
anterior ao `preDeployCommand`, que o próprio passo regista no log (ADR-0050 §5,
#574).

O que era RDS (PITR de 35 dias, `deletion_protection`, Multi-AZ, instantâneo
pré-migração por `aws rds create-db-snapshot`) está **arquivado, ver ADR-0050**:
`infra/_arquivo-aws/modules/rds` e `infra/_arquivo-aws/live/prod`, nunca
aplicados.

Os **documentos** continuam na AWS, na stack `infra/storage-prod` (módulo
`infra/modules/storage`), numa região da UE com réplica noutra região da UE.
**Nada disto foi exercido**: nunca aplicado. Verificador offline das
declarações: `terraform -chdir=infra/storage-prod init -backend=false &&
terraform -chdir=infra/storage-prod test` (fornecedor dobrado — prova o que o
plano pede, não que a AWS o aceita).

### Objectos (bucket de documentos)

- **Versionamento** + **Object Lock em modo GOVERNANCE**, retenção por omissão de
  `retencao_documentos_fiscais_anos` (10). A app (utilizador IAM
  `gespro-app-storage-prod`, chave no serviço `erp` do Railway: só
  Get/Put/DeleteObject em `tenant/`, com Deny explícito de
  `BypassGovernanceRetention`/`DeleteObjectVersion`) só cria marcadores de
  apagamento; nenhuma versão é apagável por ela.
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
- **Checksum nas escritas**: o S3 exige um checksum (`Content-MD5`/`x-amz-checksum-*`)
  nas escritas para um bucket com retenção por omissão. O `PutObject` do SDK v3 da
  app envia CRC32 por omissão; o **upload do browser por POST assinado** (#430)
  passa a enviá-lo com a correcção na app do ramo `fix/575-upload-checksum` (PR
  próprio, a fundir **antes** do IaC da #575).
- **Protecção contra destruição só em prod** (#644): o módulo `storage` tem o
  bucket e a réplica em dois blocos, e `proteger_contra_destruicao` escolhe qual
  existe. Prod (`true`) usa os blocos com `prevent_destroy`: um plano que destrua
  ou substitua um dos buckets — incluindo virar a variável para `false` — é
  recusado («Instance cannot be destroyed»). Dev (`false`) usa os blocos sem ela.
  Prova: `terraform -chdir=infra/modules/storage test`
  (`desmontagem-dev.tftest.hcl` planeia substituir os buckets do dev).

### Desmontar o dev (#644)

Já não há stack de dev activa: a `live/dev` está arquivada (ADR-0050) e nunca
foi aplicada. O procedimento fica para o caso de ela ter sido aplicada a partir
do arquivo (`infra/_arquivo-aws/live/dev`) ou de nascer outra stack de storage
com `proteger_contra_destruicao = false`. Não se edita o módulo. O que trava o `terraform destroy` é o conteúdo dos
buckets: o `aws_s3_bucket` não tem `force_destroy`, e o S3 só apaga um bucket sem
versões nem marcadores de apagamento.

```bash
# 0. Confirmar que é o dev e que está desprotegido.
grep -n proteger_contra_destruicao infra/_arquivo-aws/live/dev/main.tf   # = false

# 1. Esvaziar cada bucket (origem e, se houver, `gespro-uploads-dev-replica`,
#    na região da réplica). Versões E marcadores, em lotes de 1000.
B=gespro-uploads-dev
# Bypass só com Object Lock: sem configuração de bloqueio o comando abaixo falha
# e não há retenção a contornar (nem permissão a exigir à role).
BYPASS=()
aws s3api get-object-lock-configuration --bucket "$B" >/dev/null 2>&1 &&
  BYPASS=(--bypass-governance-retention)
while :; do
  L=$(aws s3api list-object-versions --bucket "$B" --max-items 1000 --output json |
      jq -c '{Objects: [(.Versions // [])[], (.DeleteMarkers // [])[] | {Key, VersionId}], Quiet: true}') ||
    { echo "Falhou a listagem de $B — parar." >&2; break; }
  [ "$(echo "$L" | jq '.Objects | length')" -eq 0 ] && { echo "$B vazio."; break; }
  # O delete-objects devolve 200 (exit 0) mesmo quando recusa chaves uma a uma:
  # as recusas vêm em `.Errors`. Sem esta verificação o laço re-lista para sempre.
  R=$(aws s3api delete-objects --bucket "$B" --delete "$L" "${BYPASS[@]}" --output json) ||
    { echo "delete-objects falhou em $B — parar." >&2; break; }
  if echo "$R" | jq -e '(.Errors // []) | length > 0' >/dev/null; then
    echo "Recusas em $B (role errada, ou COMPLIANCE) — parar:" >&2
    echo "$R" | jq -c '.Errors[:5]' >&2
    break
  fi
done
# (Repetir para a réplica com `--region <replica_region>`. Desligar antes a
#  replicação não é preciso: o destroy apaga a configuração primeiro.)

# 2. Destruir.
terraform -chdir=infra/_arquivo-aws/live/dev destroy
```

- `--bypass-governance-retention` só é preciso se o dev tiver Object Lock
  (`object_lock_retencao_anos > 0`; a omissão do dev é 0). O laço só o passa
  quando `get-object-lock-configuration` responde: se a role não puder ler essa
  configuração, segue sem bypass, as versões bloqueadas são recusadas e o laço
  pára com a lista das recusas. Só funciona com a
  **role de emergência** (`s3:BypassGovernanceRetention` + `s3:DeleteObjectVersion`,
  não criada pelo IaC): assume-a antes do passo 1 e regista o acto (CloudTrail).
  A role da app não consegue — é esse o ponto do GOVERNANCE.
- Em **COMPLIANCE** não há bypass, nem para a conta root: as versões bloqueadas
  só saem quando a retenção caducar, e o bucket fica até lá. Nunca ligar
  COMPLIANCE num ambiente que se queira desmontar.
- Se o `delete-objects` devolver `AccessDenied` em versões bloqueadas, é a role
  errada (ou COMPLIANCE) — não é motivo para mexer no módulo.
- **Prod não se desmonta por este caminho**: a `infra/storage-prod` tem
  `proteger_contra_destruicao = true` e o `destroy` falha no plano, de propósito. Retirar a protecção de prod é
  uma decisão humana registada, não um passo de runbook.

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
