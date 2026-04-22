# Requirements Document

## Introduction

This feature adds a maintenance detail page to the transport and logistics module. When a user clicks "Ver Detalhes" in the maintenance list, the application navigates to `/transporte/manutencao/[id]` and displays a full detail view for that maintenance record. The page presents all maintenance data in a well-organized, tabbed layout covering general information, services performed, parts used, costs, timeline, and next maintenance scheduling. The page uses the same mock data already defined in the maintenance list page, since no real backend exists yet.

## Glossary

- **Manutencao**: A maintenance record for a fleet vehicle, identified by a unique `id` and `codigo`.
- **ServicoManutencao**: A service item within a maintenance record (e.g., oil change, brake inspection), with completion status and cost.
- **PecaManutencao**: A part item within a maintenance record (e.g., oil filter, fuel pump), with quantity, unit value, and installation status.
- **Detail_Page**: The Next.js App Router page rendered at `/transporte/manutencao/[id]`.
- **Maintenance_List**: The existing page at `/transporte/manutencao` that lists all maintenance records.
- **Mock_Data**: The static in-memory array of `Manutencao` objects already defined in the maintenance list page.

## Requirements

### Requirement 1: Navigation to Detail Page

**User Story:** As a fleet manager, I want to click "Ver Detalhes" on a maintenance record and be taken to its detail page, so that I can view the full information for that record.

#### Acceptance Criteria

1. WHEN the user clicks "Ver Detalhes" in the maintenance list dropdown, THE Detail_Page SHALL render at the route `/transporte/manutencao/[id]` matching the selected record's `id`.
2. WHEN the Detail_Page loads, THE Detail_Page SHALL display a back button that navigates the user to the Maintenance_List page.
3. IF the `id` parameter in the URL does not match any record in Mock_Data, THEN THE Detail_Page SHALL display a "not found" message and a back button.

---

### Requirement 2: Header and Summary Cards

**User Story:** As a fleet manager, I want to see the maintenance code, vehicle, status, type, and priority at a glance when I open the detail page, so that I can quickly assess the record.

#### Acceptance Criteria

1. THE Detail_Page SHALL display the maintenance `codigo` and `veiculoMatricula` as the page title area.
2. THE Detail_Page SHALL display summary cards showing: `status`, `tipo`, `prioridade`, and `custoTotal`.
3. WHEN displaying `status`, `tipo`, and `prioridade`, THE Detail_Page SHALL use color-coded badges consistent with the color scheme used in the Maintenance_List.

---

### Requirement 3: General Information Tab

**User Story:** As a fleet manager, I want to see all general details of a maintenance record in one place, so that I have full context about the work being done.

#### Acceptance Criteria

1. THE Detail_Page SHALL include a "Informações Gerais" tab that displays: `veiculoModelo`, `veiculoMatricula`, `kmAtual`, `kmProxima`, `dataAgendada`, `dataInicio`, `dataConclusao`, `oficina`, `mecanicoResponsavel`, and `telefoneOficina`.
2. WHEN `dataInicio`, `dataConclusao`, `mecanicoResponsavel`, `telefoneOficina`, or `kmProxima` are absent from the record, THE Detail_Page SHALL display a placeholder (e.g., "—") for those fields.
3. WHEN `problemaRelatado`, `diagnostico`, `recomendacoes`, or `observacoes` are present in the record, THE Detail_Page SHALL display each in a dedicated labeled section within the "Informações Gerais" tab.

---

### Requirement 4: Services Tab

**User Story:** As a fleet manager, I want to see all services performed or planned for a maintenance record, so that I know what work was done.

#### Acceptance Criteria

