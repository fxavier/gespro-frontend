# Implementation Plan: Route Detail Page

## Overview

Create a single new file `src/app/(dashboard)/transporte/rotas/[id]/page.tsx` — a read-only detail view for a route record. The page reads the `id` route parameter, looks up the matching record from a module-level mock data array, and renders a header, four summary cards, and five tabbed content sections. No backend integration is required.

## Tasks

- [x] 1. Create the page file with TypeScript interfaces and mock data
  - Create `src/app/(dashboard)/transporte/rotas/[id]/page.tsx` with `'use client'` directive
  - Declare the `Rota`, `PontoRota`, and `EntregaRota` TypeScript interfaces (identical to those in the list page)
  - Declare the module-level `rotas` constant array with the four mock records (RT-001 to RT-004), copied exactly from the list page
  - _Requirements: 8.1, 8.2_

- [x] 2. Implement helper functions and the not-found state
  - [x] 2.1 Implement helper functions inside the file
    - Write `getStatusInfo(status)`, `getPrioridadeInfo(prioridade)`, `getEntregaStatusInfo(status)`, `getPontoTipoInfo(tipo)`, `formatMoeda(valor)`, and `formatCombustivel(valor)` with the same color maps as the list page
    - Status colors: planejada=bg-blue-100/text-blue-800, ativa=bg-green-100/text-green-800, pausada=bg-yellow-100/text-yellow-800, concluida=bg-gray-100/text-gray-800, cancelada=bg-red-100/text-red-800
    - Prioridade colors: baixa=bg-gray-100/text-gray-800, media=bg-blue-100/text-blue-800, alta=bg-orange-100/text-orange-800, urgente=bg-red-100/text-red-800
    - Entrega status colors: entregue=bg-green-100/text-green-800, em_transito=bg-blue-100/text-blue-800, pendente=bg-gray-100/text-gray-800, falhada=bg-red-100/text-red-800
    - Ponto tipo colors: coleta=bg-purple-100/text-purple-800, entrega=bg-blue-100/text-blue-800, parada=bg-gray-100/text-gray-800
    - `formatMoeda`: returns `"MT " + valor.toLocaleString('pt-MZ')`
    - `formatCombustivel`: returns `valor.toFixed(1) + " L"`
    - _Requirements: 2.3, 5.3, 6.4, 6.5_

  - [ ]* 2.2 Write property test for helper functions (Property 3, Property 9, and Property 10)
    - **Property 3: badge colors match the defined color maps**
    - **Validates: Requirements 2.3**
    - **Property 9: monetary values are formatted with MT prefix**
    - **Validates: Requirements 6.4**
    - **Property 10: fuel values are formatted with L suffix**
    - **Validates: Requirements 6.5**
    - Use `fast-check` to generate arbitrary valid enum values and assert returned color classes match the expected map entries; generate arbitrary non-negative numbers and assert `formatMoeda` starts with "MT " and `formatCombustivel` ends with " L"
    - Tag: `// Feature: rotas-detalhes, Property 3: badge colors match the defined color maps`
    - Tag: `// Feature: rotas-detalhes, Property 9: monetary values are formatted with MT prefix`
    - Tag: `// Feature: rotas-detalhes, Property 10: fuel values are formatted with L suffix`

  - [x] 2.3 Implement the `RotaDetalhesPage` component shell with `useParams`, `useRouter`, mock data lookup, and not-found state
    - Call `useParams()` to read `id` and `useRouter()` for navigation
    - Look up the record with `rotas.find(r => r.id === id)`
    - Render the not-found layout (ArrowLeft back button + AlertCircle icon + "Rota não encontrada") when no record matches
    - _Requirements: 1.2, 1.3, 8.1, 8.3_

  - [ ]* 2.4 Write property test for mock data lookup (Property 14)
    - **Property 14: mock data lookup returns correct record for any valid id**
    - **Validates: Requirements 8.1, 8.3**
    - For each of the four mock record ids, assert `rotas.find(r => r.id === id)` returns the record with that exact id
    - Tag: `// Feature: rotas-detalhes, Property 14: mock data lookup returns correct record for any valid id`

