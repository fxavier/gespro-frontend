import 'server-only';
import type { EmailProvider } from './provider';

/**
 * Selecção do provider de email por variável de ambiente EMAIL_PROVIDER.
 *   smtp  → nodemailer (produção / staging)
 *   noop  → log na consola (dev / teste) — default quando não configurado
 *
 * Segredos SMTP apenas em .env / secret manager (nunca no repo).
 */
function createEmailProvider(): EmailProvider {
  const provider = process.env.EMAIL_PROVIDER ?? 'noop';

  if (provider === 'smtp') {
    // Import síncrono: server-only, não entra no bundle do cliente.
    const { smtpEmailProvider } = require('./smtp') as {
      smtpEmailProvider: EmailProvider;
    };
    return smtpEmailProvider;
  }

  const { noopEmailProvider } = require('./noop') as {
    noopEmailProvider: EmailProvider;
  };
  return noopEmailProvider;
}

/**
 * Singleton do provider de email activo.
 * Injectável nos testes via substituição do módulo (vi.mock).
 */
export const emailProvider: EmailProvider = createEmailProvider();

export type { EmailProvider, EnviarEmailDto } from './provider';
