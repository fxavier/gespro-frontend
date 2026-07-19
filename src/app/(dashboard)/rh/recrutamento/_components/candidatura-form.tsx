'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { CandidatoSchema } from '@/lib/validations/recrutamento';
import type { CandidatoInput } from '@/lib/validations/recrutamento';
import { criarCandidatoAction, candidatarAction } from '@/server/actions/recrutamento.actions';
import { FormSection } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface CandidaturaFormProps {
  vagaId: string;
}

export function CandidaturaForm({ vagaId }: CandidaturaFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fonte, setFonte] = useState('');
  const [pretensaoSalarial, setPretensaoSalarial] = useState('');

  const form = useForm<CandidatoInput>({
    resolver: zodResolver(CandidatoSchema),
    defaultValues: {},
  });

  const { register, handleSubmit, formState: { errors } } = form;

  function onSubmit(data: CandidatoInput) {
    startTransition(async () => {
      // 1. Criar/verificar candidato
      const candidatoResult = await criarCandidatoAction(data);
      if (!candidatoResult.ok) {
        toast.error(candidatoResult.error.message ?? 'Erro ao registar candidato');
        return;
      }

      // 2. Candidatar à vaga
      const candidaturaResult = await candidatarAction({
        vagaId,
        candidatoId: candidatoResult.data.id,
        fonte: fonte || undefined,
        pretensaoSalarial: pretensaoSalarial ? parseFloat(pretensaoSalarial) : undefined,
      });

      if (candidaturaResult.ok) {
        toast.success('Candidatura registada com sucesso');
        router.push(`/rh/recrutamento/candidaturas/${candidaturaResult.data.id}`);
      } else {
        toast.error(candidaturaResult.error.message ?? 'Erro ao registar candidatura');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 max-w-2xl">
      <FormSection title="Dados do Candidato" description="Informações pessoais e de contacto">
        <div className="grid gap-4">
          <div className="space-y-1">
            <Label htmlFor="nome">Nome Completo <span className="text-destructive">*</span></Label>
            <Input id="nome" placeholder="Nome completo do candidato" {...register('nome')} />
            {errors.nome && <p className="text-sm text-destructive">{errors.nome.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
              <Input id="email" type="email" placeholder="candidato@exemplo.mz" {...register('email')} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="telefone">Telefone <span className="text-destructive">*</span></Label>
              <Input id="telefone" placeholder="84 123 4567" {...register('telefone')} />
              {errors.telefone && <p className="text-sm text-destructive">{errors.telefone.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="bi">BI (opcional)</Label>
              <Input id="bi" placeholder="110100123456A" {...register('bi')} />
              {errors.bi && <p className="text-sm text-destructive">{errors.bi.message}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="nuit">NUIT (opcional)</Label>
              <Input id="nuit" placeholder="123456789" {...register('nuit')} />
              {errors.nuit && <p className="text-sm text-destructive">{errors.nuit.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea id="observacoes" rows={3} {...register('observacoes')} />
          </div>
        </div>
      </FormSection>

      <FormSection title="Candidatura" description="Dados específicos desta candidatura">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="fonte">Fonte / Origem</Label>
            <Input
              id="fonte"
              placeholder="ex: LinkedIn, Referência, Site…"
              value={fonte}
              onChange={(e) => setFonte(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="pretensaoSalarial">Pretensão Salarial (MZN)</Label>
            <Input
              id="pretensaoSalarial"
              type="number"
              min={0}
              placeholder="ex: 35000"
              value={pretensaoSalarial}
              onChange={(e) => setPretensaoSalarial(e.target.value)}
            />
          </div>
        </div>
      </FormSection>

      <div className="flex items-center justify-end gap-3 pt-4 border-t">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'A registar…' : 'Registar Candidatura'}
        </Button>
      </div>
    </form>
  );
}
