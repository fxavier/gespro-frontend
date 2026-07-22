-- CreateEnum
CREATE TYPE "ProbabilidadeRisco" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'MUITO_ALTA');

-- CreateEnum
CREATE TYPE "ImpactoRisco" AS ENUM ('BAIXO', 'MEDIO', 'ALTO', 'MUITO_ALTO');

-- CreateEnum
CREATE TYPE "EstrategiaRisco" AS ENUM ('EVITAR', 'MITIGAR', 'TRANSFERIR', 'ACEITAR');

-- CreateEnum
CREATE TYPE "StatusRisco" AS ENUM ('IDENTIFICADO', 'EM_MITIGACAO', 'FECHADO', 'MATERIALIZADO');

-- CreateEnum
CREATE TYPE "TipoQualidade" AS ENUM ('NAO_CONFORMIDADE', 'INSPECAO', 'AUDITORIA', 'REVISAO');

-- CreateEnum
CREATE TYPE "StatusQualidade" AS ENUM ('ABERTA', 'EM_ANALISE', 'RESOLVIDA', 'FECHADA');

-- CreateEnum
CREATE TYPE "TipoComunicacao" AS ENUM ('REUNIAO', 'ATA', 'DECISAO', 'ANUNCIO', 'RELATORIO');

-- CreateTable
CREATE TABLE "RiscoProjeto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "probabilidade" "ProbabilidadeRisco" NOT NULL,
    "impacto" "ImpactoRisco" NOT NULL,
    "severidade" INTEGER NOT NULL,
    "estrategiaResposta" "EstrategiaRisco" NOT NULL,
    "responsavelId" TEXT,
    "status" "StatusRisco" NOT NULL,
    "planoMitigacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiscoProjeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistoQualidade" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "tarefaId" TEXT,
    "marcoId" TEXT,
    "tipo" "TipoQualidade" NOT NULL,
    "descricao" TEXT NOT NULL,
    "acaoCorretiva" TEXT,
    "status" "StatusQualidade" NOT NULL,
    "responsavelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistoQualidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComunicacaoProjeto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "tipo" "TipoComunicacao" NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "participantes" TEXT[],
    "resumo" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComunicacaoProjeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracaoProjeto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "politicaAprovacaoTimesheet" TEXT NOT NULL DEFAULT 'MANUAL',
    "tiposTarefaAtivos" TEXT[],
    "papeisEquipaAtivos" TEXT[],
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoProjeto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiscoProjeto_tenantId_projetoId_status_idx" ON "RiscoProjeto"("tenantId", "projetoId", "status");

-- CreateIndex
CREATE INDEX "RiscoProjeto_tenantId_status_idx" ON "RiscoProjeto"("tenantId", "status");

-- CreateIndex
CREATE INDEX "RiscoProjeto_tenantId_createdAt_idx" ON "RiscoProjeto"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "RegistoQualidade_tenantId_projetoId_status_idx" ON "RegistoQualidade"("tenantId", "projetoId", "status");

-- CreateIndex
CREATE INDEX "RegistoQualidade_tenantId_status_idx" ON "RegistoQualidade"("tenantId", "status");

-- CreateIndex
CREATE INDEX "RegistoQualidade_tenantId_createdAt_idx" ON "RegistoQualidade"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ComunicacaoProjeto_tenantId_projetoId_tipo_idx" ON "ComunicacaoProjeto"("tenantId", "projetoId", "tipo");

-- CreateIndex
CREATE INDEX "ComunicacaoProjeto_tenantId_projetoId_data_idx" ON "ComunicacaoProjeto"("tenantId", "projetoId", "data");

-- CreateIndex
CREATE INDEX "ComunicacaoProjeto_tenantId_deletedAt_idx" ON "ComunicacaoProjeto"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracaoProjeto_projetoId_key" ON "ConfiguracaoProjeto"("projetoId");

-- CreateIndex
CREATE INDEX "ConfiguracaoProjeto_tenantId_projetoId_idx" ON "ConfiguracaoProjeto"("tenantId", "projetoId");

-- AddForeignKey
ALTER TABLE "RiscoProjeto" ADD CONSTRAINT "RiscoProjeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistoQualidade" ADD CONSTRAINT "RegistoQualidade_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComunicacaoProjeto" ADD CONSTRAINT "ComunicacaoProjeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfiguracaoProjeto" ADD CONSTRAINT "ConfiguracaoProjeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

