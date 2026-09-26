'use client';

/**
 * «Exportar PDF» da DFC — CLIENT COMPONENT (nó `pagina`, ticket 9.2).
 *
 * Chama `GET /api/contabilidade/dfc/export?dataInicio=&dataFim=` com o
 * intervalo que está no ecrã. Um `<a download>` simples não serviria: com
 * impedimentos a rota responde 422 com JSON, e o browser gravaria esse JSON
 * como se fosse o PDF, sem dizer nada ao utilizador. Aqui:
 *  - 200 ⇒ o PDF é descarregado com o nome que a rota deu (`Content-Disposition`);
 *  - 422 com `DFC_COM_IMPEDIMENTOS` ⇒ mostra a lista completa de
 *    `error.details.impedimentos`, como a própria página;
 *  - outro erro ⇒ a mensagem do envelope `{ error: { message } }`.
 *
 * A página só mostra o botão quando há mapa e o utilizador tem
 * `financas:exportar`; o 422 fica para o caso de a configuração mudar entre o
 * desenho da página e o clique.
 */

import { useState } from 'react';
import { Download, Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ErroExportacao {
  mensagem: string;
  impedimentos: string[];
}

function nomeDoFicheiro(cabecalho: string | null): string {
  const m = cabecalho?.match(/filename="([^"]+)"/);
  return m?.[1] ?? 'dfc.pdf';
}

export function ExportarPdfDFC({ href }: { href: string }) {
  const [aExportar, setAExportar] = useState(false);
  const [erro, setErro] = useState<ErroExportacao | null>(null);

  async function exportar() {
    setAExportar(true);
    setErro(null);
    try {
      const r = await fetch(href, { headers: { Accept: 'application/pdf, application/json' } });
      if (r.ok && (r.headers.get('content-type') ?? '').includes('application/pdf')) {
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nomeDoFicheiro(r.headers.get('content-disposition'));
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1_000);
        return;
      }
      const corpo = (await r.json().catch(() => null)) as {
        error?: { message?: string; details?: { impedimentos?: unknown } };
      } | null;
      const impedimentos = corpo?.error?.details?.impedimentos;
      setErro({
        mensagem:
          r.status === 422 && Array.isArray(impedimentos)
            ? 'A DFC não pode ser exportada enquanto houver impedimentos.'
            : (corpo?.error?.message ?? `A exportação falhou (HTTP ${r.status}).`),
        impedimentos: Array.isArray(impedimentos) ? impedimentos.map(String) : [],
      });
    } catch {
      setErro({ mensagem: 'Não foi possível contactar o servidor para exportar o PDF.', impedimentos: [] });
    } finally {
      setAExportar(false);
    }
  }

  return (
    // `contents`: o botão e o erro são itens do flex do cabeçalho do cartão; o
    // erro faz `basis-full` e fica a toda a largura, por baixo, e não na coluna dos badges.
    <div className="contents">
      <Button type="button" variant="outline" size="sm" onClick={exportar} disabled={aExportar} data-testid="dfc-exportar-pdf">
        {aExportar ? (
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4 mr-1.5" aria-hidden="true" />
        )}
        Exportar PDF
      </Button>
      {erro && (
        <Alert variant="destructive" role="alert" className="basis-full" data-testid="dfc-exportar-erro">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>{erro.mensagem}</AlertTitle>
          {erro.impedimentos.length > 0 && (
            <AlertDescription>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {erro.impedimentos.map((frase, i) => (
                  <li key={`${i}-${frase}`}>{frase}</li>
                ))}
              </ul>
            </AlertDescription>
          )}
        </Alert>
      )}
    </div>
  );
}
