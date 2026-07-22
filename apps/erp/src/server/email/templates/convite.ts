import { emailLayout } from './layout';

interface ConviteTemplateProps {
  linkConvite: string;
  emailConvidado: string;
  nomeEmpresa?: string;
  nomeConvidadoPor?: string;
  expiracaoHoras?: number;
}

/**
 * Template de email de convite de utilizador — pt-PT.
 */
export function conviteTemplate({
  linkConvite,
  emailConvidado,
  nomeEmpresa,
  nomeConvidadoPor,
  expiracaoHoras = 48,
}: ConviteTemplateProps): { html: string; texto: string } {
  const empresa = nomeEmpresa ?? 'a vossa empresa';
  const convidadoPor = nomeConvidadoPor ? `por <strong>${nomeConvidadoPor}</strong>` : '';

  const conteudo = `
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;">
      Convite para o GestPro
    </h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155;">
      Olá,
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">
      Foi convidado ${convidadoPor} para aceder ao sistema de gestão da empresa
      <strong>${empresa}</strong> no GestPro.
      Crie a sua conta através do botão abaixo.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#64748b;">
      Email de acesso: <strong>${emailConvidado}</strong>
    </p>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${linkConvite}"
         style="display:inline-block;padding:12px 28px;background:#0f172a;color:#ffffff;
                font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
        Aceitar Convite
      </a>
    </div>
    <p style="margin:0 0 8px;font-size:13px;color:#64748b;">
      Este convite expira em <strong>${expiracaoHoras} horas</strong>.
    </p>
    <p style="margin:0;font-size:13px;color:#64748b;">
      Se o botão não funcionar, copie e cole este endereço no navegador:<br/>
      <a href="${linkConvite}" style="color:#3b82f6;word-break:break-all;">${linkConvite}</a>
    </p>
  `;

  const texto = `Olá,

Foi convidado ${nomeConvidadoPor ? `por ${nomeConvidadoPor} ` : ''}para aceder ao sistema de gestão da empresa ${empresa} no GestPro.

Email de acesso: ${emailConvidado}

Para criar a sua conta, aceda ao seguinte endereço:
${linkConvite}

Este convite expira em ${expiracaoHoras} horas.

-- GestPro`;

  return {
    html: emailLayout(conteudo, 'GestPro — Convite de Utilizador'),
    texto,
  };
}
