-- Renomear `contaPaiId` → `contaMaeId` na hierarquia do plano de contas.
--
-- Escrito à mão de propósito: o `prisma migrate diff` gera DROP + ADD para uma
-- renomeação de coluna, o que apagaria a hierarquia inteira do plano (504
-- contas por tenant). `RENAME COLUMN` preserva dados, índices e a chave
-- estrangeira — é instantâneo e não reescreve a tabela.
ALTER TABLE "ContaPGC" RENAME COLUMN "contaPaiId" TO "contaMaeId";

-- A constraint mantém o nome antigo depois do rename da coluna; alinhá-la
-- evita que um `migrate diff` futuro a veja como divergência.
ALTER TABLE "ContaPGC" RENAME CONSTRAINT "ContaPGC_contaPaiId_fkey" TO "ContaPGC_contaMaeId_fkey";
