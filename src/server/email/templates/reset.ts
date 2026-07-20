import { emailLayout } from './layout';

interface ResetPasswordTemplateProps {
  linkReset: string;
  nomeUtilizador?: string;
  expiracaoHoras?: number;
}

/**
 * Template de email para recuperação de palavra-passe — pt-PT.
 */
export function resetPasswordTemplate({
  linkReset,
  nomeUtilizador,
  expiracaoHoras = 1,
}: ResetPasswordTemplateProps): { html: string; texto: string } {
  const saudacao = nomeUtilizador ? `Olá, ${nomeUtilizador}` : 'Olá';

  const conteudo = `
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;">
      Recuperação de Palavra-passe
    </h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155;">
      ${saudacao},
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">
      Recebemos um pedido de recuperação de palavra-passe para a sua conta no GestPro.
      Se não fez este pedido, pode ignorar este email em segurança.
    </p>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${linkReset}"
         style="display:inline-block;padding:12px 28px;background:#0f172a;color:#ffffff;
                font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
        Redefinir Palavra-passe
      </a>
    </div>
    <p style="margin:0 0 8px;font-size:13px;color:#64748b;">
      Este link expira em <strong>${expiracaoHoras} hora${expiracaoHoras !== 1 ? 's' : ''}</strong>.
    </p>
    <p style="margin:0;font-size:13px;color:#64748b;">
      Se o botão não funcionar, copie e cole este endereço no navegador:<br/>
      <a href="${linkReset}" style="color:#3b82f6;word-break:break-all;">${linkReset}</a>
    </p>
  `;

  const texto = `${saudacao},

Recebemos um pedido de recuperação de palavra-passe para a sua conta no GestPro.

Para redefinir a sua palavra-passe, aceda ao seguinte endereço:
${linkReset}

Este link expira em ${expiracaoHoras} hora${expiracaoHoras !== 1 ? 's' : ''}.

Se não fez este pedido, pode ignorar este email em segurança.

-- GestPro`;

  return {
    html: emailLayout(conteudo, 'GestPro — Recuperação de Palavra-passe'),
    texto,
  };
}
