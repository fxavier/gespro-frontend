'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormPage, FormSection } from '@/components/patterns';
import { executarReconciliacaoAction, importarExtractoAction } from '@/server/actions/reconciliacao.actions';

interface ErroLinha {
  linha: number;
  mensagem: string;
}

/**
 * Importação de extracto CSV/XLSX. O parse é no servidor e é all-or-nothing:
 * se uma linha falhar, nada entra e mostram-se TODOS os erros de uma vez.
 * Depois de importar, corre o motor — é assim que um movimento em trânsito
 * encontra o seu par quando o extracto chega (CA04).
 */
export function ImportarForm({ contaBancariaId }: { contaBancariaId: string }) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();
  const [ficheiro, setFicheiro] = useState<File | null>(null);
  const [erros, setErros] = useState<ErroLinha[]>([]);
  const base = `/contabilidade/reconciliacao/${contaBancariaId}`;

  const importar = () => {
    if (!ficheiro) return;
    iniciar(async () => {
      setErros([]);
      const r = await importarExtractoAction({ contaBancariaId, ficheiro });
      if (!r.ok) {
        const detalhe = r.error.details as { erros?: ErroLinha[] } | undefined;
        if (detalhe?.erros?.length) setErros(detalhe.erros);
        toast.error(r.error.message);
        return;
      }
      if (r.data.estado === 'JA_IMPORTADO') {
        toast.info('Este ficheiro já tinha sido importado nesta conta — nada foi alterado.');
      } else {
        toast.success(`${r.data.criados} movimento(s) importado(s); ${r.data.ignorados} já existiam.`);
      }
      const e = await executarReconciliacaoAction({ contaBancariaId });
      if (!e.ok) toast.error(e.error.message);
      router.push(base);
      router.refresh();
    });
  };

  return (
    <FormPage
      actions={
        <>
          <Button type="button" variant="outline" size="sm" disabled={aCorrer} onClick={() => router.push(base)}>
            <X className="h-4 w-4 mr-1.5" /> Cancelar
          </Button>
          <Button type="button" size="sm" disabled={aCorrer || !ficheiro} onClick={importar}>
            <FileUp className="h-4 w-4 mr-1.5" />
            {aCorrer ? 'A importar…' : 'Importar e reconciliar'}
          </Button>
        </>
      }
    >
      <FormSection
        title="Ficheiro do banco"
        description="CSV ou XLSX, até 5 MB. Colunas obrigatórias: data, descrição, valor. Opcionais: referência, tipo (D/C), data-valor, saldo. Sem coluna de tipo, o sinal do valor decide."
      >
        <div className="space-y-2 max-w-md">
          <Label htmlFor="ficheiro-extracto">Extracto</Label>
          <Input
            id="ficheiro-extracto"
            type="file"
            accept=".csv,.txt,.xlsx"
            onChange={(e) => setFicheiro(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">
            Reimportar o mesmo ficheiro, ou um extracto que se sobrepõe a outro, não duplica movimentos.
          </p>
        </div>
      </FormSection>

      {erros.length > 0 && (
        <FormSection title={`${erros.length} linha(s) com erro — nada foi importado`}>
          <ul className="space-y-1 text-sm" aria-live="polite">
            {erros.map((e) => (
              <li key={`${e.linha}-${e.mensagem}`} className="flex gap-2">
                <span className="w-16 shrink-0 tabular-nums text-muted-foreground">Linha {e.linha}</span>
                <span className="text-destructive">{e.mensagem}</span>
              </li>
            ))}
          </ul>
        </FormSection>
      )}
    </FormPage>
  );
}
