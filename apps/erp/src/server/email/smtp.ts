import 'server-only';
import type { EmailProvider, EnviarEmailDto } from './provider';

// Definição inline do transporter para evitar import estático de nodemailer
// (permite que tsc passe mesmo antes de pnpm install pelo orquestrador).
interface SmtpTransporter {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<unknown>;
}

interface NodemailerModule {
  createTransport(options: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
  }): SmtpTransporter;
}

let _transporter: SmtpTransporter | null = null;

function getTransporter(): SmtpTransporter {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      '[email:smtp] Variáveis SMTP_HOST, SMTP_USER e SMTP_PASS são obrigatórias. ' +
        'Verifique o .env.',
    );
  }

  // Require dinâmico: não verificado pelo tsc → não falha sem nodemailer instalado.
  const nm = require('nodemailer') as NodemailerModule;
  _transporter = nm.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return _transporter;
}

/**
 * Adaptador SMTP via nodemailer.
 * Configuração exclusivamente por variáveis de ambiente:
 *   SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS, SMTP_FROM.
 * Segredos nunca no repo.
 */
export const smtpEmailProvider: EmailProvider = {
  async enviar(dto: EnviarEmailDto): Promise<void> {
    const transporter = getTransporter();
    const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'noreply@gespro.mz';

    await transporter.sendMail({
      from,
      to: dto.para,
      subject: dto.assunto,
      html: dto.html,
      text: dto.texto,
    });
  },
};
