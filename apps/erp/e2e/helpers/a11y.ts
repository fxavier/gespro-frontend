/**
 * axe WCAG 2.1 AA partilhado pelos E2E (#373) — antes copiado em `a11y.a11y.ts` e no spec 36.
 *
 * Falha em violações `critical`/`serious` (BLOCKER, spec de a11y); `moderate`/`minor` só avisam.
 * Os popovers do Radix ficam de fora (falsos positivos conhecidos dos componentes shadcn).
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

export async function checkA11y(page: Page, contexto?: string): Promise<void> {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .exclude('[data-radix-popper-content-wrapper]')
    .analyze();

  const bloqueantes = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  if (bloqueantes.length > 0) {
    const msg = bloqueantes
      .map((v) => `[${v.impact}] ${v.id}: ${v.description}\n  → ${v.help}\n  → Nós afectados: ${v.nodes.length}`)
      .join('\n\n');
    throw new Error(
      `A11y BLOCKER${contexto ? ` em "${contexto}"` : ''}: ${bloqueantes.length} violação(ões) WCAG AA\n\n${msg}`,
    );
  }

  const avisos = r.violations.filter((v) => v.impact === 'moderate' || v.impact === 'minor');
  if (avisos.length > 0) {
    console.warn(`A11y aviso${contexto ? ` em "${contexto}"` : ''}: ${avisos.length} violação(ões) moderate/minor`);
  }
}
