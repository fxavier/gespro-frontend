# Requirements Document

## Introduction

This feature adds a route detail page to the transport and logistics module. When a user clicks "Ver Detalhes" in the routes list, the application navigates to `/transporte/rotas/[id]` and displays a full detail view for that route record. The page presents all route data in a well-organized, tabbed layout covering general information, route waypoints, deliveries, costs, and a timeline. The page uses the same mock data already defined in the routes list page, since no real backend exists yet.

## Glossary

- **Rota**: A transport route record, identified by a unique `id` and `codigo`, with an origin, destination, waypoints, and associated deliveries.
- **PontoRota**: A waypoint within a route (e.g., a pickup, delivery stop, or rest stop), with order, address, type, and completion status.
- **EntregaRota**: A delivery item associated with a route, with a code, client, address, status, and optional weight/volume.
- **Detail_Page**: The Next.js App Router page rendered at `/transporte/rotas/[id]`.
- **Routes_List**: The existing page at `/transporte/rotas` that lists all route records.
- **Mock_Data**: The static in-memory array of `Rota` objects already defined in the routes list page.

## Requirements

### Requirement 1: Navigation to Detail Page

**User Story:** As a logistics manager, I want to click "Ver Detalhes" on a route record and be taken to its detail page, so that I can view the full information for that route.

#### Acceptance Criteria

1. WHEN the user clicks "Ver Detalhes" in the routes list dropdown, THE Detail_Page SHALL render at the route `/transporte/rotas/[id]` matching the selected record's `id`.
2. WHEN the Detail_Page loads, THE Detail_Page SHALL display a back button that navigates the user to the Routes_List page.
3. IF the `id` parameter in the URL does not match any record in Mock_Data, THEN THE Detail_Page SHALL display a "not found" message and a back button.

---

### Requirement 2: Header and Summary Cards

**User Story:** As a logistics manager, I want to see the route code, name, origin, destination, status, priority, distance, and cost at a glance when I open the detail page, so that I can quickly assess the route.

#### Acceptance Criteria

1. THE Detail_Page SHALL display the route `codigo` and `nome` as the page title area, with `origem → destino` as the subtitle.
2. THE Detail_Page SHALL display four summary cards showing: `status`, `prioridade`, `distanciaTotal` (in km), and cost (using `custoReal` when present, otherwise `custoEstimado`).
3. WHEN displaying `status` and `prioridade`, THE Detail_Page SHALL use color-coded badges consistent with the color scheme used in the Routes_List.

---

### Requirement 3: General Information Tab

**User Story:** As a logistics manager, I want to see all general details of a route record in one place, so that I have full context about the route.

#### Acceptance Criteria

1. THE Detail_Page SHALL include an "Informações Gerais" tab that displays: `veiculoMatricula`, `motoristaNome`, `dataPlanejada`, `dataInicio`, `dataFim`, `distanciaTotal`, `tempoEstimado`, `combustivelEstimado`, and `combustivelReal`.
2. WHEN `veiculoMatricula`, `motoristaNome`, `dataInicio`, `dataFim`, or `combustivelReal` are absent from the record, THE Detail_Page SHALL display a placeholder (e.g., "—") for those fields.
3. WHEN `observacoes` is present in the record, THE Detail_Page SHALL display it in a dedicated labeled section within the "Informações Gerais" tab.

---

### Requirement 4: Route Waypoints Tab

**User Story:** As a logistics manager, I want to see all waypoints of a route in order, so that I can understand the route sequence and track progress.

#### Acceptance Criteria

1. THE Detail_Page SHALL include a "Pontos da Rota" tab that lists all items in the `pontos` array, ordered by `ordem`.
2. WHEN displaying each `PontoRota`, THE Detail_Page SHALL show: `ordem`, `endereco`, `tipo`, `clienteNome`, `tempoParada`, `horaChegada`, `horaSaida`, and `concluido` status.
3. WHEN `horaChegada` or `horaSaida` are absent from a waypoint, THE Detail_Page SHALL display a placeholder (e.g., "—") for those fields.
4. WHEN `concluido` is `true` for a waypoint, THE Detail_Page SHALL display a visual indicator (e.g., a green badge) to distinguish it from pending waypoints.
5. IF the `pontos` array is empty, THEN THE Detail_Page SHALL display an empty-state message in the "Pontos da Rota" tab.

---

### Requirement 5: Deliveries Tab

**User Story:** As a logistics manager, I want to see all deliveries associated with a route, so that I can track delivery status and details.

#### Acceptance Criteria

1. THE Detail_Page SHALL include an "Entregas" tab that lists all items in the `entregas` array.
2. WHEN displaying each `EntregaRota`, THE Detail_Page SHALL show: `codigo`, `clienteNome`, `endereco`, `status`, `tentativas`, `peso`, and `volume`.
3. WHEN displaying `status` for each delivery, THE Detail_Page SHALL use a color-coded badge (e.g., green for "entregue", blue for "em_transito", gray for "pendente", red for "falhada").
4. WHEN `peso` or `volume` are absent from a delivery, THE Detail_Page SHALL display a placeholder (e.g., "—") for those fields.
5. IF the `entregas` array is empty, THEN THE Detail_Page SHALL display an empty-state message in the "Entregas" tab.

---

### Requirement 6: Costs Tab

**User Story:** As a logistics manager, I want to see a cost and fuel breakdown for a route, so that I can understand the financial and operational performance.

#### Acceptance Criteria

1. THE Detail_Page SHALL include a "Custos" tab that displays `custoEstimado` and, when present, `custoReal` as labeled values.
2. THE Detail_Page SHALL display `combustivelEstimado` and, when present, `combustivelReal` in the "Custos" tab.
3. WHEN `custoReal` is present, THE Detail_Page SHALL display the cost variance (difference between `custoReal` and `custoEstimado`) in the "Custos" tab.
4. THE Detail_Page SHALL display all monetary values formatted with the "MT" currency prefix and locale-formatted numbers.
5. THE Detail_Page SHALL display all fuel values formatted with the "L" (litres) suffix.

---

### Requirement 7: Timeline Tab

**User Story:** As a logistics manager, I want to see the timeline of a route, so that I can understand when each phase occurred.

#### Acceptance Criteria

1. THE Detail_Page SHALL include a "Linha do Tempo" tab that displays `criadoEm`, `dataPlanejada`, `dataInicio`, and `dataFim` as a chronological sequence.
2. WHEN a timeline date field is absent from the record, THE Detail_Page SHALL omit that step from the timeline display.
3. THE Detail_Page SHALL format all dates in the timeline using the `dd/MM/yyyy HH:mm` pattern where time is available, and `dd/MM/yyyy` where only a date is available.

---

### Requirement 8: Mock Data Lookup

**User Story:** As a developer, I want the detail page to find the correct route record from mock data using the URL `id` parameter, so that the page works without a backend.

#### Acceptance Criteria

1. WHEN the Detail_Page mounts, THE Detail_Page SHALL read the `id` route parameter using `useParams` and look up the matching record from the Mock_Data array.
2. THE Mock_Data used in the Detail_Page SHALL be identical in structure and content to the data defined in the Routes_List page.
3. WHEN the lookup completes and a record is found, THE Detail_Page SHALL render the full detail layout with that record's data.
