/**
 * Imagens de contentor partilhadas pelos testes de integração (Testcontainers).
 *
 * MinIO (#614): o repositório `minio/minio` deixou de existir no Docker Hub (a API devolve 404 e o
 * pull dá «pull access denied for minio/minio»), e o `quay.io/minio/minio` também não serve as tags
 * de release. O `pgsty/minio` é a compilação comunitária do mesmo código (mantida pelo Pigsty depois
 * de a MinIO deixar de publicar imagens), com o mesmo entrypoint (`docker-entrypoint.sh minio`).
 * Fixada por tag de release E por digest: uma tag reescrita não muda a imagem por baixo do teste.
 *
 * Um sítio só: os testes de S3 (#430, #575) importam daqui.
 */
export const IMAGEM_MINIO =
  'pgsty/minio:RELEASE.2026-08-04T00-00-00Z@sha256:b6bfe7239bfc83fb90d31612d9704d86039dd714f7904b3f1ad68f211e602372';
