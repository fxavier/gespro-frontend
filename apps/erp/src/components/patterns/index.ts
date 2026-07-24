/**
 * Biblioteca de componentes de padrão — GestPro
 * Usar exclusivamente estes componentes sobre os primitivos de src/components/ui.
 * Zero cores hardcoded; todos suportam dark mode.
 */
export { PageHeader } from './page-header';
export type { BreadcrumbItem } from './page-header';

export { DataTable, TableSkeleton } from './data-table';
export type { TableColumn } from './data-table';

export { FilterBar } from './filter-bar';
export type { FilterConfig, FilterOption } from './filter-bar';

export { StatusBadge, badgeVariants, STATUS_LABELS } from './status-badge';
export type { StatusVariant } from './status-badge';

export { KpiCard } from './kpi-card';

export { DetailShell } from './detail-shell';
export type { DetailTab } from './detail-shell';

export { FormPage, FormSection } from './form-page';

export { Timeline } from './timeline';
export type { TimelineItem } from './timeline';

export { EmptyState } from './empty-state';
export { ErrorState } from './error-state';

export { Stepper, StepperContent } from './stepper';
export type { StepperStep } from './stepper';

export { UnsavedChangesGuard } from './unsaved-changes-guard';

export { PageLoading } from './page-loading';

export { UploadDocumento } from './upload-documento';
export type {
  UploadDocumentoProps,
  UploadDocumentoMeta,
  RegistoResultado,
} from './upload-documento';
