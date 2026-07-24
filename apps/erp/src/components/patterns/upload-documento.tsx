'use client';

/**
 * <UploadDocumento> — upload direto cliente→S3 via presigned URL.
 *
 * Fluxo (spec 01 §UI): seleciona ficheiro → valida tipo/tamanho (UX) →
 * `POST /api/documentos/presign` → `PUT` para o storage com os
 * `requiredHeaders` → chama a action de registo (prop `onRegistado`) →
 * toast + refresh.
 *
 * SEM MODAIS: usar inline numa secção/aba de detalhe ou numa sub-rota
 * `.../documentos/novo`. Acessível (WCAG AA), dark-mode, tokens `@theme`.
 *
 * NÃO importa nada `server-only`: só tipos/constantes client-safe.
 */
import { useRef, useState, useTransition, useId } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Upload, FileUp, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  ACCEPT_DOCUMENTOS,
  CONTENT_TYPES_PERMITIDOS,
  MAX_DOCUMENTO_BYTES,
  contentTypePermitido,
  type RecursoDocumento,
} from '@/lib/storage/documento-config';

export interface UploadDocumentoMeta {
  /** Key derivada server-side no storage. */
  key: string;
  /** Ref (`gestpro-storage:{key}`) para o campo `url` das actions de registo. */
  urlRef: string;
  nome: string;
  contentType: string;
  tamanho: number;
}

/** Resultado mínimo esperado da action de registo (compatível com ActionResult). */
export interface RegistoResultado {
  ok: boolean;
  error?: { message?: string } | null;
}

export interface UploadDocumentoProps {
  recurso: RecursoDocumento;
  recursoId: string;
  /**
   * Chamada após o PUT com sucesso. O consumidor mapeia `meta` para o input
   * da sua action de registo (ex.: `url: meta.urlRef`, `storageKey: meta.key`)
   * e devolve o `ActionResult`.
   */
  onRegistado: (meta: UploadDocumentoMeta) => Promise<RegistoResultado>;
  /** Rótulo da zona de upload. */
  label?: string;
  /** Chamado após sucesso total (ex.: navegar de volta / fechar sub-rota). */
  onSuccess?: () => void;
  /** Override do atributo `accept`. */
  accept?: string;
  className?: string;
}

type Estado = 'idle' | 'uploading' | 'registing' | 'success' | 'error';

const MAX_MB = Math.round(MAX_DOCUMENTO_BYTES / (1024 * 1024));

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** PUT com progresso via XHR (fetch não expõe progresso de upload). */
function putComProgresso(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Falha no upload (HTTP ${xhr.status})`));
    });
    xhr.addEventListener('error', () => reject(new Error('Erro de rede no upload')));
    xhr.send(file);
  });
}

export function UploadDocumento({
  recurso,
  recursoId,
  onRegistado,
  label = 'Carregar documento',
  onSuccess,
  accept = ACCEPT_DOCUMENTOS,
  className,
}: UploadDocumentoProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Estado>('idle');
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [ficheiro, setFicheiro] = useState<File | null>(null);
  const [, startTransition] = useTransition();
  const inputId = useId();
  const erroId = useId();

  const ocupado = estado === 'uploading' || estado === 'registing';

  function validar(file: File): string | null {
    if (file.size > MAX_DOCUMENTO_BYTES) {
      return `Ficheiro demasiado grande (máx. ${MAX_MB} MB).`;
    }
    // file.type pode vir vazio nalguns SO; nesse caso deixa o servidor decidir.
    if (file.type && !contentTypePermitido(file.type)) {
      return 'Tipo de ficheiro não permitido.';
    }
    return null;
  }

  async function processar(file: File) {
    setErro(null);
    const invalido = validar(file);
    if (invalido) {
      setEstado('error');
      setErro(invalido);
      return;
    }

    setFicheiro(file);
    setEstado('uploading');
    setProgresso(0);

    try {
      // 1. Presign
      const resp = await fetch('/api/documentos/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recurso,
          recursoId,
          nome: file.name,
          contentType: file.type || 'application/octet-stream',
          tamanho: file.size,
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'Não foi possível assinar o upload.');
      }
      const { uploadUrl, key, requiredHeaders, urlRef } = (await resp.json()) as {
        uploadUrl: string;
        key: string;
        requiredHeaders: Record<string, string>;
        urlRef: string;
      };

      // 2. PUT direto para o storage
      await putComProgresso(uploadUrl, file, requiredHeaders, setProgresso);

      // 3. Registo do metadado via action do consumidor
      setEstado('registing');
      const meta: UploadDocumentoMeta = {
        key,
        urlRef,
        nome: file.name,
        contentType: file.type || 'application/octet-stream',
        tamanho: file.size,
      };
      const resultado = await onRegistado(meta);
      if (!resultado.ok) {
        throw new Error(resultado.error?.message ?? 'Falha ao registar o documento.');
      }

      setEstado('success');
      toast.success('Documento carregado com sucesso.');
      startTransition(() => {
        router.refresh();
        onSuccess?.();
      });
    } catch (e) {
      setEstado('error');
      setErro(e instanceof Error ? e.message : 'Erro inesperado no upload.');
      toast.error('Não foi possível carregar o documento.');
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void processar(file);
  }

  function reiniciar() {
    setEstado('idle');
    setProgresso(0);
    setErro(null);
    setFicheiro(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className={cn('rounded-lg border border-border bg-card p-4', className)}>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={onInputChange}
        disabled={ocupado}
        aria-describedby={erro ? erroId : undefined}
      />

      {estado === 'idle' && (
        <label
          htmlFor={inputId}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md',
            'border-2 border-dashed border-border bg-muted/30 px-4 py-8 text-center',
            'transition-colors hover:border-primary/50 hover:bg-muted/50',
            'focus-within:ring-2 focus-within:ring-ring',
          )}
        >
          <Upload className="size-6 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="text-xs text-muted-foreground">
            PDF, imagem ou Office · máx. {MAX_MB} MB
          </span>
        </label>
      )}

      {(estado === 'uploading' || estado === 'registing') && (
        <div className="flex flex-col gap-3" role="status" aria-live="polite">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
            <span className="truncate">
              {estado === 'uploading' ? 'A carregar' : 'A registar'} {ficheiro?.name}
            </span>
          </div>
          <Progress value={estado === 'registing' ? 100 : progresso} />
          <span className="text-xs text-muted-foreground">
            {ficheiro ? formatarTamanho(ficheiro.size) : ''}
            {estado === 'uploading' ? ` · ${progresso}%` : ' · a finalizar…'}
          </span>
        </div>
      )}

      {estado === 'success' && (
        <div className="flex flex-col gap-3" role="status" aria-live="polite">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <CheckCircle2 className="size-4 text-primary" aria-hidden />
            <span className="truncate">Documento carregado: {ficheiro?.name}</span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={reiniciar} className="self-start">
            <FileUp className="size-4" aria-hidden />
            Carregar outro
          </Button>
        </div>
      )}

      {estado === 'error' && (
        <div className="flex flex-col gap-3">
          <div
            id={erroId}
            role="alert"
            className="flex items-center gap-2 text-sm text-destructive"
          >
            <AlertCircle className="size-4" aria-hidden />
            <span>{erro ?? 'Ocorreu um erro.'}</span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={reiniciar} className="self-start">
            Tentar novamente
          </Button>
        </div>
      )}
    </div>
  );
}
