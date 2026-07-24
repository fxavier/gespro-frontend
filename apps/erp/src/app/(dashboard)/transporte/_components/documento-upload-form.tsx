'use client';

/**
 * Formulário de documento de viatura/motorista com upload real (WS-DOC-CORE).
 * Preenche os metadados do documento e carrega o ficheiro via <UploadDocumento>.
 * O `urlRef` (gestpro-storage:{key}) é guardado em `anexo` — o download
 * (/api/documentos/{id}/download?recurso=...) resolve a key a partir daí.
 * Sem Dialog — inline numa aba de detalhe.
 */

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UploadDocumento } from '@/components/patterns';
import type { UploadDocumentoMeta, RegistoResultado } from '@/components/patterns';
import {
  adicionarDocumentoViaturaAction,
  adicionarDocumentoMotoristaAction,
} from '@/server/actions/transporte.actions';

interface TipoOpcao {
  value: string;
  label: string;
}

interface DocumentoUploadFormProps {
  recurso: 'viatura' | 'motorista';
  recursoId: string;
  tipos: TipoOpcao[];
}

export function DocumentoUploadForm({ recurso, recursoId, tipos }: DocumentoUploadFormProps) {
  const [tipo, setTipo] = useState(tipos[0]?.value ?? '');
  const [numero, setNumero] = useState('');
  const [dataEmissao, setDataEmissao] = useState('');
  const [dataValidade, setDataValidade] = useState('');
  const [entidadeEmissora, setEntidadeEmissora] = useState('');

  async function onRegistado(meta: UploadDocumentoMeta): Promise<RegistoResultado> {
    if (!tipo || !numero.trim() || !dataEmissao || !dataValidade || !entidadeEmissora.trim()) {
      return { ok: false, error: { message: 'Preencha tipo, número, datas e entidade emissora antes de carregar.' } };
    }

    if (recurso === 'viatura') {
      return adicionarDocumentoViaturaAction({
        viaturaId: recursoId,
        tipo: tipo as 'LIVRETE' | 'INSPECAO' | 'SEGURO' | 'LICENCA' | 'MANIFESTO' | 'TAXA_RADIO' | 'OUTRO',
        numero: numero.trim(),
        dataEmissao: new Date(dataEmissao),
        dataValidade: new Date(dataValidade),
        entidadeEmissora: entidadeEmissora.trim(),
        anexo: meta.urlRef,
      });
    }

    return adicionarDocumentoMotoristaAction({
      motoristaId: recursoId,
      tipo: tipo as 'CARTA_CONDUCAO' | 'BI' | 'OUTRO',
      numero: numero.trim(),
      dataEmissao: new Date(dataEmissao),
      dataValidade: new Date(dataValidade),
      entidadeEmissora: entidadeEmissora.trim(),
      anexo: meta.urlRef,
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="doc-tipo">Tipo de Documento *</Label>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger id="doc-tipo"><SelectValue /></SelectTrigger>
            <SelectContent>
              {tipos.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="doc-numero">Número *</Label>
          <Input id="doc-numero" value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={100} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="doc-emissao">Data de Emissão *</Label>
          <Input id="doc-emissao" type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="doc-validade">Data de Validade *</Label>
          <Input id="doc-validade" type="date" value={dataValidade} onChange={(e) => setDataValidade(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="doc-emitente">Entidade Emissora *</Label>
          <Input id="doc-emitente" value={entidadeEmissora} onChange={(e) => setEntidadeEmissora(e.target.value)} maxLength={200} />
        </div>
      </div>

      <UploadDocumento
        recurso={recurso}
        recursoId={recursoId}
        label="Carregar ficheiro do documento"
        onRegistado={onRegistado}
      />
    </div>
  );
}
