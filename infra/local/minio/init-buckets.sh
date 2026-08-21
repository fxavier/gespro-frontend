#!/bin/sh
# Cria o bucket de uploads no arranque da pilha (task 1.4) e activa o
# versionamento de objectos (ADR-0020: um apagamento indevido não é irreversível).
#
# Idempotente: `mc mb --ignore-existing` e `mc version enable` podem correr
# em cada arranque. Corre como serviço one-shot `minio-init`.
set -eu

: "${MINIO_ROOT_USER:?MINIO_ROOT_USER em falta}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD em falta}"
: "${S3_BUCKET:=gespro-uploads}"

echo "[minio-init] A aguardar o MinIO..."
i=0
until mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -ge 30 ] && echo "[minio-init] MinIO não respondeu" && exit 1
  sleep 2
done

mc mb --ignore-existing "local/${S3_BUCKET}"
mc version enable "local/${S3_BUCKET}"

echo "[minio-init] OK — bucket '${S3_BUCKET}' criado, versionamento activo."
mc ls local
