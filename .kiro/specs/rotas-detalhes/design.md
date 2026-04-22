# Design Document — Página de Detalhes de Rota

## Overview

This document describes the technical design for the route detail page (`/transporte/rotas/[id]`). The page is a read-only detail view that displays all information for a single route record. It follows the existing pattern established by the maintenance detail page (`/transporte/manutencao/[id]/page.tsx`) and reuses the same mock data array already defined in the routes list page.

The page is a Next.js App Router client component that:
- Reads the `id` route parameter via `useParams`
- Looks up the matching record from the static mock data array
- Renders a header, four summary cards, and five tabbed content sections
- Handles the not-found case gracefully

No backend integration is required. All data is sourced from the same in-memory mock array used by the list page.

---

## Architecture

The feature is a single new file:

```
src/app/(dashboard)/transporte/rotas/[id]/page.tsx
```

It fits entirely within the existing Next.js App Router structure. No new routes, layouts, providers, or shared components are introduced. The page imports only from existing libraries already present in the project (`date-fns`, `lucide-react`, `shadcn/ui`).

```mermaid
graph TD
    A[User clicks "Ver Detalhes"] --> B[Next.js navigates to /transporte/rotas/id]
    B --> C[RotaDetalhesPage mounts]
    C --> D[useParams reads id]
    D --> E{Record found in mockData?}
    E -- No --> F[Render not-found state]
    E -- Yes --> G[Render full detail layout]
    G --> H[Header + Summary Cards]
    G --> I[Tabs: 5 sections]
    I --> I1[Informações Gerais]
    I --> I2[Pontos da Rota]
    I --> I3[Entregas]
    I --> I4[Custos]
    I --> I5[Linha do Tempo]
```

---

## Components and Interfaces

### Page Component

**File:** `src/app/(dashboard)/transporte/rotas/[id]/page.tsx`

```typescript
'use client';
export default function RotaDetalhesPage(): JSX.Element
```

The component:
1. Calls `useParams()` to get `id`
2. Calls `useRouter()` for the back button
3. Looks up `rotas.find(r => r.id === id)`
4. Returns the not-found state if no record matches
5. Returns the full detail layout otherwise

### Helper Functions (defined within the file)

These are identical to the helpers in the list page to ensure badge color consistency:

```typescript
function getStatusInfo(status: string): { label: string; icon: JSX.Element; color: string }
function getPrioridadeInfo(prioridade: string): { label: string; color: string }
function getEntregaStatusInfo(status: string): { label: string; color: string }
function getPontoTipoInfo(tipo: string): { label: string; color: string }
function formatMoeda(valor: number): string  // returns "MT X.XXX"
function formatCombustivel(valor: number): string  // returns "X.X L"
```

### Reused shadcn/ui Components

| Component | Usage |
|-----------|-------|
| `Card`, `CardContent`, `CardHeader`, `CardTitle` | Summary cards and tab content panels |
| `Badge` | Status, prioridade, tipo, concluido indicators |
| `Button` | Back button |
| `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger` | Five-tab layout |
| `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` | Waypoints and deliveries tables |

### Lucide Icons Used

`ArrowLeft`, `Route`, `MapPin`, `Navigation`, `Clock`, `CheckCircle`, `XCircle`, `DollarSign`, `Fuel`, `Truck`, `User`, `Package`, `AlertCircle`, `Calendar`, `PlayCircle`, `PauseCircle`, `StopCircle`, `Activity`, `Target`

---

## Data Models

The detail page reuses the interfaces already defined in the list page. They are redeclared in the detail page file (since there is no shared types file in this project).

### Rota

```typescript
interface Rota {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string;
  origem: string;
  destino: string;
  pontos: PontoRota[];
  distanciaTotal: number;
  tempoEstimado: number;
  status: 'planejada' | 'ativa' | 'concluida' | 'cancelada' | 'pausada';
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  veiculoId?: string;
  veiculoMatricula?: string;
  motoristaId?: string;
  motoristaNome?: string;
  dataInicio?: Date;
  dataFim?: Date;
  dataPlanejada: Date;
  custoEstimado: number;
  custoReal?: number;
  combustivelEstimado: number;
  combustivelReal?: number;
  entregas: EntregaRota[];
  observacoes?: string;
  criadoEm: Date;
  criadoPor: string;
}
```

