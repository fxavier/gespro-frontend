'use client';

/**
 * Upload de documento de fornecedor — integra o <UploadDocumento> de
 * WS-DOC-CORE (upload direto para o storage via presigned URL) e regista o
 * metadado através de `adicionarDocumentoFornecedorAction`.
 *
 * O tipo e a validade (opcional) são escolhidos ANTES do upload; o callback
 * `onRegistado` lê o estado corrente e mapeia a `meta` para o input da action.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UploadDocumento, type UploadDocumentoMeta } from '@/components/patterns';
import { adicionarDocumentoFornecedorAction } from '@/server/actions/fornecedores.actions';

type TipoDoc = 'CONTRATO' | 'NUIT' | 'CERTIFICACAO' | 'OUTRO';

const TIPOS: { value: TipoDoc; label: string }[] = [
  { value: 'CONTRATO', label: 'Contrato' },
  { value: 'NUIT', label: 'NUIT' },
  { value: 'CERTIFICACAO', label: 'Certificação' },
  { value: 'OUTRO', label: 'Outro' },
];

interface Props {
  fornecedorId: string;
  voltarHref: string;
}

export function DocumentoUploader({ fornecedorId, voltarHref }: Props) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoDoc>('OUTRO');
  const [dataValidade, setDataValidade] = useState('');

  async function registar(meta: UploadDocumentoMeta) {
    return adicionarDocumentoFornecedorAction({
      fornecedorId,
      tipo,
      nome: meta.nome,
      url: meta.urlRef,
      storageKey: meta.key,
      contentType: meta.contentType,
      tamanhoBytes: meta.tamanho,
      ...(dataValidade ? { dataValidade: new Date(dataValidade) } : {}),
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="tipo-documento">Tipo de documento</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoDoc)}>
            <SelectTrigger id="tipo-documento">
              <SelectValue placeholder="Seleccionar tipo" />
            </SelectTrigger>
            <SelectContent>
              {TIPOS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="data-validade">Validade (opcional)</Label>
          <Input
            id="data-validade"
            type="date"
            value={dataValidade}
            onChange={(e) => setDataValidade(e.target.value)}
          />
        </div>
      </div>

      <UploadDocumento
        recurso="fornecedor"
        recursoId={fornecedorId}
        label="Carregar documento do fornecedor"
        onRegistado={registar}
        onSuccess={() => {
          router.push(voltarHref);
          router.refresh();
        }}
      />
    </div>
  );
}
