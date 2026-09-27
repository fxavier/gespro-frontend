# Tickets — issue #140

Contratos fixos (o verificador escreve os oráculos contra isto; o autor implementa isto).

## T1 [BLOCKING] Tolerâncias no schema da conta bancária

`src/lib/validations/contabilidade.ts`:

```ts
export const ConfigReconciliacaoContaSchema = z.object({
  toleranciaDias: z.coerce.number().int().min(0).max(60),
  toleranciaValor: z.string().trim().regex(/^\d{1,16}(\.\d{1,2})?$/, '…'),  // ≥ 0, até 2 casas; vira Decimal
  permitirMatchPorReferencia: z.boolean(),
  permitirMatchPorValor: z.boolean(),
  permitirMatchPorDescricao: z.boolean(),
  autoReconciliacao: z.boolean(),
  limiarConfianca: z.coerce.number().int().min(50).max(100),
  permitirAgregacao: z.boolean(),
  maxMovimentosAgregacao: z.coerce.number().int().min(2).max(20),
});
// CriarContaBancariaSchema = base.merge(ConfigReconciliacaoContaSchema.partial())
// AtualizarContaBancariaSchema continua = Criar.partial().extend({ id, ativo })
```

- SEM `.default()`: um campo omitido fica omitido (o update não repõe omissões; o create usa a omissão da BD).
- O serviço grava `toleranciaValor` como `Prisma.Decimal`.

✅ Gate: `npx vitest run src/lib/validations/__tests__/conta-bancaria-reconciliacao.test.ts`

## T2 [BLOCKING] Validação das regras

`src/lib/validations/reconciliacao.ts`:

```ts
export const RegraSugestaoSchema = z.object({
  contaBancariaId: idEntidade().nullable(),          // null = todas as contas
  padrao: z.string().trim().min(1).max(200)          // pelo menos uma palavra não vazia entre '|'
    .refine(p => p.split('|').some(s => s.trim().length > 0), '…'),
  natureza: z.enum(['DEBITO', 'CREDITO']),            // CREDITO = saída do banco
  contaContrapartidaId: idEntidade(),
  descricao: z.string().trim().max(200).optional(),
  prioridade: z.coerce.number().int().min(1).max(999),
});
export const EditarRegraSugestaoSchema = RegraSugestaoSchema.extend({ id: idEntidade() });
export const RegraSugestaoIdSchema = z.object({ id: idEntidade() });
```

✅ Gate: `npx vitest run src/lib/validations/__tests__/regra-sugestao.test.ts`

## T3 [BLOCKING] Serviço das regras

`src/server/services/reconciliacao/regras-sugestao.service.ts` (`import 'server-only'`, cliente estendido `prisma`, escritas singulares):

- `listarRegrasSugestao(ctx)`: todas as do tenant, por `ativo desc, prioridade asc`, com `contaBancaria {banco, numeroConta}` e `contaContrapartida {codigo, nome}` resolvidas (FK escalares: resolver por consulta, sem `include`).
- `obterRegraSugestao(id, ctx)`: `null` se não existir no tenant.
- `criarRegraSugestao(input, ctx)` / `editarRegraSugestao(input, ctx)`:
  - a contrapartida tem de ser ContaPGC do tenant, `aceitaLancamento` e `ativo`, senão `BusinessRuleError('CONTRAPARTIDA_INVALIDA')`;
  - a contrapartida não pode ser o `contaContabilId` de nenhuma conta bancária do tenant, senão `BusinessRuleError('CONTRAPARTIDA_E_CONTA_BANCO')`;
  - `contaBancariaId` (se não null) tem de existir no tenant, senão `NotFoundError`;
  - editar uma regra de outro tenant ou inexistente dá `NotFoundError`.
- `activarRegraSugestao(id, ctx)` / `desactivarRegraSugestao(id, ctx)`: `NotFoundError` fora do tenant; se já estiver no estado pedido, devolve a regra sem escrever.
- Não há eliminar.

✅ Gate: `npx vitest run src/server/services/reconciliacao/__tests__/regras-sugestao.service.test.ts`

## T4 Regra por omissão nos tenants novos

- `tenant-bootstrap.ts`: `bootstrapRegrasSugestao(tx, tenantId)`, chamado em `bootstrapContabilidade`. Idempotente por contagem (se o tenant já tem regras, não escreve). Sem conta 6981 folha e activa, não escreve e não lança.
- `prisma/seed/financas.ts` delega nela (sai o `seedRegrasSugestao`).
- Migração de dados (orquestrador): `INSERT … SELECT` para os tenants com 6981 e sem nenhuma regra.

✅ Gate: `npx vitest run src/server/provisioning/__tests__/tenant-bootstrap.test.ts`

## T5 Actions

`reconciliacao.actions.ts`: `criarRegraSugestaoAction`, `editarRegraSugestaoAction`, `activarRegraSugestaoAction`, `desactivarRegraSugestaoAction`, com a permissão `financas:banca:reconciliacao` e revalidate de `/contabilidade/reconciliacao/regras`.

✅ Gate: `pnpm gates` (gate-leitura) verde.

## T6 UI

- `contas-bancarias/_components/conta-bancaria-form.tsx`: nova secção «Reconciliação» com os 9 campos. A página de editar passa os valores actuais; «nova» usa as omissões da BD (5, 0.00, sim, sim, não, não, 90, não, 5).
- `/contabilidade/reconciliacao/regras`:
  - lista: prioridade, padrão, movimento (Saída/Entrada), conta bancária (ou «Todas»), contrapartida, estado, acções;
  - `nova` e `[id]/editar`: formulário com Combobox de conta PGC folha e de conta bancária;
  - Desactivar/Activar: `AlertDialog`;
  - sem `financas:banca:reconciliacao` vê a lista sem botões; sem nenhuma das duas permissões, «Sem permissão».
- Link «Regras de sugestão» no cabeçalho de `/contabilidade/reconciliacao`.

✅ Gate: `e2e/22-reconciliacao-regras.spec.ts` verde contra `gespro_e2e77`; `pnpm check && pnpm gates` verdes; `pnpm build` verde.