1. THE Detail_Page SHALL include a "Serviços" tab that lists all items in the `servicos` array.
2. WHEN displaying each `ServicoManutencao`, THE Detail_Page SHALL show: `nome`, `categoria`, `descricao`, `custo`, `tempo`, and `concluido` status.
3. WHEN `concluido` is `true` for a service, THE Detail_Page SHALL display a visual indicator (e.g., a green badge or checkmark) to distinguish it from incomplete services.
4. IF the `servicos` array is empty, THEN THE Detail_Page SHALL display an empty-state message in the "Serviços" tab.

---

### Requirement 5: Parts Tab

**User Story:** As a fleet manager, I want to see all parts used or requested for a maintenance record, so that I can track inventory and costs.

#### Acceptance Criteria

1. THE Detail_Page SHALL include a "Peças" tab that lists all items in the `pecas` array.
2. WHEN displaying each `PecaManutencao`, THE Detail_Page SHALL show: `nome`, `codigo`, `quantidade`, `valorUnitario`, `valorTotal`, `fornecedor`, `original`, `garantia`, and `status`.
3. WHEN `original` is `true` for a part, THE Detail_Page SHALL display a badge indicating it is an original part.
4. WHEN displaying `status` for each part, THE Detail_Page SHALL use a color-coded badge (e.g., green for "instalada", orange for "em_transito", blue for "disponivel", gray for "solicitada").
5. IF the `pecas` array is empty, THEN THE Detail_Page SHALL display an empty-state message in the "Peças" tab.

---

### Requirement 6: Costs Tab

**User Story:** As a fleet manager, I want to see a cost breakdown for a maintenance record, so that I can understand where money was spent.

#### Acceptance Criteria

1. THE Detail_Page SHALL include a "Custos" tab that displays `custoMaoObra`, `custoPecas`, and `custoTotal` as labeled values.
2. THE Detail_Page SHALL display `tempoEstimado` and, when present, `tempoReal` in the "Custos" tab.
3. WHEN `garantia` is present in the record, THE Detail_Page SHALL display the warranty `prazo` (in months) and `descricao` in the "Custos" tab.
4. THE Detail_Page SHALL display all monetary values formatted with the "MT" currency prefix and locale-formatted numbers.

---

### Requirement 7: Timeline Tab

**User Story:** As a fleet manager, I want to see the timeline of a maintenance record, so that I can understand when each phase occurred.

#### Acceptance Criteria

1. THE Detail_Page SHALL include a "Linha do Tempo" tab that displays `criadoEm`, `criadoPor`, `dataAgendada`, `dataInicio`, `dataConclusao`, and `atualizadoEm` as a chronological sequence.
2. WHEN a timeline date field is absent from the record, THE Detail_Page SHALL omit that step from the timeline display.
3. THE Detail_Page SHALL format all dates in the timeline using the `dd/MM/yyyy HH:mm` pattern where time is available, and `dd/MM/yyyy` where only a date is available.

---

### Requirement 8: Next Maintenance Tab

**User Story:** As a fleet manager, I want to see the next scheduled maintenance for a vehicle, so that I can plan ahead.

#### Acceptance Criteria

1. THE Detail_Page SHALL include a "Próxima Manutenção" tab.
2. WHEN `proximaManutencao` is present in the record, THE Detail_Page SHALL display the next maintenance `km`, `data`, and `tipo`.
3. IF `proximaManutencao` is absent from the record, THEN THE Detail_Page SHALL display a message indicating no next maintenance is scheduled, with a prompt to schedule one.

---

### Requirement 9: Mock Data Lookup

**User Story:** As a developer, I want the detail page to find the correct maintenance record from mock data using the URL `id` parameter, so that the page works without a backend.

#### Acceptance Criteria

1. WHEN the Detail_Page mounts, THE Detail_Page SHALL read the `id` route parameter using `useParams` and look up the matching record from the Mock_Data array.
2. THE Mock_Data used in the Detail_Page SHALL be identical in structure and content to the data defined in the Maintenance_List page.
3. WHEN the lookup completes and a record is found, THE Detail_Page SHALL render the full detail layout with that record's data.
