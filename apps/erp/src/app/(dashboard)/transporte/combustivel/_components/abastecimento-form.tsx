'use client';

/**
 * Formulário de Abastecimento — Client Component.
 * valorTotal é calculado automaticamente (litros × valor/litro) para satisfazer
 * a regra do serviço (|valorTotal − litros·valorLitro| < 0.1).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FormPage, FormSection, Combobox } from '@/components/patterns';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { registarAbastecimentoAction } from '@/server/actions/transporte.actions';
import { RegistarAbastecimentoSchema } from '@/lib/validations/transporte';

interface Opcao {
  id: string;
  label: string;
}

interface AbastecimentoFormProps {
  viaturas: Opcao[];
  motoristas: Opcao[];
}

const COMBUSTIVEIS = [
  { value: 'GASOLINA', label: 'Gasolina' },
  { value: 'DIESEL', label: 'Diesel' },
  { value: 'ETANOL', label: 'Etanol' },
  { value: 'GNV', label: 'Gás Natural (GNV)' },
];

export function AbastecimentoForm({ viaturas, motoristas }: AbastecimentoFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [litros, setLitros] = useState(0);
  const [valorLitro, setValorLitro] = useState(0);

  const valorTotal = Number((litros * valorLitro).toFixed(2));

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const viaturaId = data.get('viaturaId') as string;
    const motoristaId = data.get('motoristaId') as string;

    if (!viaturaId || !motoristaId) {
      toast.error('Viatura e motorista são obrigatórios.');
      return;
    }
    if (litros <= 0 || valorLitro <= 0) {
      toast.error('Litros e valor/litro devem ser positivos.');
      return;
    }

    const kmPercorridoRaw = data.get('kmPercorrido') as string;

    // Valida no cliente com o schema partilhado (inclui a regra valorTotal ≈ litros×valor/litro).
    const parsed = RegistarAbastecimentoSchema.safeParse({
      viaturaId,
      motoristaId,
      data: new Date(data.get('data') as string),
      kmVeiculo: Number(data.get('kmVeiculo')),
      tipoCombustivel: data.get('tipoCombustivel') as string,
      litros,
      valorLitro,
      valorTotal,
      posto: (data.get('posto') as string)?.trim() || undefined,
      notaFiscal: (data.get('notaFiscal') as string)?.trim() || undefined,
      kmPercorrido: kmPercorridoRaw ? Number(kmPercorridoRaw) : undefined,
      observacoes: (data.get('observacoes') as string)?.trim() || undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }

    startTransition(async () => {
      const result = await registarAbastecimentoAction(parsed.data);

      if (result.ok) {
        toast.success('Abastecimento registado.');
        router.push('/transporte/combustivel');
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao registar abastecimento.');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" asChild disabled={pending}>
              <Link href="/transporte/combustivel">Cancelar</Link>
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'A registar…' : 'Registar Abastecimento'}
            </Button>
          </>
        }
      >
      <FormSection title="Viatura e Motorista">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="viaturaId">Viatura *</Label>
              <Combobox
                id="viaturaId"
                name="viaturaId"
                placeholder="Seleccione a viatura"
                options={viaturas.map((v) => ({ value: v.id, label: v.label }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="motoristaId">Motorista *</Label>
              <Combobox
                id="motoristaId"
                name="motoristaId"
                placeholder="Seleccione o motorista"
                options={motoristas.map((m) => ({ value: m.id, label: m.label }))}
              />
            </div>
          </div>
      </FormSection>

      <FormSection title="Abastecimento">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="data">Data *</Label>
              <Input id="data" name="data" type="date" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tipoCombustivel">Combustível *</Label>
              <Select name="tipoCombustivel" defaultValue="DIESEL">
                <SelectTrigger id="tipoCombustivel"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMBUSTIVEIS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kmVeiculo">KM do Veículo *</Label>
              <Input id="kmVeiculo" name="kmVeiculo" type="number" min={0} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="litros">Litros *</Label>
              <Input id="litros" name="litros" type="number" min={0.01} step="0.01" required value={litros || ''} onChange={(e) => setLitros(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valorLitro">Valor/Litro (MZN) *</Label>
              <Input id="valorLitro" name="valorLitro" type="number" min={0.01} step="0.01" required value={valorLitro || ''} onChange={(e) => setValorLitro(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valorTotal">Valor Total (MZN)</Label>
              <Input id="valorTotal" value={valorTotal.toFixed(2)} readOnly tabIndex={-1} className="bg-muted/40" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kmPercorrido">KM Percorridos (desde o último)</Label>
              <Input id="kmPercorrido" name="kmPercorrido" type="number" min={0} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="posto">Posto</Label>
              <Input id="posto" name="posto" maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notaFiscal">Nota Fiscal</Label>
              <Input id="notaFiscal" name="notaFiscal" maxLength={100} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea id="observacoes" name="observacoes" maxLength={1000} rows={2} />
          </div>
      </FormSection>

      </FormPage>
    </form>
  );
}
