'use client';

/**
 * Documentos do colaborador (#163) — CLIENT COMPONENT.
 *
 * Upload pelo fluxo existente (<UploadDocumento>: presign → PUT → registo, ADR-0017) e lista
 * com download seguro (`/api/documentos/{id}/download`). Upload: `rh:colaboradores:update`;
 * download: `rh:colaboradores:read` (#193).
 */

import { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UploadDocumento } from '@/components/patterns';
import type { UploadDocumentoMeta } from '@/components/patterns';
import { adicionarDocumentoColaboradorAction } from '@/server/actions/rh.actions';
import { formatarData } from '@/lib/format-date';

const TIPO_LABELS = {
  FOTO: 'Foto',
  BI_FRENTE: 'Bilhete de Identidade (frente)',
  BI_VERSO: 'Bilhete de Identidade (verso)',
  CERTIFICADO_HABILITACOES: 'Certificado de Habilitações',
  CURRICULUM: 'Curriculum',
  CERTIFICADO_CRIMINAL: 'Certificado de Registo Criminal',
  ATESTADO_MEDICO_DOC: 'Atestado Médico',
  COMPROVATIVO_RESIDENCIA: 'Comprovativo de Residência',
  CERTIFICADO_INSS: 'Certificado INSS',
  DECLARACAO_NUIT: 'Declaração NUIT',
  CONTRATO_TRABALHO: 'Contrato de Trabalho',
  CARTA_CONDUCAO: 'Carta de Condução',
  CERTIFICADO_PROFISSIONAL: 'Certificado Profissional',
  OUTRO: 'Outro',
} as const;

type TipoDocumento = keyof typeof TIPO_LABELS;
const TIPOS = Object.keys(TIPO_LABELS) as TipoDocumento[];

export interface DocumentoColaboradorLinha {
  id: string;
  tipo: string;
  nome: string;
  dataUpload: string;
}

interface Props {
  colaboradorId: string;
  documentos: DocumentoColaboradorLinha[];
  /** Só o upload: `rh:colaboradores:update`. O download exige `rh:colaboradores:read` (#193). */
  podeGerir: boolean;
}

export function DocumentosColaborador({ colaboradorId, documentos, podeGerir }: Props) {
  const [tipo, setTipo] = useState<TipoDocumento>('OUTRO');

  function registar(meta: UploadDocumentoMeta) {
    return adicionarDocumentoColaboradorAction({
      colaboradorId,
      tipo,
      nome: meta.nome,
      url: meta.urlRef,
      tamanho: meta.tamanho,
    });
  }

  return (
    <div className="space-y-6">
      {podeGerir && (
        <section className="space-y-3">
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="tipo-documento-colaborador">Tipo de documento</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoDocumento)}>
              <SelectTrigger id="tipo-documento-colaborador">
                <SelectValue placeholder="Seleccionar tipo">{TIPO_LABELS[tipo]}</SelectValue>
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
            recurso="colaborador"
            recursoId={colaboradorId}
            label="Carregar documento do colaborador"
            onRegistado={registar}
          />
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Documentos anexados
        </h3>
        {documentos.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nenhum documento anexado a este colaborador.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {documentos.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{doc.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {TIPO_LABELS[doc.tipo as TipoDocumento] ?? doc.tipo}
                      {' · '}
                      {formatarData(doc.dataUpload)}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`/api/documentos/${doc.id}/download?recurso=colaborador`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="h-4 w-4 sm:mr-1.5" aria-hidden />
                    <span className="sr-only sm:not-sr-only">Descarregar</span>
                  </a>
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
