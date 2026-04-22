# Design Document — Página de Detalhes de Manutenção

## Overview

This document describes the technical design for the maintenance detail page (`/transporte/manutencao/[id]`). The page is a read-only detail view that displays all information for a single maintenance record. It follows the existing pattern established by the client detail page (`/clientes/[id]/page.tsx`) and reuses the same mock data array already defined in the maintenance list page.

The page is a Next.js App Router client component that:
- Reads the `id` route parameter via `useParams`
- Looks up the matching record from the static mock data array
- Renders a header, four summary cards, and six tabbed content sections
- Handles the not-found case gracefully

No backend integration is required. All data is sourced from the same in-memory mock array used by the list page.

---

## Architecture

The feature is a single new file:

```
src/app/(dashboard)/transporte/manutencao/[id]/page.tsx
```

It fits entirely within the existing Next.js App Router structure. No new routes, layouts, providers, or shared components are introduced. The page imports only from existing libraries already present in the project (`date-fns`, `lucide-react`, `shadcn/ui`).

```mermaid
graph TD
    A[User clicks "Ver Detalhes"] --> B[Next.js navigates to /transporte/manutencao/id]
    B --> C[ManutencaoDetalhesPage mounts]
    C --> D[useParams reads id]
    D --> E{Record found in mockData?}
    E -- No --> F[Render not-found state]
    E -- Yes --> G[Render full detail layout]
    G --> H[Header + Summary Cards]
    G --> I[Tabs: 6 sections]
    I --> I1[Informações Gerais]
    I --> I2[Serviços]
    I --> I3[Peças]
    I --> I4[Custos]
    I --> I5[Linha do Tempo]
    I --> I6[Próxima Manutenção]
```

---

## Components and Interfaces

### Page Component

**File:** `src/app/(dashboard)/transporte/manutencao/[id]/page.tsx`

```typescript
'use client';
export default function ManutencaoDetalhesPage(): JSX.Element
```

The component:
1. Calls `useParams()` to get `id`
2. Calls `useRouter()` for the back button
3. Looks up `manutencoes.find(m => m.id === id)`
4. Returns the not-found state if no record matches
5. Returns the full detail layout otherwise

### Helper Functions (defined within the file)

These are identical to the helpers in the list page to ensure badge color consistency:

```typescript
function getStatusInfo(status: string): { label: string; icon: JSX.Element; color: string }
function getTipoInfo(tipo: string): { label: string; color: string }
function getPrioridadeInfo(prioridade: string): { label: string; color: string }
function getPecaStatusInfo(status: string): { label: string; color: string }
function formatMoeda(valor: number): string  // returns "MT X.XXX"
```

### Reused shadcn/ui Components

| Component | Usage |
|-----------|-------|
| `Card`, `CardContent`, `CardHeader`, `CardTitle` | Summary cards and tab content panels |
| `Badge` | Status, tipo, prioridade, part status, concluido indicators |
| `Button` | Back button |
| `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger` | Six-tab layout |
| `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` | Services and parts tables |

### Lucide Icons Used

`ArrowLeft`, `Wrench`, `Truck`, `Calendar`, `Clock`, `CheckCircle`, `XCircle`, `DollarSign`, `Package`, `User`, `Phone`, `MapPin`, `AlertCircle`, `Settings`, `FileText`, `Activity`

---

## Data Models

The detail page reuses the interfaces already defined in the list page. They are redeclared in the detail page file (since there is no shared types file in this project).

### Manutencao

```typescript
interface Manutencao {
  id: string;
  codigo: string;
  veiculoId: string;
  veiculoMatricula: string;
  veiculoModelo: string;
  tipo: 'preventiva' | 'corretiva' | 'preditiva' | 'emergencia';
  status: 'agendada' | 'em_andamento' | 'concluida' | 'cancelada' | 'pendente_pecas';
  prioridade: 'baixa' | 'media' | 'alta' | 'critica';
  dataAgendada: Date;
  dataInicio?: Date;
  dataConclusao?: Date;
  kmAtual: number;
  kmProxima?: number;
  oficina: string;
  mecanicoResponsavel?: string;
  telefoneOficina?: string;
  servicos: ServicoManutencao[];
  pecas: PecaManutencao[];
  custoMaoObra: number;
  custoPecas: number;
  custoTotal: number;
  tempoEstimado: number;
  tempoReal?: number;
  observacoes?: string;
  problemaRelatado?: string;
  diagnostico?: string;
  recomendacoes?: string;
  garantia?: { prazo: number; descricao: string };
  proximaManutencao?: { km: number; data: Date; tipo: string };
  criadoEm: Date;
  criadoPor: string;
  atualizadoEm?: Date;
}
```