- [x] 3. Implement the page header and summary cards
  - [x] 3.1 Implement the page header
    - Render an ArrowLeft Button that calls `router.push('/transporte/rotas')`
    - Display `codigo` and `nome` as the title (e.g., "RT-001 · Rota Centro-Norte")
    - Display `origem → destino` as the subtitle
    - _Requirements: 1.2, 2.1_

  - [x] 3.2 Implement the four summary cards
    - Render four `Card` components showing:
      - Status: color-coded Badge with icon from `getStatusInfo`
      - Prioridade: Badge from `getPrioridadeInfo`
      - Distância Total: `distanciaTotal` formatted as "X.X km"
      - Custo: `custoReal` when present, otherwise `custoEstimado`, formatted with `formatMoeda`
    - _Requirements: 2.2, 2.3_

  - [ ]* 3.3 Write property tests for header and summary cards (Property 1 and Property 2)
    - **Property 1: header always shows codigo, nome, origem, and destino**
    - **Validates: Requirements 2.1**
    - **Property 2: summary cards display all four key fields**
    - **Validates: Requirements 2.2**
    - Use `fast-check` to generate arbitrary `Rota` records, render the page, and assert the header contains `codigo`, `nome`, `origem`, and `destino`, and that all four summary card values are present
    - Tag: `// Feature: rotas-detalhes, Property 1: header always shows codigo, nome, origem, and destino`
    - Tag: `// Feature: rotas-detalhes, Property 2: summary cards display all four key fields`

- [x] 4. Implement the Tabs shell and the "Informações Gerais" tab
  - [x] 4.1 Implement the Tabs shell with all five tab triggers
    - Render `Tabs` with `TabsList` containing five `TabsTrigger` items: "Informações Gerais", "Pontos da Rota", "Entregas", "Custos", "Linha do Tempo"
    - _Requirements: 3.1, 4.1, 5.1, 6.1, 7.1_

  - [x] 4.2 Implement the "Informações Gerais" tab content
    - Render a two-column grid with labeled fields: Veículo (`veiculoMatricula`), Motorista (`motoristaNome`), Data Planeada (`dataPlanejada`), Data Início (`dataInicio`), Data Fim (`dataFim`), Distância Total (`distanciaTotal`), Tempo Estimado (`tempoEstimado`), Combustível Estimado (`combustivelEstimado`), Combustível Real (`combustivelReal`)
    - Show "—" placeholder for absent optional fields (`veiculoMatricula`, `motoristaNome`, `dataInicio`, `dataFim`, `combustivelReal`)
    - Conditionally render a labeled "Observações" section when `observacoes` is present
    - Use `date-fns` `format()` with `pt` locale for date fields
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 4.3 Write property tests for "Informações Gerais" tab (Property 4 and Property 5)
    - **Property 4: informações gerais tab renders all present fields; absent optional fields show placeholder**
    - **Validates: Requirements 3.1, 3.2**
    - **Property 5: observações section appears only when present**
    - **Validates: Requirements 3.3**
    - Use `fast-check` to generate records with random combinations of absent optional fields and random presence of `observacoes`; assert required fields are present, absent optional fields show "—", and the observações section appears iff defined
    - Tag: `// Feature: rotas-detalhes, Property 4: informações gerais tab renders all present fields; absent optional fields show placeholder`
    - Tag: `// Feature: rotas-detalhes, Property 5: observações section appears only when present`

- [x] 5. Implement the "Pontos da Rota" tab
  - [x] 5.1 Implement the "Pontos da Rota" tab content
    - Render a `Table` with columns: Ordem, Endereço, Tipo (badge from `getPontoTipoInfo`), Cliente, Tempo de Paragem, Hora Chegada, Hora Saída, Estado
    - Sort rows by `ordem` ascending
    - For each `PontoRota`, display all required fields; show "—" for absent `horaChegada`, `horaSaida`, and `clienteNome`; show a green Badge when `concluido === true` and a gray Badge when `false`
    - Render an empty-state message with a MapPin icon when `pontos` is empty
    - Format `horaChegada` and `horaSaida` with `date-fns` `format()` using `HH:mm` pattern
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 5.2 Write property tests for "Pontos da Rota" tab (Property 6 and Property 7)
    - **Property 6: pontos da rota tab lists all waypoints with required fields**
    - **Validates: Requirements 4.1, 4.2**
    - **Property 7: concluido indicator is present iff concluido is true**
    - **Validates: Requirements 4.4**
    - Use `fast-check` to generate records with 0–10 random waypoints; assert row count equals waypoint count, all required fields are present, and the concluído indicator appears iff `concluido === true`
    - Tag: `// Feature: rotas-detalhes, Property 6: pontos da rota tab lists all waypoints with required fields`
    - Tag: `// Feature: rotas-detalhes, Property 7: concluido indicator is present iff concluido is true`

