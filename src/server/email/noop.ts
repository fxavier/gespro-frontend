import 'server-only';
import type { EmailProvider, EnviarEmailDto } from './provider';

/**
 * Adaptador noop — usado em desenvolvimento e testes.
 * Apenas regista o email na consola, sem I/O real.
 */
export const noopEmailProvider: EmailProvider = {
  async enviar(dto: EnviarEmailDto): Promise<void> {
    console.log('[email:noop] Envio simulado:', {
      para: dto.para,
      assunto: dto.assunto,
      previewTexto: dto.texto?.slice(0, 100) ?? dto.html.slice(0, 100),
    });
  },
};
