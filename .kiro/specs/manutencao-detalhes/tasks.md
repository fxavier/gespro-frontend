# Implementation Plan: Maintenance Detail Page

## Overview

Create a single new file `src/app/(dashboard)/transporte/manutencao/[id]/page.tsx` — a read-only detail view for a maintenance record. The page reads the `id` route parameter, looks up the matching record from a module-level mock data array, and renders a header, four summary cards, and six tabbed content sections. No backend integration is required.

## Tasks

- [x] 1. Create the page file with TypeScript interfaces and mock data
  - Create `src/app/(dashboard)/transporte/manutencao/[id]/page.tsx` with `'use client'` directive
  - Declare the `Manutencao`, `ServicoManutencao`, and `PecaManutencao` TypeScript interfaces (identical to those in the list page)
  - Declare the module-level `manutencoes` constant array with the four mock records (MAN-001 to MAN-004), copied exactly from the list page
  - _Requirements: 9.1, 9.2_

- [x] 2. Implement helper functions and the not-found state
  - [x] 2.1 Implement helper functions inside the file
    - Write `getStatusInfo(status)`, `getTipoInfo(tipo)`, `getPrioridadeInfo(prioridade)`, `getPecaStatusInfo(status)`, and `formatMoeda(valor)` with the same color maps as the list page
    - _Requirements: 2.3, 5.4, 6.4_

  - [ ]* 2.2 Write property test for helper functions (Property 3 and Property 9)
    - **Property 3: badge colors match the defined color maps**
    - **Validates: Requirements 2.3**
    - **Property 9: monetary values are formatted with MT prefix**
    - **Validates: Requirements 6.4**
    - Use `fast-check` to generate arbitrary valid enum values and assert returned color classes match the expected map entries; generate arbitrary non-negative numbers and assert `formatMoeda` output starts with "MT "
    - Tag: `// Feature: manutencao-detalhes, Property 3: badge colors match the defined color maps`
    - Tag: `// Feature: manutencao-detalhes, Property 9: monetary values are formatted with MT prefix`

  - [x] 2.3 Implement the `ManutencaoDetalhesPage` component shell with `useParams`, `useRouter`, mock data lookup, and not-found state
    - Call `useParams()` to read `id` and `useRouter()` for navigation
    - Look up the record with `manutencoes.find(m => m.id === id)`
    - Render the not-found layout (ArrowLeft back button + AlertCircle icon + "Manutenção não encontrada") when no record matches
    - _Requirements: 1.2, 1.3, 9.1, 9.3_

  - [ ]* 2.4 Write property test for mock data lookup (Property 14)
    - **Property 14: mock data lookup returns correct record for any valid id**
    - **Validates: Requirements 9.1, 9.3**
    - For each of the four mock record ids, assert `manutencoes.find(m => m.id === id)` returns the record with that exact id
    - Tag: `// Feature: manutencao-detalhes, Property 14: mock data lookup returns correct record for any valid id`

- [x] 3. Implement the page header and summary cards
  - [x] 3.1 Implement the page header
    - Render an ArrowLeft Button that calls `router.push('/transporte/manutencao')`
    - Display `codigo` and `veiculoMatricula` as the title, with `veiculoModelo` as subtitle
    - _Requirements: 1.1, 1.2, 2.1_

  - [x] 3.2 Implement the four summary cards
    - Render four `Card` components showing: `status` (with color-coded Badge and icon from `getStatusInfo`), `tipo` (Badge from `getTipoInfo`), `prioridade` (Badge from `getPrioridadeInfo`), and `custoTotal` (formatted with `formatMoeda`)
    - _Requirements: 2.2, 2.3_

  - [ ]* 3.3 Write property tests for header and summary cards (Property 1 and Property 2)
    - **Property 1: header always shows codigo and veiculoMatricula**
    - **Validates: Requirements 2.1**
    - **Property 2: summary cards display all four key fields**
    - **Validates: Requirements 2.2**
    - Use `fast-check` to generate arbitrary `Manutencao` records, render the page, and assert the header contains `codigo` and `veiculoMatricula`, and that all four summary card values are present
    - Tag: `// Feature: manutencao-detalhes, Property 1: header always shows codigo and veiculoMatricula`
    - Tag: `// Feature: manutencao-detalhes, Property 2: summary cards display all four key fields`

