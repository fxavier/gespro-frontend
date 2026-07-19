'use client';

/**
 * Upload/colagem de CSV de extracto bancário com pré-visualização e relatório
 * de erros. All-or-nothing: com erros de parsing nada é submetido.
 */

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { FileUp, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { importarExtrato } from '@/server/actions/contabilidade.actions';
import { parseExtratoCsv, type ResultadoParseExtrato } from '@/lib/extrato-csv';

const fmtMZN = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });

export function ImportarExtratoForm({ reconciliacaoId }: { reconciliacaoId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [texto, setTexto] = useState('');
  const [resultado, setResultado] = useState<ResultadoParseExtrato | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const analisar = (conteudo: string) => {
    setTexto(conteudo);
    setResultado(conteudo.trim() ? parseExtratoCsv(conteudo) : null);
  };

  const onFicheiro = async (file: File | undefined) => {
    if (!file) return;
    analisar(await file.text());
  };

  const podeImportar = !!resultado && resultado.erros.length === 0 && resultado.linhas.length > 0;

  const submeter = () => {
    if (!podeImportar || !resultado) return;
    startTransition(async () => {
      const res = await importarExtrato({
        reconciliacaoId,
        linhas: resultado.linhas,
      });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(
        `${res.data.criados} linha(s) importada(s)` +
          (res.data.ignorados > 0 ? `, ${res.data.ignorados} já existente(s) ignorada(s)` : '') +
          '.',
      );
      router.push(`/contabilidade/reconciliacao/${reconciliacaoId}`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ficheiro CSV</CardTitle>
          <CardDescription>
            Cabeçalho obrigatório: <code className="font-mono">referencia;data;descricao;valor;tipo</code>{' '}
            (separador «;» ou «,»; data AAAA-MM-DD ou DD/MM/AAAA; tipo DEBITO/CREDITO)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            aria-label="Ficheiro de extracto CSV"
            onChange={(e) => onFicheiro(e.target.files?.[0])}
          />
          <Textarea
            value={texto}
            onChange={(e) => analisar(e.target.value)}
            placeholder={'referencia;data;descricao;valor;tipo\nMOV-001;2026-06-05;Transferência recebida;1500,00;DEBITO'}
            rows={8}
            className="font-mono text-xs"
            aria-label="Conteúdo CSV do extracto"
          />
        </CardContent>
      </Card>

      {resultado && resultado.erros.length > 0 && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive space-y-1">
          <p className="font-medium">
            {resultado.erros.length} linha(s) inválida(s) — nada será importado até corrigir:
          </p>
          <ul className="list-disc pl-5 space-y-0.5">
            {resultado.erros.slice(0, 20).map((e) => (
              <li key={e.linha}>
                Linha {e.linha}: {e.mensagem}
              </li>
            ))}
            {resultado.erros.length > 20 && <li>… e mais {resultado.erros.length - 20} erro(s)</li>}
          </ul>
        </div>
      )}

      {resultado && resultado.erros.length === 0 && resultado.linhas.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Pré-visualização — {resultado.linhas.length} linha(s)
            </CardTitle>
            <CardDescription>Linhas já importadas (mesma referência) serão ignoradas.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y max-h-80 overflow-y-auto">
              {resultado.linhas.slice(0, 50).map((l) => (
                <li key={l.extratoReferencia} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{l.extratoReferencia}</span>
                  <span className="text-xs text-muted-foreground">{l.data.toLocaleDateString('pt-PT')}</span>
                  <span className="min-w-0 flex-1 truncate">{l.descricao}</span>
                  <span className="tabular-nums font-medium">
                    {l.tipoMovimento === 'DEBITO' ? '+' : '−'}
                    {fmtMZN.format(l.valor)}
                  </span>
                </li>
              ))}
              {resultado.linhas.length > 50 && (
                <li className="px-4 py-2 text-xs text-muted-foreground">
                  … e mais {resultado.linhas.length - 50} linha(s)
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={submeter} disabled={!podeImportar || isPending} size="sm">
          <Upload className="mr-1.5 h-4 w-4" />
          {isPending ? 'A importar…' : 'Importar extracto'}
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/contabilidade/reconciliacao/${reconciliacaoId}`}>
            <X className="mr-1.5 h-4 w-4" />
            Cancelar
          </Link>
        </Button>
        {texto && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              analisar('');
              if (fileRef.current) fileRef.current.value = '';
            }}
            disabled={isPending}
          >
            <FileUp className="mr-1.5 h-4 w-4" />
            Limpar
          </Button>
        )}
      </div>
    </div>
  );
}
