'use client';

/**
 * Formulário de Motorista — Client Component (criar + editar).
 * Padrão golden standard: useTransition + Server Action, sem Dialog.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  criarMotoristaAction,
  atualizarMotoristaAction,
} from '@/server/actions/transporte.actions';

export interface MotoristaFormValores {
  id: string;
  nomeCompleto: string;
  contacto: string;
  morada: string | null;
  numeroBI: string | null;
  numeroCarta: string;
  categoriaCarta: string[];
  dataEmissaoCarta: string; // yyyy-mm-dd
  validadeCarta: string; // yyyy-mm-dd
  localActividade: string | null;
  observacoes: string | null;
}

interface MotoristaFormProps {
  motorista?: MotoristaFormValores;
}

export function MotoristaForm({ motorista }: MotoristaFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const edicao = Boolean(motorista);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);

    const categoriaCarta = (data.get('categoriaCarta') as string)
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);

    if (categoriaCarta.length === 0) {
      toast.error('Indique pelo menos uma categoria de carta.');
      return;
    }

    const base = {
      nomeCompleto: (data.get('nomeCompleto') as string).trim(),
      contacto: (data.get('contacto') as string).trim(),
      morada: (data.get('morada') as string)?.trim() || undefined,
      numeroBI: (data.get('numeroBI') as string)?.trim() || undefined,
      numeroCarta: (data.get('numeroCarta') as string).trim(),
      categoriaCarta,
      dataEmissaoCarta: new Date(data.get('dataEmissaoCarta') as string),
      validadeCarta: new Date(data.get('validadeCarta') as string),
      localActividade: (data.get('localActividade') as string)?.trim() || undefined,
      observacoes: (data.get('observacoes') as string)?.trim() || undefined,
    };

    startTransition(async () => {
      const result = edicao
        ? await atualizarMotoristaAction({ id: motorista!.id, ...base })
        : await criarMotoristaAction(base);

      if (result.ok) {
        toast.success(edicao ? 'Motorista atualizado.' : 'Motorista registado.');
        router.push(`/transporte/motoristas/${result.data.id}`);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao guardar motorista.');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      <Card>
        <CardContent className="p-5 space-y-4">
          <p className="font-medium text-sm">Dados Pessoais</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="nomeCompleto">Nome Completo *</Label>
              <Input id="nomeCompleto" name="nomeCompleto" required minLength={2} maxLength={200} defaultValue={motorista?.nomeCompleto} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contacto">Contacto *</Label>
              <Input id="contacto" name="contacto" required minLength={9} maxLength={30} defaultValue={motorista?.contacto} placeholder="+258 84 000 0000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="numeroBI">Nº do BI</Label>
              <Input id="numeroBI" name="numeroBI" maxLength={20} defaultValue={motorista?.numeroBI ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="localActividade">Local de Actividade</Label>
              <Input id="localActividade" name="localActividade" maxLength={200} defaultValue={motorista?.localActividade ?? ''} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="morada">Morada</Label>
              <Input id="morada" name="morada" maxLength={500} defaultValue={motorista?.morada ?? ''} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-4">
          <p className="font-medium text-sm">Carta de Condução</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="numeroCarta">Número da Carta *</Label>
              <Input id="numeroCarta" name="numeroCarta" required maxLength={50} defaultValue={motorista?.numeroCarta} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="categoriaCarta">Categorias * (separadas por vírgula)</Label>
              <Input id="categoriaCarta" name="categoriaCarta" required defaultValue={motorista?.categoriaCarta.join(', ')} placeholder="B, C, D" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dataEmissaoCarta">Data de Emissão *</Label>
              <Input id="dataEmissaoCarta" name="dataEmissaoCarta" type="date" required defaultValue={motorista?.dataEmissaoCarta} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="validadeCarta">Validade *</Label>
              <Input id="validadeCarta" name="validadeCarta" type="date" required defaultValue={motorista?.validadeCarta} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea id="observacoes" name="observacoes" maxLength={1000} rows={3} defaultValue={motorista?.observacoes ?? ''} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'A guardar…' : edicao ? 'Guardar Alterações' : 'Registar Motorista'}
        </Button>
        <Button type="button" variant="outline" asChild disabled={pending}>
          <Link href={edicao ? `/transporte/motoristas/${motorista!.id}` : '/transporte/motoristas'}>Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