- [x] 6. Implement the "Entregas" tab
  - [x] 6.1 Implement the "Entregas" tab content
    - Render a `Table` with columns: Código, Cliente, Endereço, Status (color-coded badge from `getEntregaStatusInfo`), Tentativas, Peso, Volume
    - For each `EntregaRota`, display all required fields; show "—" for absent `peso` and `volume`
    - Render an empty-state message with a Package icon when `entregas` is empty
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 6.2 Write property test for "Entregas" tab (Property 8)
    - **Property 8: entregas tab lists all deliveries with required fields and correct badges**
    - **Validates: Requirements 5.1, 5.2, 5.3**
    - Use `fast-check` to generate records with 0–10 random deliveries; assert row count, field presence, and status badge color matches the defined color map
    - Tag: `// Feature: rotas-detalhes, Property 8: entregas tab lists all deliveries with required fields and correct badges`

- [x] 7. Implement the "Custos" tab
  - [x] 7.1 Implement the "Custos" tab content
    - Render cards for: Custo Estimado (`custoEstimado` formatted with `formatMoeda`), Custo Real (when `custoReal` is present, formatted with `formatMoeda`), Variação (when `custoReal` is present: `custoReal - custoEstimado`, formatted with `formatMoeda` and a color indicator — green if negative/savings, red if positive/overrun)
    - Render fuel cards for: Combustível Estimado (`combustivelEstimado` formatted with `formatCombustivel`), Combustível Real (when `combustivelReal` is present, formatted with `formatCombustivel`)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 7.2 Write property test for "Custos" tab (Property 11)
    - **Property 11: custos tab shows estimated fields always; real fields only when present**
    - **Validates: Requirements 6.1, 6.2, 6.3**
    - Use `fast-check` to generate records with random presence of `custoReal` and `combustivelReal`; assert estimated fields always present and real fields present iff defined
    - Tag: `// Feature: rotas-detalhes, Property 11: custos tab shows estimated fields always; real fields only when present`

- [x] 8. Implement the "Linha do Tempo" tab
  - [x] 8.1 Implement the "Linha do Tempo" tab content
    - Render a vertical timeline with steps for: Criado (`criadoEm` + `criadoPor`), Planeado (`dataPlanejada`), Iniciado (`dataInicio`), Concluído (`dataFim`)
    - Omit steps whose date field is absent from the record
    - Format dates with `dd/MM/yyyy HH:mm` when a time component is meaningful, and `dd/MM/yyyy` for date-only values, using `date-fns` `format()` with `pt` locale
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 8.2 Write property tests for "Linha do Tempo" tab (Property 12 and Property 13)
    - **Property 12: timeline shows present date fields and omits absent ones**
    - **Validates: Requirements 7.1, 7.2**
    - **Property 13: date formatting matches expected pattern**
    - **Validates: Requirements 7.3**
    - Use `fast-check` to generate records with random presence of optional date fields; assert each step appears iff its date field is defined; generate arbitrary `Date` values and assert the formatted string matches `dd/MM/yyyy HH:mm` or `dd/MM/yyyy`
    - Tag: `// Feature: rotas-detalhes, Property 12: timeline shows present date fields and omits absent ones`
    - Tag: `// Feature: rotas-detalhes, Property 13: date formatting matches expected pattern`

- [ ] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests use `fast-check` and validate universal correctness properties (minimum 100 iterations each)
- Unit tests validate specific examples and edge cases
- The page is a single file — no new shared components, routes, or providers are introduced
- The "Ver Detalhes" link in the routes list page already points to `/transporte/rotas/${rota.id}` — no changes needed there
