-- CreateEnum
CREATE TYPE "StatusVaga" AS ENUM ('RASCUNHO', 'ABERTA', 'EM_TRIAGEM', 'FECHADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EtapaCandidatura" AS ENUM ('RECEBIDA', 'TRIAGEM', 'ENTREVISTA', 'PROPOSTA', 'CONTRATADO', 'REJEITADO', 'DESISTIU');

-- CreateEnum
CREATE TYPE "TipoEntrevista" AS ENUM ('TELEFONICA', 'PRESENCIAL', 'VIDEO', 'TECNICA', 'PAINEL');

-- CreateTable
CREATE TABLE "Vaga" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "departamentoId" TEXT,
    "cargoId" TEXT,
    "numeroPosicoes" INTEGER NOT NULL DEFAULT 1,
    "posicoesPreenchidas" INTEGER NOT NULL DEFAULT 0,
    "salarioMin" DECIMAL(18,2),
    "salarioMax" DECIMAL(18,2),
    "regimeTrabalho" "RegimeTrabalho" NOT NULL,
    "tipoContrato" "TipoContratoTrabalho" NOT NULL,
    "localizacao" TEXT,
    "requisitos" TEXT[],
    "status" "StatusVaga" NOT NULL DEFAULT 'RASCUNHO',
    "dataAbertura" TIMESTAMP(3),
    "dataFecho" TIMESTAMP(3),
    "responsavelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vaga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidato" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "bi" TEXT,
    "nuit" TEXT,
    "cvUrl" TEXT,
    "linkedinUrl" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidatura" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vagaId" TEXT NOT NULL,
    "candidatoId" TEXT NOT NULL,
    "etapa" "EtapaCandidatura" NOT NULL DEFAULT 'RECEBIDA',
    "posicao" TEXT NOT NULL DEFAULT '0.5',
    "fonte" TEXT,
    "pretensaoSalarial" DECIMAL(18,2),
    "notaTriagem" DECIMAL(9,6),
    "colaboradorId" TEXT,
    "motivoRejeicao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entrevista" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "candidaturaId" TEXT NOT NULL,
    "tipo" "TipoEntrevista" NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "entrevistadores" TEXT[],
    "avaliacao" DECIMAL(9,6),
    "parecer" TEXT,
    "recomendaAvancar" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entrevista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoCandidatura" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "candidaturaId" TEXT NOT NULL,
    "etapaAnterior" "EtapaCandidatura",
    "etapaNova" "EtapaCandidatura" NOT NULL,
    "responsavelId" TEXT NOT NULL,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricoCandidatura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vaga_tenantId_status_idx" ON "Vaga"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Vaga_tenantId_createdAt_idx" ON "Vaga"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vaga_tenantId_codigo_key" ON "Vaga"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "Candidato_tenantId_email_idx" ON "Candidato"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Candidato_tenantId_createdAt_idx" ON "Candidato"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Candidato_tenantId_email_key" ON "Candidato"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Candidatura_tenantId_vagaId_etapa_idx" ON "Candidatura"("tenantId", "vagaId", "etapa");

-- CreateIndex
CREATE INDEX "Candidatura_tenantId_vagaId_posicao_idx" ON "Candidatura"("tenantId", "vagaId", "posicao");

-- CreateIndex
CREATE UNIQUE INDEX "Candidatura_tenantId_vagaId_candidatoId_key" ON "Candidatura"("tenantId", "vagaId", "candidatoId");

-- CreateIndex
CREATE INDEX "Entrevista_tenantId_candidaturaId_idx" ON "Entrevista"("tenantId", "candidaturaId");

-- CreateIndex
CREATE INDEX "Entrevista_tenantId_dataHora_idx" ON "Entrevista"("tenantId", "dataHora");

-- CreateIndex
CREATE INDEX "HistoricoCandidatura_tenantId_candidaturaId_createdAt_idx" ON "HistoricoCandidatura"("tenantId", "candidaturaId", "createdAt");

-- AddForeignKey
ALTER TABLE "Candidatura" ADD CONSTRAINT "Candidatura_vagaId_fkey" FOREIGN KEY ("vagaId") REFERENCES "Vaga"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidatura" ADD CONSTRAINT "Candidatura_candidatoId_fkey" FOREIGN KEY ("candidatoId") REFERENCES "Candidato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrevista" ADD CONSTRAINT "Entrevista_candidaturaId_fkey" FOREIGN KEY ("candidaturaId") REFERENCES "Candidatura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoCandidatura" ADD CONSTRAINT "HistoricoCandidatura_candidaturaId_fkey" FOREIGN KEY ("candidaturaId") REFERENCES "Candidatura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

