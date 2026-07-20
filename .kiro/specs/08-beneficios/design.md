# Design: Benefícios

## Âmbito

Módulo greenfield no WS E (Pessoas), auto-contido, com um ponto de integração:
alimentar linhas de payroll no processamento da folha (spec 06). Se o spec 06 ainda
não estiver entregue, a integração fica atrás de uma interface e é ligada quando o
payroll existir (mesmo padrão contratos-primeiro das Waves 1–2).

## Novos modelos (`prisma/schema/pessoas-projetos.prisma`)

```prisma
enum TipoBeneficio { SEGURO_SAUDE SEGURO_VIDA SUBSIDIO_ALIMENTACAO SUBSIDIO_TRANSPORTE
  SUBSIDIO_HABITACAO SUBSIDIO_COMUNICACOES PLANO_PENSOES OUTRO }
enum PeriodicidadeBeneficio { MENSAL TRIMESTRAL ANUAL PONTUAL }
enum StatusBeneficioColaborador { ACTIVO SUSPENSO TERMINADO }

model Beneficio {
  id String @id @default(cuid())
  tenantId String
  nome String
  tipo TipoBeneficio
  descricao String?
  fornecedor String?
  custoTotal Decimal @db.Decimal(18,2)
  comparticipacaoEmpresa Decimal @db.Decimal(18,2) @default(0)
  descontoColaborador Decimal @db.Decimal(18,2) @default(0)
  periodicidade PeriodicidadeBeneficio
  tributavel Boolean @default(false)
  ativo Boolean @default(true)
  // Elegibilidade opcional
  departamentosElegiveis String[]
  cargosElegiveis String[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  atribuicoes BeneficioColaborador[]
  @@index([tenantId, tipo])
  @@index([tenantId, ativo])
}

model BeneficioColaborador {
  id String @id @default(cuid())
  tenantId String
  beneficioId String
  colaboradorId String
  dataInicio DateTime
  dataFim DateTime?
  comparticipacaoEmpresa Decimal @db.Decimal(18,2)
  descontoColaborador Decimal @db.Decimal(18,2)
  status StatusBeneficioColaborador @default(ACTIVO)
  observacoes String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  beneficio Beneficio @relation(fields: [beneficioId], references: [id])
  colaborador Colaborador @relation(fields: [colaboradorId], references: [id])
  @@index([tenantId, colaboradorId, status])
  @@index([tenantId, beneficioId])
}
```

Acrescentar `Colaborador.beneficios BeneficioColaborador[]`.

## Contrato de serviço (`beneficios.service.ts` — novo)

```ts
BeneficioService: { criar, actualizar, arquivar, listar, obter }
BeneficioColaboradorService: {
  atribuir,   // valida elegibilidade + não-duplicação no período
  terminar,   // dataFim + status TERMINADO
  suspender,
  listarPorColaborador,
}
// Contrato consumido pelo Payroll (spec 06):
export async function linhasPayrollDeBeneficios(colaboradorId, mesRef, ctx)
  : Promise<{ tipo:'PROVENTO'|'DESCONTO'; natureza:string; descricao:string; valor:Decimal; tributavel:boolean }[]>
```

`linhasPayrollDeBeneficios` é o ponto de integração: o `payroll.service`
chama-o dentro da transacção de processamento para compor proventos/descontos.

## Validações / Actions / UI

- `src/lib/validations/beneficios.ts`: `BeneficioSchema`, `AtribuirBeneficioSchema`,
  `FilterBeneficioSchema`.
- `src/server/actions/beneficios.actions.ts` + permissões `rh:beneficios:*`.
- UI (substitui o `EmptyState`):
  ```
  /rh/beneficios/            catálogo/lista
  /rh/beneficios/novo        form
  /rh/beneficios/[id]        detalhe + colaboradores atribuídos
  /rh/beneficios/atribuir    atribuição (colaborador × benefício)
  ```
- Relatório de custos por tipo/departamento por query agregada dedicada.

## Riscos e mitigações

- **Acoplamento ao Payroll:** integração via função de contrato
  (`linhasPayrollDeBeneficios`); benefícios funcionam de forma autónoma mesmo antes
  do spec 06 estar entregue.
- **Duplicação de atribuição:** validação de não-sobreposição de período por
  `[colaboradorId, beneficioId]` antes de criar.