- [x] 4. Implement the Tabs shell and the "Informações Gerais" tab
  - [x] 4.1 Implement the Tabs shell with all six tab triggers
    - Render `Tabs` with `TabsList` containing six `TabsTrigger` items: "Informações Gerais", "Serviços", "Peças", "Custos", "Linha do Tempo", "Próxima Manutenção"
    - _Requirements: 3.1, 4.1, 5.1, 6.1, 7.1, 8.1_

  - [x] 4.2 Implement the "Informações Gerais" tab content
    - Render a two-column grid with labeled fields: `veiculoModelo`, `veiculoMatricula`, `kmAtual`, `kmProxima`, `dataAgendada`, `dataInicio`, `dataConclusao`, `oficina`, `mecanicoResponsavel`, `telefoneOficina`
    - Show "—" placeholder for absent optional fields (`dataInicio`, `dataConclusao`, `mecanicoResponsavel`, `telefoneOficina`, `kmProxima`)
    - Conditionally render labeled sections for `problemaRelatado`, `diagnostico`, `recomendacoes`, and `observacoes` when present
    - Use `date-fns` `format()` with `pt` locale for date fields
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 4.3 Write property tests for "Informações Gerais" tab (Property 4 and Property 5)
    - **Property 4: informações gerais tab renders all present fields; absent optional fields show placeholder**
    - **Validates: Requirements 3.1, 3.2**
    - **Property 5: optional text sections appear only when present**
    - **Validates: Requirements 3.3**
    - Use `fast-check` to generate records with random combinations of absent optional fields and random presence of text sections; assert required fields are present, absent optional fields show "—", and text sections appear iff defined
    - Tag: `// Feature: manutencao-detalhes, Property 4: informações gerais tab renders all present fields; absent optional fields show placeholder`
    - Tag: `// Feature: manutencao-detalhes, Property 5: optional text sections appear only when present`

- [x] 5. Implement the "Serviços" tab
  - [x] 5.1 Implement the "Serviços" tab content
    - Render a `Table` with columns: Nome, Categoria, Descrição, Custo, Tempo, Status
    - For each `ServicoManutencao`, display all required fields; show a green Badge/checkmark when `concluido === true` and a distinct indicator when `false`
    - Render an empty-state message with a Wrench icon when `servicos` is empty
    - Format `custo` with `formatMoeda`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 5.2 Write property tests for "Serviços" tab (Property 6 and Property 7)
    - **Property 6: serviços tab lists all services with required fields**
    - **Validates: Requirements 4.1, 4.2**
    - **Property 7: concluido indicator is present iff concluido is true**
    - **Validates: Requirements 4.3**
    - Use `fast-check` to generate records with 0–10 random services; assert row count equals service count, all fields are present, and the concluído indicator appears iff `concluido === true`
    - Tag: `// Feature: manutencao-detalhes, Property 6: serviços tab lists all services with required fields`
    - Tag: `// Feature: manutencao-detalhes, Property 7: concluido indicator is present iff concluido is true`

- [x] 6. Implement the "Peças" tab
  - [x] 6.1 Implement the "Peças" tab content
    - Render a `Table` with columns: Nome, Código, Qtd, Valor Unit., Valor Total, Fornecedor, Original, Garantia, Status
    - For each `PecaManutencao`, display all required fields; show an "Original" Badge when `original === true`; show a color-coded Badge for `status` using `getPecaStatusInfo`
    - Render an empty-state message with a Package icon when `pecas` is empty
    - Format `valorUnitario` and `valorTotal` with `formatMoeda`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 6.2 Write property test for "Peças" tab (Property 8)
    - **Property 8: peças tab lists all parts with required fields and correct badges**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
    - Use `fast-check` to generate records with 0–10 random parts; assert row count, field presence, original badge presence iff `original === true`, and status badge color matches the defined color map
    - Tag: `// Feature: manutencao-detalhes, Property 8: peças tab lists all parts with required fields and correct badges`

