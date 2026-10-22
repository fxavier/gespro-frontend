# ==============================================================================
# módulo: storage
#
# S3 para uploads e relatórios GestPro:
#   - Bucket privado (sem acesso público)
#   - Encriptação SSE-S3 em repouso
#   - Versionamento activado
#   - Lifecycle: expirar tmp/ ao fim de N dias
#   - CORS configurado para uploads directos do browser (pre-signed URLs)
#   - Continuidade (ADR-0020 §2, #575), ambos opcionais por variável:
#       * Object Lock com retenção por omissão (conservação de documentos fiscais)
#       * Replicação para um bucket réplica noutra região (`aws.replica`)
#
# Porque é ESTE o bucket dos documentos fiscais: a app tem um só bucket
# (`S3_BUCKET`). Lá vivem os PDF arquivados no encerramento do exercício
# (ADR-0035 §8, recurso `encerramento`) e os documentos de suporte carregados
# pelos utilizadores (fornecedor, activo, viatura, colaborador…). As facturas
# não são objectos: são linhas append-only na base e o PDF é re-gerado.
# ==============================================================================

locals {
  bucket_name         = "${var.project}-uploads-${var.environment}"
  replica_bucket_name = "${local.bucket_name}-replica"

  replicar    = var.replica_region != null
  object_lock = var.object_lock_retencao_anos > 0

  # Versões não correntes (ADR-0020 §2, #575).
  #
  # Antes: expiravam aos 90 dias. Com o versionamento a ser o que «impede que um
  # apagamento indevido seja irreversível» (ADR-0020 §2), 90 dias quer dizer que
  # uma factura de fornecedor sobreposta ou apagada por engano desaparece de vez
  # ao fim de três meses — incompatível com a conservação de dez anos.
  #
  # Agora, com Object Lock: as versões ficam até à retenção legal MAIS UM ANO. O
  # bloqueio conta-se a partir da escrita do objecto, mas o prazo legal conta-se
  # do fim do exercício a que o documento respeita — que pode chegar um ano depois.
  # (A regra de ciclo de vida nunca apaga uma versão ainda bloqueada; o ano extra é
  # para não a apagar no próprio dia em que o bloqueio caduca.)
  # Sem Object Lock (dev): mantém-se 90 dias.
  noncurrent_days = local.object_lock ? ceil((var.object_lock_retencao_anos + 1) * 365.25) : 90
}

resource "aws_s3_bucket" "uploads" {
  bucket = local.bucket_name

  # `object_lock_enabled` neste recurso é ForceNew: mudá-lo num bucket que já
  # existe planeia DESTRUIR o bucket dos documentos e criar outro. O IaC nunca foi
  # aplicado (docs/status.md), por isso entra já na criação. Para ligar o Object
  # Lock num bucket existente o caminho é `aws_s3_bucket_object_lock_configuration`
  # com `object_lock_enabled = "Enabled"` (a AWS permite-o desde 2023), nunca esta
  # flag — e o `prevent_destroy` abaixo faz o plano falhar antes de alguém tentar.
  object_lock_enabled = local.object_lock

  tags = merge(var.tags, {
    Name    = local.bucket_name
    Purpose = "uploads-relatorios"
  })

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ------------------------------------------------------------------------------
# Object Lock — retenção por omissão de cada versão nova
#
# Modo GOVERNANCE (omissão), não COMPLIANCE:
#   - O bucket é misto. Além dos documentos fiscais guarda documentos pessoais de
#     colaboradores, cuja remoção o ADR-0017 quer efectiva (protecção de dados).
#     Em GOVERNANCE, um pedido de apagamento legítimo ou um ficheiro carregado por
#     engano com dados que não deviam estar lá pode ser purgado por uma role de
#     emergência com `s3:BypassGovernanceRetention`, num acto auditado no CloudTrail.
#     Em COMPLIANCE não pode — nem pela conta root — durante dez anos.
#   - COMPLIANCE é irreversível também no valor: um prazo errado não se encurta.
#     O prazo vem de investigação jurídica ainda não confirmada por advogado
#     (docs/research/mocambique-quadro-legal.md, como a #64 para o ADR-0034).
#   - Para a app, GOVERNANCE comporta-se como COMPLIANCE: a role da instância
#     (modules/app) só tem Get/Put/DeleteObject — sem `DeleteObjectVersion` nem
#     `BypassGovernanceRetention`. Um `storage.delete()` (ADR-0017) cria um
#     marcador de apagamento: o objecto deixa de ser servido, a versão fica.
#     Credenciais da app comprometidas não destroem o arquivo.
# Quem quiser o modo estrito passa `object_lock_modo = "COMPLIANCE"`.
#
# A retenção aplica-se a TODAS as versões novas, incluindo `tmp/`: a regra de
# `tmp/` abaixo esconde o objecto (marcador de apagamento) mas a versão só sai
# quando o bloqueio caducar. Se `tmp/` passar a ter volume, vai para outro bucket.
# ------------------------------------------------------------------------------
resource "aws_s3_bucket_object_lock_configuration" "uploads" {
  count = local.object_lock ? 1 : 0

  bucket = aws_s3_bucket.uploads.id

  rule {
    default_retention {
      mode  = var.object_lock_modo
      years = var.object_lock_retencao_anos
    }
  }

  depends_on = [aws_s3_bucket_versioning.uploads]
}

resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    id     = "expire-tmp-objects"
    status = "Enabled"

    filter {
      prefix = "tmp/"
    }

    expiration {
      days = var.expiration_days
    }
  }

  # Objectos órfãos (presign sem registo subsequente) — aborta multipart incompletos.
  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  # Ver `local.noncurrent_days`: retenção legal + 1 ano com Object Lock, 90 dias sem.
  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = local.noncurrent_days
    }
  }

  depends_on = [aws_s3_bucket_versioning.uploads]
}