### PontoRota

```typescript
interface PontoRota {
  id: string;
  ordem: number;
  endereco: string;
  latitude?: number;
  longitude?: number;
  tempoParada: number;
  tipo: 'coleta' | 'entrega' | 'parada';
  clienteId?: string;
  clienteNome?: string;
  observacoes?: string;
  concluido: boolean;
  horaChegada?: Date;
  horaSaida?: Date;
}
```

### EntregaRota

```typescript
interface EntregaRota {
  id: string;
  codigo: string;
  clienteNome: string;
  endereco: string;
  status: 'pendente' | 'em_transito' | 'entregue' | 'falhada';
  tentativas: number;
  peso?: number;
  volume?: number;
}
```

### Mock Data

The `rotas` array in the detail page is identical to the one in the list page — four records: RT-001 through RT-004. The array is declared as a module-level constant (outside the component function) to avoid re-creation on every render.

---

## Page Layout

### Not-Found State

```
[ArrowLeft] Voltar
             [AlertCircle icon]
         Rota não encontrada
```

### Full Detail Layout

```
[ArrowLeft]  RT-001 · Rota Centro-Norte
             Armazém Central → Zona Norte

[Status Card]  [Prioridade Card]  [Distância Card]  [Custo Card]

[Informações Gerais | Pontos da Rota | Entregas | Custos | Linha do Tempo]

[Tab content]
```

### Tab: Informações Gerais

Two-column grid of labeled fields:
- Veículo, Motorista, Data Planeada, Data Início, Data Fim, Distância Total, Tempo Estimado, Combustível Estimado, Combustível Real
- Optional text section below: Observações (rendered only when present)

### Tab: Pontos da Rota

Table with columns: Ordem, Endereço, Tipo (badge), Cliente, Tempo de Paragem, Hora Chegada, Hora Saída, Estado (concluído/pendente badge).
Rows are ordered by `ordem` ascending.

### Tab: Entregas

Table with columns: Código, Cliente, Endereço, Status (color-coded badge), Tentativas, Peso, Volume.

### Tab: Custos

Cards with: Custo Estimado, Custo Real (when present), Variação (when `custoReal` is present), Combustível Estimado, Combustível Real (when present).

### Tab: Linha do Tempo

Vertical timeline with steps for: Criado (`criadoEm` + `criadoPor`), Planeado (`dataPlanejada`), Iniciado (`dataInicio`), Concluído (`dataFim`). Steps with absent dates are omitted.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Header always shows codigo, nome, origem, and destino

*For any* route record in the mock data, when the detail page renders for that record's id, the page header area SHALL contain the record's `codigo`, `nome`, `origem`, and `destino`.

**Validates: Requirements 2.1**

---

### Property 2: Summary cards display all four key fields

*For any* route record, when the detail page renders, the four summary cards SHALL display the record's `status`, `prioridade`, `distanciaTotal`, and cost (`custoReal` when present, otherwise `custoEstimado`).

**Validates: Requirements 2.2**

---

### Property 3: Badge colors match the defined color maps

*For any* valid `status` or `prioridade` value, the color class returned by the corresponding helper function (`getStatusInfo`, `getPrioridadeInfo`) SHALL match the color defined in the color map — identical to the color map used in the routes list page.

**Validates: Requirements 2.3**

---

### Property 4: Informações Gerais tab renders all present fields; absent optional fields show placeholder

*For any* route record, the "Informações Gerais" tab SHALL render all required fields (`dataPlanejada`, `distanciaTotal`, `tempoEstimado`, `combustivelEstimado`). For each optional field (`veiculoMatricula`, `motoristaNome`, `dataInicio`, `dataFim`, `combustivelReal`) that is absent from the record, the tab SHALL display the placeholder "—".

**Validates: Requirements 3.1, 3.2**

---

### Property 5: Observações section appears only when present

*For any* route record, the `observacoes` field SHALL appear in a labeled section in the "Informações Gerais" tab if and only if that field is present (non-undefined) in the record.

**Validates: Requirements 3.3**

---