### ServicoManutencao

```typescript
interface ServicoManutencao {
  id: string;
  nome: string;
  descricao: string;
  categoria: 'motor' | 'freios' | 'suspensao' | 'eletrica' | 'carroceria' | 'outro';
  custo: number;
  tempo: number;
  concluido: boolean;
  observacoes?: string;
}
```

### PecaManutencao

```typescript
interface PecaManutencao {
  id: string;
  nome: string;
  codigo: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  fornecedor?: string;
  garantia?: number;
  original: boolean;
  status: 'solicitada' | 'em_transito' | 'disponivel' | 'instalada';
}
```

### Mock Data

The `manutencoes` array in the detail page is identical to the one in the list page — four records: MAN-001 through MAN-004. The array is declared as a module-level constant (outside the component function) to avoid re-creation on every render.

---

## Page Layout

### Not-Found State

```
[ArrowLeft] Voltar
             [AlertCircle icon]
         Manutenção não encontrada
```

### Full Detail Layout

```
[ArrowLeft]  MAN-001 · ABC-1234
             Toyota Hilux

[Status Card]  [Tipo Card]  [Prioridade Card]  [Custo Total Card]

[Informações Gerais | Serviços | Peças | Custos | Linha do Tempo | Próxima Manutenção]

[Tab content]
```

### Tab: Informações Gerais

Two-column grid of labeled fields:
- Veículo, Matrícula, KM Atual, KM Próxima, Data Agendada, Data Início, Data Conclusão, Oficina, Mecânico, Telefone Oficina
- Optional text sections below: Problema Relatado, Diagnóstico, Recomendações, Observações

### Tab: Serviços

Table with columns: Nome, Categoria, Descrição, Custo, Tempo, Status (concluído/pendente badge).

### Tab: Peças

Table with columns: Nome, Código, Qtd, Valor Unit., Valor Total, Fornecedor, Original (badge), Garantia, Status (color-coded badge).

### Tab: Custos

Three highlighted cards (Mão de Obra, Peças, Total) + time fields (Estimado / Real) + optional Garantia section.

### Tab: Linha do Tempo

Vertical timeline with steps for: Criado, Agendado, Iniciado, Concluído, Atualizado. Steps with absent dates are omitted.

### Tab: Próxima Manutenção

If `proximaManutencao` is present: shows KM, Data, Tipo in a card.
If absent: shows an empty-state message with a "Agendar" prompt button.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Header always shows codigo and veiculoMatricula

*For any* maintenance record in the mock data, when the detail page renders for that record's id, the page header area SHALL contain both the record's `codigo` and `veiculoMatricula`.

**Validates: Requirements 2.1**

---

### Property 2: Summary cards display all four key fields

*For any* maintenance record, when the detail page renders, the four summary cards SHALL display the record's `status`, `tipo`, `prioridade`, and `custoTotal`.

**Validates: Requirements 2.2**

---

### Property 3: Badge colors match the defined color maps

*For any* valid `status`, `tipo`, or `prioridade` value, the color class returned by the corresponding helper function (`getStatusInfo`, `getTipoInfo`, `getPrioridadeInfo`) SHALL match the color defined in the color map — identical to the color map used in the maintenance list page.

**Validates: Requirements 2.3**

---

### Property 4: Informações Gerais tab renders all present fields; absent optional fields show placeholder

*For any* maintenance record, the "Informações Gerais" tab SHALL render all required fields (`veiculoModelo`, `veiculoMatricula`, `kmAtual`, `dataAgendada`, `oficina`). For each optional field (`dataInicio`, `dataConclusao`, `mecanicoResponsavel`, `telefoneOficina`, `kmProxima`) that is absent from the record, the tab SHALL display the placeholder "—".

**Validates: Requirements 3.1, 3.2**

---

### Property 5: Optional text sections appear only when present

*For any* maintenance record, each of `problemaRelatado`, `diagnostico`, `recomendacoes`, and `observacoes` SHALL appear in a labeled section in the "Informações Gerais" tab if and only if that field is present (non-undefined) in the record.

**Validates: Requirements 3.3**

---

