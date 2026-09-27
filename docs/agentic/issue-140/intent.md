# Issue #140 — regras de sugestão e tolerâncias da conta bancária

## Confirmado em runtime (2026-09-27, main 7cfd788, tenant demo)

- O formulário de edição da conta bancária mostra só Banco, Agência, Número, Tipo, Moeda e Conta PGC.
- `AtualizarContaBancariaSchema.parse({ id, toleranciaDias: 9 })` devolve `{ id }`: o Zod descarta as tolerâncias.
- Não há link nem rota para `RegraSugestaoLancamento`. A única regra é a do seed.
- Pelo código: `tenant-bootstrap.ts` não cria a regra por omissão, logo um tenant do registo público fica sem nenhuma.

## Decisões (utilizador, 2026-09-27: «Avança com as suas sugestões»)

| Tema | Decisão |
|---|---|
| Permissão das tolerâncias | `financas:banca:contas:escrita` (as da action `atualizarContaBancaria`) |
| Permissão das regras | `financas:banca:reconciliacao` para escrever; ler com essa ou `financas:leitura` |
| Eliminar regra | Não há. Só desactivar/reactivar (como as séries, #149) |
| Tenants novos | `bootstrapContabilidade` cria a regra por omissão; migração para os tenants existentes sem regra |

## O que NÃO entra

- Motor de matching ou de sugestão: já lê as colunas e a tabela.
- Migração de schema: as colunas e a tabela existem. A única migração é de dados (INSERT da regra por omissão).
- Testar a regra contra movimentos («pré-visualizar»): fica para depois, se for pedido.
