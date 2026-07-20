'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { AdmitirSchema } from '@/lib/validations/recrutamento';
import type { AdmitirInput } from '@/lib/validations/recrutamento';
import { admitirAction } from '@/server/actions/recrutamento.actions';
import { FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AdmitirFormProps {
  candidaturaId: string;
  candidato: {
    nome: string;
    email: string;
    telefone: string;
    bi?: string;
    nuit?: string;
  };
  vaga: {
    titulo: string;
    regimeTrabalho: string;
    tipoContrato: string;
  };
}

export function AdmitirForm({ candidaturaId, candidato, vaga }: AdmitirFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<AdmitirInput>({
    resolver: zodResolver(AdmitirSchema),
    defaultValues: {
      candidaturaId,
      nome: candidato.nome,
      email: candidato.email,
      telefone: candidato.telefone,
      bi: candidato.bi ?? '',
      nuit: candidato.nuit ?? '',
      regimeTrabalho: (vaga.regimeTrabalho as AdmitirInput['regimeTrabalho']) ?? 'TEMPO_INTEGRAL',
      tipoContrato: (vaga.tipoContrato as AdmitirInput['tipoContrato']) ?? 'EFECTIVO',
      nivelAcesso: 'USUARIO',
      nacionalidade: 'Moçambicana',
      estadoCivil: 'SOLTEIRO',
      genero: 'MASCULINO',
    },
  });

  const { register, handleSubmit, formState: { errors, isDirty }, setValue, watch } = form;

  function onSubmit(data: AdmitirInput) {
    startTransition(async () => {
      const result = await admitirAction(data);
      if (result.ok) {
        toast.success('Colaborador criado com sucesso!');
        router.push(`/rh/colaboradores/${result.data.colaboradorId}`);
      } else {
        toast.error(result.error.message ?? 'Erro ao admitir colaborador');
      }
    });
  }

  return (
    <div className="space-y-8">
      <UnsavedChangesGuard isDirty={isDirty} />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        <input type="hidden" {...register('candidaturaId')} />

        <FormSection title="Identificação" description="Dados pessoais e documentos de identidade">
          <div className="grid gap-4">
            <div className="space-y-1">
              <Label htmlFor="nome">Nome Completo <span className="text-destructive">*</span></Label>
              <Input id="nome" {...register('nome')} />
              {errors.nome && <p className="text-sm text-destructive">{errors.nome.message}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label htmlFor="codigo">Código de Colaborador <span className="text-destructive">*</span></Label>
                <Input id="codigo" placeholder="ex: COL-001" {...register('codigo')} />
                {errors.codigo && <p className="text-sm text-destructive">{errors.codigo.message}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="bi">BI <span className="text-destructive">*</span></Label>
                <Input id="bi" placeholder="110100123456A" {...register('bi')} />
                {errors.bi && <p className="text-sm text-destructive">{errors.bi.message}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="nuit">NUIT <span className="text-destructive">*</span></Label>
                <Input id="nuit" placeholder="123456789" {...register('nuit')} />
                {errors.nuit && <p className="text-sm text-destructive">{errors.nuit.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label htmlFor="dataNascimento">Data de Nascimento <span className="text-destructive">*</span></Label>
                <Input id="dataNascimento" type="date" {...register('dataNascimento')} />
                {errors.dataNascimento && <p className="text-sm text-destructive">{errors.dataNascimento.message}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="genero">Género <span className="text-destructive">*</span></Label>
                <Select value={watch('genero')} onValueChange={(v) => setValue('genero', v as AdmitirInput['genero'])}>
                  <SelectTrigger id="genero"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MASCULINO">Masculino</SelectItem>
                    <SelectItem value="FEMININO">Feminino</SelectItem>
                    <SelectItem value="OUTRO">Outro</SelectItem>
                  </SelectContent>
                </Select>
                {errors.genero && <p className="text-sm text-destructive">{errors.genero.message}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="estadoCivil">Estado Civil <span className="text-destructive">*</span></Label>
                <Select value={watch('estadoCivil')} onValueChange={(v) => setValue('estadoCivil', v as AdmitirInput['estadoCivil'])}>
                  <SelectTrigger id="estadoCivil"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SOLTEIRO">Solteiro(a)</SelectItem>
                    <SelectItem value="CASADO">Casado(a)</SelectItem>
                    <SelectItem value="DIVORCIADO">Divorciado(a)</SelectItem>
                    <SelectItem value="VIUVO">Viúvo(a)</SelectItem>
                    <SelectItem value="UNIAO_FACTO">União de Facto</SelectItem>
                  </SelectContent>
                </Select>
                {errors.estadoCivil && <p className="text-sm text-destructive">{errors.estadoCivil.message}</p>}
              </div>
            </div>
          </div>
        </FormSection>

        <FormSection title="Naturalidade e Nacionalidade" description="">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label htmlFor="nacionalidade">Nacionalidade <span className="text-destructive">*</span></Label>
              <Input id="nacionalidade" {...register('nacionalidade')} />
              {errors.nacionalidade && <p className="text-sm text-destructive">{errors.nacionalidade.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="naturalidadeProvincia">Província de Naturalidade <span className="text-destructive">*</span></Label>
              <Input id="naturalidadeProvincia" {...register('naturalidadeProvincia')} />
              {errors.naturalidadeProvincia && <p className="text-sm text-destructive">{errors.naturalidadeProvincia.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="naturalidadeDistrito">Distrito de Naturalidade <span className="text-destructive">*</span></Label>
              <Input id="naturalidadeDistrito" {...register('naturalidadeDistrito')} />
              {errors.naturalidadeDistrito && <p className="text-sm text-destructive">{errors.naturalidadeDistrito.message}</p>}
            </div>
          </div>
        </FormSection>

        <FormSection title="Contactos" description="Email, telefone e endereço">
          <div className="grid gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
                <Input id="email" type="email" {...register('email')} />
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="telefone">Telefone <span className="text-destructive">*</span></Label>
                <Input id="telefone" {...register('telefone')} />
                {errors.telefone && <p className="text-sm text-destructive">{errors.telefone.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="enderecoRua">Rua <span className="text-destructive">*</span></Label>
                <Input id="enderecoRua" {...register('enderecoRua')} />
                {errors.enderecoRua && <p className="text-sm text-destructive">{errors.enderecoRua.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="enderecoNumero">Número <span className="text-destructive">*</span></Label>
                <Input id="enderecoNumero" {...register('enderecoNumero')} />
                {errors.enderecoNumero && <p className="text-sm text-destructive">{errors.enderecoNumero.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="enderecoBairro">Bairro <span className="text-destructive">*</span></Label>
                <Input id="enderecoBairro" {...register('enderecoBairro')} />
                {errors.enderecoBairro && <p className="text-sm text-destructive">{errors.enderecoBairro.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="enderecoCidade">Cidade <span className="text-destructive">*</span></Label>
                <Input id="enderecoCidade" {...register('enderecoCidade')} />
                {errors.enderecoCidade && <p className="text-sm text-destructive">{errors.enderecoCidade.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="enderecoProvincia">Província <span className="text-destructive">*</span></Label>
                <Input id="enderecoProvincia" {...register('enderecoProvincia')} />
                {errors.enderecoProvincia && <p className="text-sm text-destructive">{errors.enderecoProvincia.message}</p>}
              </div>
            </div>
          </div>
        </FormSection>

        <FormSection title="Contacto de Emergência" description="">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label htmlFor="emergenciaNome">Nome <span className="text-destructive">*</span></Label>
              <Input id="emergenciaNome" {...register('emergenciaNome')} />
              {errors.emergenciaNome && <p className="text-sm text-destructive">{errors.emergenciaNome.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="emergenciaParentesco">Parentesco <span className="text-destructive">*</span></Label>
              <Input id="emergenciaParentesco" placeholder="ex: Cônjuge, Pai, Mãe…" {...register('emergenciaParentesco')} />
              {errors.emergenciaParentesco && <p className="text-sm text-destructive">{errors.emergenciaParentesco.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="emergenciaTelefone">Telefone <span className="text-destructive">*</span></Label>
              <Input id="emergenciaTelefone" {...register('emergenciaTelefone')} />
              {errors.emergenciaTelefone && <p className="text-sm text-destructive">{errors.emergenciaTelefone.message}</p>}
            </div>
          </div>
        </FormSection>

        <FormSection title="Contrato e Remuneração" description="">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label htmlFor="dataAdmissao">Data de Admissão <span className="text-destructive">*</span></Label>
              <Input id="dataAdmissao" type="date" {...register('dataAdmissao')} />
              {errors.dataAdmissao && <p className="text-sm text-destructive">{errors.dataAdmissao.message}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="tipoContrato">Tipo de Contrato <span className="text-destructive">*</span></Label>
              <Select value={watch('tipoContrato')} onValueChange={(v) => setValue('tipoContrato', v as AdmitirInput['tipoContrato'])}>
                <SelectTrigger id="tipoContrato"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EFECTIVO">Efectivo</SelectItem>
                  <SelectItem value="TERMO_CERTO">Termo Certo</SelectItem>
                  <SelectItem value="ESTAGIO">Estágio</SelectItem>
                  <SelectItem value="TEMPORARIO">Temporário</SelectItem>
                  <SelectItem value="PRESTACAO_SERVICOS">Prestação de Serviços</SelectItem>
                </SelectContent>
              </Select>
              {errors.tipoContrato && <p className="text-sm text-destructive">{errors.tipoContrato.message}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="regimeTrabalho">Regime <span className="text-destructive">*</span></Label>
              <Select value={watch('regimeTrabalho')} onValueChange={(v) => setValue('regimeTrabalho', v as AdmitirInput['regimeTrabalho'])}>
                <SelectTrigger id="regimeTrabalho"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEMPO_INTEGRAL">Tempo Integral</SelectItem>
                  <SelectItem value="TEMPO_PARCIAL">Tempo Parcial</SelectItem>
                </SelectContent>
              </Select>
              {errors.regimeTrabalho && <p className="text-sm text-destructive">{errors.regimeTrabalho.message}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="salarioBase">Salário Base (MZN) <span className="text-destructive">*</span></Label>
              <Input id="salarioBase" type="number" min={0} {...register('salarioBase')} />
              {errors.salarioBase && <p className="text-sm text-destructive">{errors.salarioBase.message}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="subsidioAlimentacao">Subsídio Alimentação (MZN)</Label>
              <Input id="subsidioAlimentacao" type="number" min={0} {...register('subsidioAlimentacao')} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="subsidioTransporte">Subsídio Transporte (MZN)</Label>
              <Input id="subsidioTransporte" type="number" min={0} {...register('subsidioTransporte')} />
            </div>
          </div>
        </FormSection>

        <div className="flex items-center justify-end gap-3 pt-4 border-t sticky bottom-0 bg-background py-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'A processar admissão…' : 'Confirmar Admissão'}
          </Button>
        </div>
      </form>
    </div>
  );
}