### Property 6: Serviços tab lists all services with required fields

*For any* maintenance record with N services, the "Serviços" tab SHALL render exactly N rows, and each row SHALL display the service's `nome`, `categoria`, `descricao`, `custo`, `tempo`, and `concluido` status indicator.

**Validates: Requirements 4.1, 4.2**

---

### Property 7: Concluido indicator is present iff concluido is true

*For any* `ServicoManutencao`, the visual "concluído" indicator (green badge or checkmark) SHALL be present if and only if `concluido === true`.

**Validates: Requirements 4.3**

---

### Property 8: Peças tab lists all parts with required fields and correct badges

*For any* maintenance record with N parts, the "Peças" tab SHALL render exactly N rows. Each row SHALL display the part's `nome`, `codigo`, `quantidade`, `valorUnitario`, `valorTotal`, `original` badge (present iff `original === true`), and a color-coded `status` badge matching the defined color map.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

---

### Property 9: Monetary values are formatted with MT prefix

*For any* numeric monetary value (custoMaoObra, custoPecas, custoTotal, service custo, part valorUnitario, part valorTotal), the formatted string SHALL start with "MT " followed by a locale-formatted number.

**Validates: Requirements 6.4**

---

### Property 10: Custos tab shows all cost and time fields; garantia shown only when present

*For any* maintenance record, the "Custos" tab SHALL display `custoMaoObra`, `custoPecas`, `custoTotal`, and `tempoEstimado`. When `tempoReal` is present, it SHALL also be displayed. When `garantia` is present, both `prazo` and `descricao` SHALL be displayed; when absent, the garantia section SHALL not appear.

**Validates: Requirements 6.1, 6.2, 6.3**

---

### Property 11: Timeline shows present date fields and omits absent ones

*For any* maintenance record, the "Linha do Tempo" tab SHALL display a step for each date field that is present (`criadoEm`, `dataAgendada`, `dataInicio`, `dataConclusao`, `atualizadoEm`) and SHALL omit steps for date fields that are absent.

**Validates: Requirements 7.1, 7.2**

---

### Property 12: Date formatting matches expected pattern

*For any* `Date` value rendered in the timeline, the formatted string SHALL match `dd/MM/yyyy HH:mm` when the value includes a time component, and `dd/MM/yyyy` when only a date is available.

**Validates: Requirements 7.3**

---

### Property 13: Próxima Manutenção tab shows km, data, tipo when present

*For any* maintenance record where `proximaManutencao` is present, the "Próxima Manutenção" tab SHALL display the `km`, `data`, and `tipo` values from that object.

**Validates: Requirements 8.2**

---

### Property 14: Mock data lookup returns correct record for any valid id

*For any* id that exists in the mock data array, the lookup expression `manutencoes.find(m => m.id === id)` SHALL return the record whose `id` matches exactly.

**Validates: Requirements 9.1, 9.3**

---

## Error Handling

### Not-Found State

When `useParams` returns an `id` that does not match any record in the mock data array, the page renders a minimal not-found layout:

```tsx
<div className="p-6">
  <Button variant="ghost" onClick={() => router.push('/transporte/manutencao')}>
    <ArrowLeft className="h-4 w-4 mr-2" />
    Voltar
  </Button>
  <div className="mt-8 text-center">
    <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
    <p className="text-gray-500">Manutenção não encontrada</p>
  </div>
</div>
```

This matches the pattern used in the client detail page.

### Missing Optional Fields

All optional fields (`dataInicio`, `dataConclusao`, `mecanicoResponsavel`, `telefoneOficina`, `kmProxima`, `tempoReal`, `garantia`, `proximaManutencao`, `problemaRelatado`, `diagnostico`, `recomendacoes`, `observacoes`, `atualizadoEm`) are handled with conditional rendering:

- Fields displayed in a grid: show "—" placeholder when absent
- Sections that only make sense when the field is present (e.g., Garantia, Próxima Manutenção, optional text blocks): rendered conditionally with `{field && <Section />}`
- Timeline steps: rendered conditionally — only steps with a defined date value are shown

### Empty Arrays

- `servicos.length === 0`: renders an empty-state message with a Wrench icon
- `pecas.length === 0`: renders an empty-state message with a Package icon

---

## Testing Strategy

### Unit Tests (Example-Based)

These cover specific scenarios and structural checks:

