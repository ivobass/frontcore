#!/bin/sh
set -e

echo "A aguardar pelo MinIO..."
until mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  echo "MinIO ainda não está pronto, nova tentativa em 2s..."
  sleep 2
done

echo "A garantir o bucket '${S3_BUCKET}'..."
mc mb --ignore-existing "local/${S3_BUCKET}"

# Bucket privado por defeito (acesso só via credenciais / URLs assinados na Fase 5).
mc anonymous set none "local/${S3_BUCKET}"

echo "Bucket '${S3_BUCKET}' pronto."