### Property 6: Pontos da Rota tab lists all waypoints with required fields

*For any* route record with N waypoints, the "Pontos da Rota" tab SHALL render exactly N rows, and each row SHALL display the waypoint's `ordem`, `endereco`, `tipo`, `tempoParada`, and `concluido` status indicator.

**Validates: Requirements 4.1, 4.2**

---

### Property 7: Concluido indicator is present iff concluido is true

*For any* `PontoRota`, the visual "concluído" indicator (green badge) SHALL be present if and only if `concluido === true`.

**Validates: Requirements 4.4**

---

### Property 8: Entregas tab lists all deliveries with required fields and correct badges

*For any* route record with N deliveries, the "Entregas" tab SHALL render exactly N rows. Each row SHALL display the delivery's `codigo`, `clienteNome`, `endereco`, `status` (color-coded badge), and `tentativas`. The color class for each `status` badge SHALL match the defined color map.

**Validates: Requirements 5.1, 5.2, 5.3**

---

### Property 9: Monetary values are formatted with MT prefix

*For any* numeric monetary value (`custoEstimado`, `custoReal`), the formatted string SHALL start with "MT " followed by a locale-formatted number.

**Validates: Requirements 6.4**

---

### Property 10: Fuel values are formatted with L suffix

*For any* numeric fuel value (`combustivelEstimado`, `combustivelReal`), the formatted string SHALL end with " L" and the numeric part SHALL be a locale-formatted number with one decimal place.

**Validates: Requirements 6.5**

---

### Property 11: Custos tab shows estimated fields always; real fields only when present

*For any* route record, the "Custos" tab SHALL always display `custoEstimado` and `combustivelEstimado`. When `custoReal` is present, it SHALL also display `custoReal` and the cost variance. When `combustivelReal` is present, it SHALL also display `combustivelReal`.

**Validates: Requirements 6.1, 6.2, 6.3**

---

### Property 12: Timeline shows present date fields and omits absent ones

*For any* route record, the "Linha do Tempo" tab SHALL display a step for each date field that is present (`criadoEm`, `dataPlanejada`, `dataInicio`, `dataFim`) and SHALL omit steps for date fields that are absent.

**Validates: Requirements 7.1, 7.2**

---

### Property 13: Date formatting matches expected pattern

*For any* `Date` value rendered in the timeline, the formatted string SHALL match `dd/MM/yyyy HH:mm` when the value includes a time component, and `dd/MM/yyyy` when only a date is available.

**Validates: Requirements 7.3**

---

### Property 14: Mock data lookup returns correct record for any valid id

*For any* id that exists in the mock data array, the lookup expression `rotas.find(r => r.id === id)` SHALL return the record whose `id` matches exactly.

**Validates: Requirements 8.1, 8.3**

---

## Error Handling

### Not-Found State

When `useParams` returns an `id` that does not match any record in the mock data array, the page renders a minimal not-found layout:

```tsx
<div className="p-6">
  <Button variant="ghost" onClick={() => router.push('/transporte/rotas')}>
    <ArrowLeft className="h-4 w-4 mr-2" />
    Voltar
  </Button>
  <div className="mt-8 text-center">
    <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
    <p className="text-gray-500">Rota não encontrada</p>
  </div>
</div>
```

### Missing Optional Fields

All optional fields (`veiculoMatricula`, `motoristaNome`, `dataInicio`, `dataFim`, `custoReal`, `combustivelReal`, `observacoes`) are handled with conditional rendering:

- Fields displayed in a grid: show "—" placeholder when absent
- Sections that only make sense when the field is present (e.g., Observações, cost variance): rendered conditionally with `{field && <Section />}`
- Timeline steps: rendered conditionally — only steps with a defined date value are shown

### Empty Arrays

- `pontos.length === 0`: renders an empty-state message with a MapPin icon
- `entregas.length === 0`: renders an empty-state message with a Package icon

---

## Testing Strategy

### Unit Tests (Example-Based)

These cover specific scenarios and structural checks:

- **Navigation**: Verify the "Ver Detalhes" link in the list page points to `/transporte/rotas/${id}`
- **Back button**: Verify the back button navigates to `/transporte/rotas`
- **Not-found state**: Render with a non-existent id, verify the not-found message and back button
- **Tab presence**: Verify all five tabs are rendered for a valid record
- **Empty pontos**: Verify empty-state message when `pontos` is `[]`
- **Empty entregas**: Verify empty-state message when `entregas` is `[]`
- **Cost variance**: Verify variance is shown only when `custoReal` is present (RT-003)
- **Observações**: Verify the section appears for RT-004 and is absent for RT-001

### Property-Based Tests

The project uses TypeScript/React. The recommended property-based testing library is **fast-check** (`npm install --save-dev fast-check`), which integrates well with Jest/Vitest and supports TypeScript natively.

Each property test runs a minimum of **100 iterations**.

Tag format: `Feature: rotas-detalhes, Property {N}: {property_text}`

**Property 1** — Header fields  
Generate arbitrary `Rota` records, render the page, assert header contains `codigo`, `nome`, `origem`, and `destino`.  
`// Feature: rotas-detalhes, Property 1: header always shows codigo, nome, origem, and destino`

**Property 2** — Summary cards  
Generate arbitrary records, render the page, assert all four summary card values are present.  
`// Feature: rotas-detalhes, Property 2: summary cards display all four key fields`

**Property 3** — Badge color maps  
Generate arbitrary status/prioridade values from the valid enum sets, assert the returned color class matches the expected map entry.  
`// Feature: rotas-detalhes, Property 3: badge colors match the defined color maps`

**Property 4** — Informações Gerais required fields + placeholder for absent optional fields  
Generate records with random combinations of absent optional fields, render the tab, assert required fields are present and absent optional fields show "—".  
`// Feature: rotas-detalhes, Property 4: informações gerais tab renders all present fields; absent optional fields show placeholder`

**Property 5** — Observações section  
Generate records with random presence/absence of `observacoes`, assert the section appears iff present.  
`// Feature: rotas-detalhes, Property 5: observações section appears only when present`

**Property 6** — Pontos da Rota tab completeness  
Generate records with 0–10 random waypoints, render the tab, assert row count equals waypoint count and all required fields are present.  
`// Feature: rotas-detalhes, Property 6: pontos da rota tab lists all waypoints with required fields`

**Property 7** — Concluido indicator  
Generate waypoints with random `concluido` values, assert indicator presence matches `concluido === true`.  
`// Feature: rotas-detalhes, Property 7: concluido indicator is present iff concluido is true`

**Property 8** — Entregas tab completeness  
Generate records with 0–10 random deliveries, render the tab, assert row count, field presence, and status badge color.  
`// Feature: rotas-detalhes, Property 8: entregas tab lists all deliveries with required fields and correct badges`

**Property 9** — Monetary formatting  
Generate arbitrary non-negative numbers, call `formatMoeda`, assert the result starts with "MT " and the remainder is a locale-formatted number.  
`// Feature: rotas-detalhes, Property 9: monetary values are formatted with MT prefix`

**Property 10** — Fuel formatting  
Generate arbitrary non-negative numbers, call `formatCombustivel`, assert the result ends with " L" and the numeric part has one decimal place.  
`// Feature: rotas-detalhes, Property 10: fuel values are formatted with L suffix`

**Property 11** — Custos tab fields  
Generate records with random presence of `custoReal` and `combustivelReal`, render the tab, assert estimated fields always present and real fields present iff defined.  
`// Feature: rotas-detalhes, Property 11: custos tab shows estimated fields always; real fields only when present`

**Property 12** — Timeline steps  
Generate records with random presence of optional date fields, render the timeline, assert each step appears iff its date field is defined.  
`// Feature: rotas-detalhes, Property 12: timeline shows present date fields and omits absent ones`

**Property 13** — Date formatting  
Generate arbitrary `Date` values, call the date formatting helper, assert the output matches `dd/MM/yyyy HH:mm` or `dd/MM/yyyy`.  
`// Feature: rotas-detalhes, Property 13: date formatting matches expected pattern`

**Property 14** — Mock data lookup  
For each of the four mock record ids, assert `rotas.find(r => r.id === id)` returns the record with that exact id.  
`// Feature: rotas-detalhes, Property 14: mock data lookup returns correct record for any valid id`
