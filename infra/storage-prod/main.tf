# ==============================================================================
# Stack: storage-prod
#
# A única stack Terraform que se aplica com a produção no Railway (ADR-0050 §2,
# §6). Provisiona só o bucket S3 dos documentos — anexos dos módulos e os PDF
# arquivados no encerramento (ADR-0035 §8) — e a identidade com que a app lá
# chega. O cálculo (ERP, Keycloak, Valkey, cron) e as bases vivem no Railway; o
# Terraform AWS que os servia está em infra/_arquivo-aws/.
#
#   - Bucket com versionamento, Object Lock GOVERNANCE (10 anos) e réplica noutra
#     região da UE — tudo do módulo `infra/modules/storage` (#575, #638, #644).
#   - `prevent_destroy` nos dois buckets (`proteger_contra_destruicao = true`).
#   - Utilizador IAM `gespro-app-storage-prod` com a política MÍNIMA da app e uma
#     chave de acesso. Desvio ao ADR-0022 §3 (federação, não chaves), registado no
#     ADR-0050 §2: não se verificou federação OIDC dos serviços Railway com a AWS.
#
# Nunca aplicado. Verificador offline:
#   terraform -chdir=infra/storage-prod init -backend=false
#   terraform -chdir=infra/storage-prod test
# ==============================================================================

terraform {
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.default_tags
  }
}

# Região da réplica dos documentos (ADR-0020 §2).
provider "aws" {
  alias  = "replica"
  region = var.replica_region

  default_tags {
    tags = local.default_tags
  }
}

locals {
  project     = "gespro"
  environment = "prod"

  default_tags = {
    Project     = local.project
    Environment = local.environment
    ManagedBy   = "terraform"
    Stack       = "storage-prod"
  }
}

# ------------------------------------------------------------------------------
# Bucket dos documentos (e réplica)
# ------------------------------------------------------------------------------
module "storage" {
  source = "../modules/storage"

  providers = {
    aws         = aws
    aws.replica = aws.replica
  }

  project         = local.project
  environment     = local.environment
  expiration_days = 30
  allowed_origins = var.app_origins

  replica_region            = var.replica_region
  object_lock_retencao_anos = var.retencao_documentos_fiscais_anos
  object_lock_modo          = "GOVERNANCE" # porquê, em modules/storage/main.tf

  # prevent_destroy nos buckets: um plano que destrua ou substitua o bucket dos
  # documentos falha (#644). Retirá-lo é decisão humana registada.
  proteger_contra_destruicao = true

  tags = local.default_tags
}

# ------------------------------------------------------------------------------
# Identidade da app (serviço `erp` no Railway)
#
# O adaptador `apps/erp/src/lib/storage/objeto/s3.ts` usa a cadeia de
# credenciais por omissão do SDK: com AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY
# no ambiente do serviço, é esta chave que assina o PUT/GET/DELETE e o POST
# do browser (ADR-0017 §1).
#
# Política mínima, como a role da instância do App Runner tinha:
#   - Allow: só GetObject, PutObject, DeleteObject, só nos prefixos da app
#     (`tenant/…`, derivarKey em lib/storage/objeto/key.ts). Um DeleteObject num
#     bucket versionado cria um marcador de apagamento: a versão fica.
#   - Deny explícito do que encurtaria ou contornaria a retenção. Redundante com
#     o Allow — de propósito: uma política anexada mais tarde ao utilizador (ou a
#     um grupo) não reabre o bypass por engano.
# Sem ListBucket: a app nunca lista; e sem ele um GET de uma key inexistente
# devolve 403 em vez de 404, o que não revela que keys existem.
# ------------------------------------------------------------------------------
locals {
  bucket_arn = module.storage.bucket_arn

  # Acções que nenhuma credencial da app pode ter (ADR-0020 §2, ADR-0050 §2).
  acoes_proibidas_app = [
    "s3:BypassGovernanceRetention",
    "s3:DeleteObjectVersion",
    "s3:PutObjectRetention",
    "s3:PutObjectLegalHold",
    "s3:PutBucketObjectLockConfiguration",
    "s3:PutBucketVersioning",
    "s3:PutLifecycleConfiguration",
    "s3:PutReplicationConfiguration",
    "s3:PutBucketPolicy",
    "s3:DeleteBucket",
  ]

  politica_app = {
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ObjectosDaApp"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = [for p in var.app_prefixos : "${local.bucket_arn}/${p}*"]
      },
      {
        Sid      = "NuncaEncurtarNemContornarARetencao"
        Effect   = "Deny"
        Action   = local.acoes_proibidas_app
        Resource = [local.bucket_arn, "${local.bucket_arn}/*"]
      },
    ]
  }
}

resource "aws_iam_user" "app" {
  name = "${local.project}-app-storage-${local.environment}"
  path = "/${local.project}/"

  tags = merge(local.default_tags, {
    Purpose = "credencial-s3-da-app-no-railway"
  })
}

resource "aws_iam_user_policy" "app" {
  name   = "s3-documentos"
  user   = aws_iam_user.app.name
  policy = jsonencode(local.politica_app)
}

# A chave nasce no `apply` e vive no estado remoto (bucket cifrado, versionado,
# sem acesso público — infra/bootstrap). Sai SÓ por `terraform output -raw` para
# a variável selada do serviço `erp` no Railway; nunca entra no repositório.
# Rodar: `terraform apply -replace=aws_iam_access_key.app`, actualizar o
# Railway, reimplantar, confirmar um upload — a chave antiga morre no apply.
resource "aws_iam_access_key" "app" {
  user = aws_iam_user.app.name
}
