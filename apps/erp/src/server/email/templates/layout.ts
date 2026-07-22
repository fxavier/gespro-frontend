/**
 * Layout base dos templates de email — pt-PT.
 * Sem dependências externas; gera HTML inline compatível com clientes de email.
 */
export function emailLayout(conteudo: string, assuntoRodape?: string): string {
  const ano = new Date().getFullYear();
  const rodape = assuntoRodape ?? 'GestPro — Sistema de Gestão Empresarial';

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${rodape}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
          <!-- Cabeçalho -->
          <tr>
            <td style="background:#0f172a;padding:24px 32px;">
              <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">
                GestPro
              </span>
            </td>
          </tr>
          <!-- Conteúdo -->
          <tr>
            <td style="padding:32px;">
              ${conteudo}
            </td>
          </tr>
          <!-- Rodapé -->
          <tr>
            <td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#64748b;text-align:center;">
                ${rodape} &copy; ${ano}<br/>
                Este é um email automático — não responda a esta mensagem.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