# CORS: POST (upload directo com política de tamanho, #430) + GET (download por
# presigned URL); PUT mantido por compatibilidade. Restrito às
# origens da app (ALLOWED_ORIGINS). NUNCA wildcard em produção — ver spec 01 §7.
resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  cors_rule {
    allowed_headers = ["Content-Type"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = var.allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

# ==============================================================================
# Réplica noutra região (ADR-0020 §2)
#
# Não é continuidade regional (ADR-0020 §Consequências: falha de região não está
# coberta) — é uma segunda cópia dos documentos fora da região da conta, contra a
# perda do bucket de origem (apagamento do bucket, erro de IaC, região perdida
# de vez). Mesma cifra, mesmo bloqueio, sem acesso público.
# ==============================================================================

resource "aws_s3_bucket" "replica" {
  count    = local.replicar ? 1 : 0
  provider = aws.replica

  bucket = local.replica_bucket_name

  # Uma origem com Object Lock só replica para um destino com Object Lock.
  object_lock_enabled = local.object_lock

  tags = merge(var.tags, {
    Name    = local.replica_bucket_name
    Purpose = "replica-uploads-relatorios"
  })

  # Mesma razão que na origem: `object_lock_enabled` é ForceNew.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "replica" {
  count    = local.replicar ? 1 : 0
  provider = aws.replica

  bucket = aws_s3_bucket.replica[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "replica" {
  count    = local.replicar ? 1 : 0
  provider = aws.replica

  bucket = aws_s3_bucket.replica[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "replica" {
  count    = local.replicar ? 1 : 0
  provider = aws.replica

  bucket = aws_s3_bucket.replica[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# A retenção das versões replicadas vem da origem (a replicação copia-a); a
# omissão do destino cobre o que lá for escrito por outra via.
resource "aws_s3_bucket_object_lock_configuration" "replica" {
  count    = local.replicar && local.object_lock ? 1 : 0
  provider = aws.replica

  bucket = aws_s3_bucket.replica[0].id

  rule {
    default_retention {
      mode  = var.object_lock_modo
      years = var.object_lock_retencao_anos
    }
  }

  depends_on = [aws_s3_bucket_versioning.replica]
}

resource "aws_s3_bucket_lifecycle_configuration" "replica" {
  count    = local.replicar ? 1 : 0
  provider = aws.replica

  bucket = aws_s3_bucket.replica[0].id

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = local.noncurrent_days
    }
  }

  depends_on = [aws_s3_bucket_versioning.replica]
}

# ------------------------------------------------------------------------------
# Role IAM assumida pelo S3 para replicar
# ------------------------------------------------------------------------------
data "aws_iam_policy_document" "replicacao_assume" {
  count = local.replicar ? 1 : 0

  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["s3.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "replicacao" {
  count = local.replicar ? 1 : 0

  name               = "${local.bucket_name}-replicacao"
  assume_role_policy = data.aws_iam_policy_document.replicacao_assume[0].json

  tags = var.tags
}

data "aws_iam_policy_document" "replicacao" {
  count = local.replicar ? 1 : 0

  statement {
    sid       = "LerConfiguracaoDaOrigem"
    effect    = "Allow"
    actions   = ["s3:GetReplicationConfiguration", "s3:ListBucket"]
    resources = [aws_s3_bucket.uploads.arn]
  }

  statement {
    sid    = "LerVersoesDaOrigem"
    effect = "Allow"
    actions = [
      "s3:GetObjectVersionForReplication",
      "s3:GetObjectVersionAcl",
      "s3:GetObjectVersionTagging",
      # Object Lock: a retenção e a retenção legal viajam com a versão.
      "s3:GetObjectRetention",
      "s3:GetObjectLegalHold",
    ]
    resources = ["${aws_s3_bucket.uploads.arn}/*"]
  }

  statement {
    sid    = "EscreverNaReplica"
    effect = "Allow"
    actions = [
      "s3:ReplicateObject",
      "s3:ReplicateDelete",
      "s3:ReplicateTags",
    ]
    resources = ["${aws_s3_bucket.replica[0].arn}/*"]
  }
}

resource "aws_iam_role_policy" "replicacao" {
  count = local.replicar ? 1 : 0

  name   = "replicacao-s3"
  role   = aws_iam_role.replicacao[0].id
  policy = data.aws_iam_policy_document.replicacao[0].json
}

resource "aws_s3_bucket_replication_configuration" "uploads" {
  count = local.replicar ? 1 : 0

  bucket = aws_s3_bucket.uploads.id
  role   = aws_iam_role.replicacao[0].arn

  rule {
    id     = "replicar-tudo"
    status = "Enabled"

    filter {}

    # Os marcadores de apagamento replicam: um `storage.delete()` (ADR-0017) deixa
    # de servir o objecto nas duas regiões. As VERSÕES não são apagadas em lado
    # nenhum (a replicação nunca propaga o apagamento de uma versão).
    delete_marker_replication {
      status = "Enabled"
    }

    destination {
      bucket = aws_s3_bucket.replica[0].arn
      # Cópia de recuperação: lida raramente; IA paga menos por GB guardado.
      storage_class = "STANDARD_IA"
    }
  }

  depends_on = [
    aws_s3_bucket_versioning.uploads,
    aws_s3_bucket_versioning.replica,
    aws_iam_role_policy.replicacao,
  ]
}
