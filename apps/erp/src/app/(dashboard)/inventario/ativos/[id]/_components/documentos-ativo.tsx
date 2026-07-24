'use client';

/**
 * Documentos de um ativo — CLIENT COMPONENT.
 *
 * Lista os documentos anexados (com download seguro via presigned URL),
 * permite carregar novos via <UploadDocumento> (spec 01 / WS-DOC-CORE) e
 * remover (AlertDialog — única excepção ao padrão sem-modais).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, FileText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { UploadDocumento } from '@/components/patterns';
import {
  adicionarDocumentoAtivoAction,
  removerDocumentoAtivoAction,
} from '@/server/actions/inventario.actions';
import type { UploadDocumentoMeta } from '@/components/patterns';
import type { DocumentoAtivoDto } from '@/server/services/inventario/ativos.interface';

const TIPO_LABELS: Record<string, string> = {
  MANUAL: 'Manual',
  CERTIFICADO: 'Certificado',
  GARANTIA: 'Garantia',
  NOTA_FISCAL: 'Factura / Nota Fiscal',
  OUTRO: 'Outro',
};

const TIPOS = ['MANUAL', 'CERTIFICADO', 'GARANTIA', 'NOTA_FISCAL', 'OUTRO'] as const;
type TipoDocumento = (typeof TIPOS)[number];

interface DocumentosAtivoProps {
  ativoId: string;
  documentos: DocumentoAtivoDto[];
}

export function DocumentosAtivo({ ativoId, documentos }: DocumentosAtivoProps) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoDocumento>('OUTRO');
  const [aRemover, setARemover] = useState<string | null>(null);
  const [removerPending, startRemover] = useTransition();

  async function registar(meta: UploadDocumentoMeta) {
    return adicionarDocumentoAtivoAction({
      ativoId,
      tipo,
      nome: meta.nome,
      url: meta.urlRef,
      storageKey: meta.key,
      contentType: meta.contentType,
      tamanhoBytes: meta.tamanho,
    });
  }

  function remover(documentoId: string) {
    startRemover(async () => {
      const result = await removerDocumentoAtivoAction({ documentoId });
      if (result.ok) {
        toast.success('Documento removido.');
        setARemover(null);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao remover o documento.');
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="tipo-documento">Tipo de documento</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoDocumento)}>
            <SelectTrigger id="tipo-documento">
              <SelectValue placeholder="Seleccionar tipo" />
            </SelectTrigger>
            <SelectContent>
              {TIPOS.map((t) => (
                <SelectItem key={t} value={t}>
                  {TIPO_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <UploadDocumento
          recurso="ativo"
          recursoId={ativoId}
          label="Carregar documento do ativo"
          onRegistado={registar}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Documentos anexados
        </h3>
        {documentos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhum documento anexado a este ativo.
          </p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {documentos.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 border rounded-lg p-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{doc.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {TIPO_LABELS[doc.tipo] ?? doc.tipo}
                      {' · '}
                      {new Date(doc.dataUpload).toLocaleDateString('pt-MZ')}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={`/api/documentos/${doc.id}/download?recurso=ativo`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download className="h-4 w-4 sm:mr-1.5" aria-hidden />
                      <span className="sr-only sm:not-sr-only">Descarregar</span>
                    </a>
                  </Button>

                  <AlertDialog
                    open={aRemover === doc.id}
                    onOpenChange={(aberto) => setARemover(aberto ? doc.id : null)}
                  >
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        aria-label={`Remover ${doc.nome}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover documento?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O documento «{doc.nome}» será removido permanentemente, incluindo
                          o ficheiro no armazenamento. Esta acção não pode ser anulada.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={removerPending}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={(e) => {
                            e.preventDefault();
                            remover(doc.id);
                          }}
                          disabled={removerPending}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {removerPending ? 'A remover…' : 'Remover'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