- **Navigation**: Verify the "Ver Detalhes" link in the list page points to `/transporte/manutencao/${id}`
- **Back button**: Verify the back button navigates to `/transporte/manutencao`
- **Not-found state**: Render with a non-existent id, verify the not-found message and back button
- **Tab presence**: Verify all six tabs are rendered for a valid record
- **Próxima Manutenção tab exists**: Verify the tab is present regardless of record content
- **Empty servicos**: Verify empty-state message when `servicos` is `[]`
- **Empty pecas**: Verify empty-state message when `pecas` is `[]`
- **No próxima manutenção**: Verify the scheduling prompt when `proximaManutencao` is absent

### Property-Based Tests

The project uses TypeScript/React. The recommended property-based testing library is **fast-check** (`npm install --save-dev fast-check`), which integrates well with Jest/Vitest and supports TypeScript natively.

Each property test runs a minimum of **100 iterations**.

Tag format: `Feature: manutencao-detalhes, Property {N}: {property_text}`

**Property 1** — Header fields  
Generate arbitrary `Manutencao` records, render the page, assert header contains `codigo` and `veiculoMatricula`.  
`// Feature: manutencao-detalhes, Property 1: header always shows codigo and veiculoMatricula`

**Property 2** — Summary cards  
Generate arbitrary records, render the page, assert all four summary card values are present.  
`// Feature: manutencao-detalhes, Property 2: summary cards display all four key fields`

**Property 3** — Badge color maps  
Generate arbitrary status/tipo/prioridade values from the valid enum sets, assert the returned color class matches the expected map entry.  
`// Feature: manutencao-detalhes, Property 3: badge colors match the defined color maps`

**Property 4** — Informações Gerais required fields + placeholder for absent optional fields  
Generate records with random combinations of absent optional fields, render the tab, assert required fields are present and absent optional fields show "—".  
`// Feature: manutencao-detalhes, Property 4: informações gerais tab renders all present fields; absent optional fields show placeholder`

**Property 5** — Optional text sections  
Generate records with random presence/absence of `problemaRelatado`, `diagnostico`, `recomendacoes`, `observacoes`, assert each appears iff present.  
`// Feature: manutencao-detalhes, Property 5: optional text sections appear only when present`

**Property 6** — Serviços tab completeness  
Generate records with 0–10 random services, render the tab, assert row count equals service count and all fields are present.  
`// Feature: manutencao-detalhes, Property 6: serviços tab lists all services with required fields`

**Property 7** — Concluido indicator  
Generate services with random `concluido` values, assert indicator presence matches `concluido === true`.  
`// Feature: manutencao-detalhes, Property 7: concluido indicator is present iff concluido is true`

**Property 8** — Peças tab completeness  
Generate records with 0–10 random parts, render the tab, assert row count, field presence, original badge, and status badge color.  
`// Feature: manutencao-detalhes, Property 8: peças tab lists all parts with required fields and correct badges`

**Property 9** — Monetary formatting  
Generate arbitrary non-negative numbers, call `formatMoeda`, assert the result starts with "MT " and the remainder is a locale-formatted number.  
`// Feature: manutencao-detalhes, Property 9: monetary values are formatted with MT prefix`

**Property 10** — Custos tab fields  
Generate records with random presence of `tempoReal` and `garantia`, render the tab, assert required fields always present and optional fields present iff defined.  
`// Feature: manutencao-detalhes, Property 10: custos tab shows all cost and time fields; garantia shown only when present`

**Property 11** — Timeline steps  
Generate records with random presence of optional date fields, render the timeline, assert each step appears iff its date field is defined.  
`// Feature: manutencao-detalhes, Property 11: timeline shows present date fields and omits absent ones`

**Property 12** — Date formatting  
Generate arbitrary `Date` values, call the date formatting helper, assert the output matches `dd/MM/yyyy HH:mm` or `dd/MM/yyyy`.  
`// Feature: manutencao-detalhes, Property 12: date formatting matches expected pattern`

**Property 13** — Próxima Manutenção fields  
Generate records with `proximaManutencao` present, render the tab, assert `km`, `data`, and `tipo` are displayed.  
`// Feature: manutencao-detalhes, Property 13: próxima manutenção tab shows km, data, tipo when present`

**Property 14** — Mock data lookup  
For each of the four mock record ids, assert `manutencoes.find(m => m.id === id)` returns the record with that exact id.  
`// Feature: manutencao-detalhes, Property 14: mock data lookup returns correct record for any valid id`
