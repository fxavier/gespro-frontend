-- Migração de identidade — ADR-0013.
-- PONTO DE NÃO RETORNO: remove 5 tabelas e a coluna passwordHash.
-- Escrita à mão, não gerada: o `migrate diff` produziria um ADD COLUMN
-- NOT NULL sem default, que falha em qualquer tabela com linhas.

ALTER TABLE "AuditLog" ADD COLUMN "keycloakSub" TEXT, ADD COLUMN "requestId" TEXT;
ALTER TABLE "User" ADD COLUMN "keycloakSub" TEXT NOT NULL DEFAULT gen_random_uuid()::text;
ALTER TABLE "User" ALTER COLUMN "keycloakSub" DROP DEFAULT;   -- na MESMA migração (ADR-0013 §4)
ALTER TABLE "User" ADD COLUMN "primeiroAcessoEm" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_keycloakSub_key" ON "User"("keycloakSub");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");      -- ver nota (a)
CREATE INDEX "User_tenantId_email_idx" ON "User"("tenantId", "email");

-- FASE DE CONTRACÇÃO (destrutiva — só depois de o código novo estar em todas as instâncias)
ALTER TABLE "PasswordResetToken" DROP CONSTRAINT "PasswordResetToken_tenantId_fkey";
ALTER TABLE "PasswordResetToken" DROP CONSTRAINT "PasswordResetToken_userId_fkey";
ALTER TABLE "UserInvite" DROP CONSTRAINT "UserInvite_invitedById_fkey";
ALTER TABLE "UserInvite" DROP CONSTRAINT "UserInvite_roleId_fkey";
ALTER TABLE "UserInvite" DROP CONSTRAINT "UserInvite_tenantId_fkey";
DROP INDEX "User_tenantId_email_key";
ALTER TABLE "User" DROP COLUMN "emailVerificado", DROP COLUMN "emailVerificadoEm",
                   DROP COLUMN "passwordHash";
DROP TABLE "LoginAttempt";
DROP TABLE "PasswordResetToken";
DROP TABLE "UserInvite";
DROP TABLE "TokenHandoff";
DROP TABLE "TokenVerificacaoEmail";
