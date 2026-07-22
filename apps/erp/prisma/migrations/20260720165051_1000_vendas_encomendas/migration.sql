-- CreateEnum
CREATE TYPE "StatusEncomenda" AS ENUM ('RASCUNHO', 'CONFIRMADA', 'PARCIALMENTE_ENTREGUE', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusDevolucao" AS ENUM ('PENDENTE', 'APROVADA', 'PROCESSADA', 'REJEITADA');

-- CreateEnum
CREATE TYPE "MotivoDevolucao" AS ENUM ('DEFEITO', 'PRODUTO_ERRADO', 'INSATISFACAO', 'EXCESSO_PEDIDO', 'AVARIA_TRANSPORTE', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusVendedor" AS ENUM ('ATIVO', 'INATIVO', 'SUSPENSO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoSerieDocumento" ADD VALUE 'ENCOMENDA';
ALTER TYPE "TipoSerieDocumento" ADD VALUE 'NOTA_DEVOLUCAO';

-- CreateTable
CREATE TABLE "Vendedor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "colaboradorId" TEXT,
    "userId" TEXT,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "metaMensal" DECIMAL(18,2),
    "status" "StatusVendedor" NOT NULL DEFAULT 'ATIVO',
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Vendedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Encomenda" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "vendedorId" TEXT,
    "status" "StatusEncomenda" NOT NULL DEFAULT 'RASCUNHO',
    "dataPrevista" TIMESTAMP(3),
    "enderecoEntregaId" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "desconto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "iva" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MZN',
    "notas" TEXT,
    "vendaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Encomenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemEncomenda" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "encomendaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "varianteId" TEXT,
    "nomeProduto" TEXT NOT NULL,
    "sku" TEXT,
    "quantidade" DECIMAL(18,2) NOT NULL,
    "precoUnitario" DECIMAL(18,2) NOT NULL,
    "desconto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxaIva" DECIMAL(9,6) NOT NULL DEFAULT 0.160000,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "ivaItem" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "quantidadeEntregue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemEncomenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Devolucao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "vendaId" TEXT,
    "faturaId" TEXT,
    "motivo" "MotivoDevolucao" NOT NULL,
    "status" "StatusDevolucao" NOT NULL DEFAULT 'PENDENTE',
    "valorTotal" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MZN',
    "notaCreditoId" TEXT,
    "reembolso" BOOLEAN NOT NULL DEFAULT false,
    "observacoes" TEXT,
    "aprovadoPorId" TEXT,
    "aprovadoEm" TIMESTAMP(3),
    "processadoPorId" TEXT,
    "processadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Devolucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDevolucao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "devolucaoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "varianteId" TEXT,
    "nomeProduto" TEXT NOT NULL,
    "sku" TEXT,
    "quantidade" DECIMAL(18,2) NOT NULL,
    "valorUnitario" DECIMAL(18,2) NOT NULL,
    "taxaIva" DECIMAL(9,6) NOT NULL DEFAULT 0.160000,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "ivaItem" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemDevolucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Troca" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "devolucaoId" TEXT NOT NULL,
    "vendaSubstituicaoId" TEXT NOT NULL,
    "diferenca" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MZN',
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Troca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vendedor_tenantId_status_idx" ON "Vendedor"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Vendedor_tenantId_nome_idx" ON "Vendedor"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "Vendedor_tenantId_deletedAt_idx" ON "Vendedor"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vendedor_tenantId_userId_key" ON "Vendedor"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "Encomenda_tenantId_status_idx" ON "Encomenda"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Encomenda_tenantId_clienteId_idx" ON "Encomenda"("tenantId", "clienteId");

-- CreateIndex
CREATE INDEX "Encomenda_tenantId_vendedorId_idx" ON "Encomenda"("tenantId", "vendedorId");

-- CreateIndex
CREATE INDEX "Encomenda_tenantId_dataPrevista_idx" ON "Encomenda"("tenantId", "dataPrevista");

-- CreateIndex
CREATE INDEX "Encomenda_tenantId_deletedAt_idx" ON "Encomenda"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Encomenda_tenantId_numero_key" ON "Encomenda"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "ItemEncomenda_tenantId_encomendaId_idx" ON "ItemEncomenda"("tenantId", "encomendaId");

-- CreateIndex
CREATE INDEX "ItemEncomenda_produtoId_idx" ON "ItemEncomenda"("produtoId");

-- CreateIndex
CREATE INDEX "Devolucao_tenantId_status_idx" ON "Devolucao"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Devolucao_tenantId_clienteId_idx" ON "Devolucao"("tenantId", "clienteId");

-- CreateIndex
CREATE INDEX "Devolucao_tenantId_vendaId_idx" ON "Devolucao"("tenantId", "vendaId");

-- CreateIndex
CREATE INDEX "Devolucao_tenantId_createdAt_idx" ON "Devolucao"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Devolucao_tenantId_numero_key" ON "Devolucao"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "ItemDevolucao_tenantId_devolucaoId_idx" ON "ItemDevolucao"("tenantId", "devolucaoId");

-- CreateIndex
CREATE INDEX "ItemDevolucao_produtoId_idx" ON "ItemDevolucao"("produtoId");

-- CreateIndex
CREATE INDEX "Troca_tenantId_createdAt_idx" ON "Troca"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Troca_tenantId_numero_key" ON "Troca"("tenantId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "Troca_tenantId_devolucaoId_key" ON "Troca"("tenantId", "devolucaoId");

-- AddForeignKey
ALTER TABLE "ItemEncomenda" ADD CONSTRAINT "ItemEncomenda_encomendaId_fkey" FOREIGN KEY ("encomendaId") REFERENCES "Encomenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDevolucao" ADD CONSTRAINT "ItemDevolucao_devolucaoId_fkey" FOREIGN KEY ("devolucaoId") REFERENCES "Devolucao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