- [x] 7. Implement the "Custos" tab
  - [x] 7.1 Implement the "Custos" tab content
    - Render three highlighted cards for `custoMaoObra`, `custoPecas`, and `custoTotal` formatted with `formatMoeda`
    - Display `tempoEstimado` and conditionally `tempoReal` when present
    - Conditionally render a Garantia section showing `prazo` (in months) and `descricao` when `garantia` is present
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 7.2 Write property test for "Custos" tab (Property 10)
    - **Property 10: custos tab shows all cost and time fields; garantia shown only when present**
    - **Validates: Requirements 6.1, 6.2, 6.3**
    - Use `fast-check` to generate records with random presence of `tempoReal` and `garantia`; assert required fields always present and optional fields present iff defined
    - Tag: `// Feature: manutencao-detalhes, Property 10: custos tab shows all cost and time fields; garantia shown only when present`

- [x] 8. Implement the "Linha do Tempo" tab
  - [x] 8.1 Implement the "Linha do Tempo" tab content
    - Render a vertical timeline with steps for: Criado (`criadoEm` + `criadoPor`), Agendado (`dataAgendada`), Iniciado (`dataInicio`), Concluído (`dataConclusao`), Atualizado (`atualizadoEm`)
    - Omit steps whose date field is absent from the record
    - Format dates with `dd/MM/yyyy HH:mm` when a time component is meaningful, and `dd/MM/yyyy` for date-only values, using `date-fns` `format()` with `pt` locale
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 8.2 Write property tests for "Linha do Tempo" tab (Property 11 and Property 12)
    - **Property 11: timeline shows present date fields and omits absent ones**
    - **Validates: Requirements 7.1, 7.2**
    - **Property 12: date formatting matches expected pattern**
    - **Validates: Requirements 7.3**
    - Use `fast-check` to generate records with random presence of optional date fields; assert each step appears iff its date field is defined; generate arbitrary `Date` values and assert the formatted string matches `dd/MM/yyyy HH:mm` or `dd/MM/yyyy`
    - Tag: `// Feature: manutencao-detalhes, Property 11: timeline shows present date fields and omits absent ones`
    - Tag: `// Feature: manutencao-detalhes, Property 12: date formatting matches expected pattern`

- [x] 9. Implement the "Próxima Manutenção" tab
  - [x] 9.1 Implement the "Próxima Manutenção" tab content
    - When `proximaManutencao` is present, render a Card displaying `km`, `data` (formatted with `date-fns`), and `tipo`
    - When `proximaManutencao` is absent, render an empty-state message with a prompt/button to schedule the next maintenance
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ]* 9.2 Write property test for "Próxima Manutenção" tab (Property 13)
    - **Property 13: próxima manutenção tab shows km, data, tipo when present**
    - **Validates: Requirements 8.2**
    - Use `fast-check` to generate records with `proximaManutencao` present; render the tab and assert `km`, `data`, and `tipo` are displayed
    - Tag: `// Feature: manutencao-detalhes, Property 13: próxima manutenção tab shows km, data, tipo when present`

- [x] 10. Wire the "Ver Detalhes" link in the maintenance list page
  - In `src/app/(dashboard)/transporte/manutencao/page.tsx`, update the "Ver Detalhes" dropdown menu item to navigate to `/transporte/manutencao/${manutencao.id}` using a `Link` or `router.push`
  - _Requirements: 1.1_

- [ ] 11. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests use `fast-check` and validate universal correctness properties (minimum 100 iterations each)
- Unit tests validate specific examples and edge cases
- The page is a single file — no new shared components, routes, or providers are introduced
