import 'server-only';
import type {
  VagaInput,
  UpdateVagaInput,
  FilterVagaInput,
  CandidatoInput,
  UpdateCandidatoInput,
  FilterCandidatoInput,
  CandidaturaInput,
  MoverEtapaInput,
  MoverPosicaoKanbanInput,
  EntrevistaInput,
  AdmitirInput,
  TransitarStatusVagaInput,
} from '@/lib/validations/recrutamento';
import type { Ctx } from '@/server/services/types';

// Re-export Ctx para compatibilidade
export type { Ctx };

// Re-export das máquinas de estado (importadas do módulo client-safe)
export { TRANSICOES_VAGA, TRANSICOES_CANDIDATURA } from '@/lib/state-machines';

// ─────────────────────────────────────────────────────────────────────────────
// Input types re-export
// ─────────────────────────────────────────────────────────────────────────────

export type {
  VagaInput,
  UpdateVagaInput,
  FilterVagaInput,
  CandidatoInput,
  UpdateCandidatoInput,
  FilterCandidatoInput,
  CandidaturaInput,
  MoverEtapaInput,
  MoverPosicaoKanbanInput,
  EntrevistaInput,
  AdmitirInput,
  TransitarStatusVagaInput,
};
