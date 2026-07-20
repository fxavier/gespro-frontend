# Handoff — Spec 08: Benefícios

**Branch:** `ws-08`
**Data:** 2026-07-19
**Estado:** Implementação completa, `pnpm check` e `pnpm gates` verdes.

---

## Ponto de integração com Payroll (spec 06)

### Assinatura do contrato `linhasPayrollDeBeneficios`

```typescript
// src/server/services/pessoas-projetos/beneficios.service.ts

import { linhasPayrollDeBeneficios } from '@/server/services/pessoas-projetos/beneficios.service';

/**
 * Gera as linhas de payroll dos benefícios activos de um colaborador
 * para um mês de referência.
 *
 * @param colaboradorId  ID do colaborador (cuid)
 * @param mesRef         Mês no formato 'YYYY-MM' (ex: '2026-07')
 * @param ctx            Contexto { tenantId, userId }
 * @returns              Array de LinhaPayrollBeneficio
 */
async function linhasPayrollDeBeneficios(
  colaboradorId: string,
  mesRef: string,
  ctx: Ctx,
): Promise<LinhaPayrollBeneficio[]>
```

### Tipo `LinhaPayrollBeneficio`

```typescript
// src/server/services/pessoas-projetos/beneficios.interface.ts

export interface LinhaPayrollBeneficio {
  tipo: 'PROVENTO' | 'DESCONTO';
  natureza: string;    // valor do enum TipoBeneficio (ex: 'SEGURO_SAUDE')
  descricao: string;   // ex: 'Benefício: Seguro de Saúde'
  valor: Prisma.Decimal;
  tributavel: boolean; // true → integra base IRPS; false → não tributável
}
```

### Regras de geração de linhas

| Condição | Linha gerada |
|---|---|
| `comparticipacaoEmpresa > 0` e `tributavel=true` | `PROVENTO` com `tributavel=true` |
| `comparticipacaoEmpresa > 0` e `tributavel=false` | `PROVENTO` com `tributavel=false` |
| `descontoColaborador > 0` | `DESCONTO` com `tributavel=false` (sempre) |
| `periodicidade != 'MENSAL'` | nenhuma linha (ignorado — o payroll trata pro-rata) |
| `status != 'ACTIVO'` | nenhuma linha |
| Fora do período (`dataFim < primeiroDia`) | nenhuma linha |

### Uso típico no `payroll.service` (spec 06)

```typescript
import { linhasPayrollDeBeneficios } from '@/server/services/pessoas-projetos/beneficios.service';

// Dentro da transacção de processamento da folha:
const linhasBeneficios = await linhasPayrollDeBeneficios(
  colaboradorId,
  `${anoReferencia}-${String(mesReferencia).padStart(2, '0')}`,
  ctx,
);

for (const linha of linhasBeneficios) {
  if (linha.tipo === 'PROVENTO') {
    // Adicionar ao salário bruto (se tributavel → integra base IRPS)
    salarioBruto = salarioBruto.plus(linha.valor);
    if (linha.tributavel) baseIrps = baseIrps.plus(linha.valor);
  } else {
    // tipo === 'DESCONTO': desconta do líquido
    descontos = descontos.plus(linha.valor);
  }
}
```

---

## Modelos adicionados

Ficheiro: `prisma/schema/pessoas-projetos.prisma` (bloco no fim, após Produção).

### Enums

- `TipoBeneficio`: SEGURO_SAUDE | SEGURO_VIDA | SUBSIDIO_ALIMENTACAO | SUBSIDIO_TRANSPORTE | SUBSIDIO_HABITACAO | SUBSIDIO_COMUNICACOES | PLANO_PENSOES | OUTRO
- `PeriodicidadeBeneficio`: MENSAL | TRIMESTRAL | ANUAL | PONTUAL
- `StatusBeneficioColaborador`: ACTIVO | SUSPENSO | TERMINADO

### Modelos

- `Beneficio` — catálogo de benefícios do tenant
- `BeneficioColaborador` — atribuição colaborador ↔ benefício com período e valores efectivos
- `Colaborador.beneficios BeneficioColaborador[]` — back-reference adicionada

---

## Serviços

| Export | Ficheiro |
|---|---|
| `BeneficioService` | `beneficios.service.ts` |
| `BeneficioColaboradorService` | `beneficios.service.ts` |
| `linhasPayrollDeBeneficios` | `beneficios.service.ts` |
| `IBeneficioService`, `IBeneficioColaboradorService`, `LinhaPayrollBeneficio` | `beneficios.interface.ts` |

---

## Permissões RBAC

Adicionadas a `prisma/seed/rbac.ts`:

| Código | Descrição |
|---|---|
| `rh:beneficios:read` | Consultar catálogo de benefícios |
| `rh:beneficios:create` | Criar benefício no catálogo |
| `rh:beneficios:update` | Actualizar benefício no catálogo |
| `rh:beneficios:delete` | Arquivar benefício do catálogo |
| `rh:beneficios:atribuir` | Atribuir/remover benefícios a colaboradores |

---

## UI

Rotas criadas:

| Rota | Tipo | Descrição |
|---|---|---|
| `/rh/beneficios` | Server Component | Catálogo com KPIs + tabela |
| `/rh/beneficios/novo` | Server Component + CC form | Criar benefício |
| `/rh/beneficios/[id]` | Server Component | Detalhe + atribuições activas |
| `/rh/beneficios/atribuir` | Server Component + CC form | Atribuir a colaborador |

---

## Dívidas / gaps

1. **Relatório de custos por departamento**: a query `relatorioCustos` agrega por `tipo` de benefício. Para agregar por departamento, será necessário fazer JOIN com `Colaborador` e `Departamento` — não implementado nesta wave por ausência de requisito explícito de UI (a interface de relatório dedicada pode ser adicionada em wave futura).

2. **Periodicidades não-mensais no payroll**: `linhasPayrollDeBeneficios` ignora TRIMESTRAL/ANUAL/PONTUAL. O agente de payroll (spec 06) deverá implementar a lógica pro-rata (ex: ANUAL ÷ 12, TRIMESTRAL ÷ 3) ao consumir o contrato.

3. **Combobox de colaboradores na UI de atribuição**: a página `/rh/beneficios/atribuir` aceita o ID directamente (campo de texto) em vez de um Combobox de pesquisa. O Combobox server-side pode ser adicionado em wave futura quando o componente `ComboboxColaboradores` estiver disponível.

4. **Página `/rh/beneficios/[id]/editar`**: referenciada no botão "Editar" do detalhe mas a rota não existe ainda — deve ser criada como extensão do formulário de criação.
