'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import { ProjetoStorage } from '@/lib/storage/projeto-storage';
import { Projeto } from '@/types/projeto';
import { toast } from 'sonner';
import { ArrowLeft, Save } from 'lucide-react';

export default function NovoProjetoPage() {
  const router = useRouter();

  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tipo, setTipo] = useState<Projeto['tipo']>('interno');
  const [status, setStatus] = useState<Projeto['status']>('planejamento');
  const [prioridade, setPrioridade] = useState<Projeto['prioridade']>('media');
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().slice(0, 10));
  const [dataFimPrevista, setDataFimPrevista] = useState(
    new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10)
  );
  const [orcamentoPlanejado, setOrcamentoPlanejado] = useState('0');
  const [horasEstimadas, setHorasEstimadas] = useState('0');
  const [gerenteNome, setGerenteNome] = useState('');
  const [tags, setTags] = useState('');

  const handleSubmit = () => {
    if (!nome || !codigo || !gerenteNome) {
      toast.error('Preencha Nome, Código e Gerente do projeto.');
      return;
    }

    const planejado = Number(orcamentoPlanejado) || 0;
    const horasEst = Number(horasEstimadas) || 0;
    const agora = new Date().toISOString();

    const novoProjeto: Projeto = {
      id: `proj-${Date.now()}`,
      tenantId: 'default',
      codigo,
      nome,
      descricao,
      clienteId: undefined,
      clienteNome: undefined,
      tipo,
      status,
      prioridade,
      dataInicio,
      dataFimPrevista,
      progresso: 0,
      orcamento: {
        planejado,
        utilizado: 0,
        restante: planejado,
      },
      horas: {
        estimadas: horasEst,
        trabalhadas: 0,
        restantes: horasEst,
      },
      gerenteId: `ger-${gerenteNome.toLowerCase().replace(/\s+/g, '-')}`,
      gerenteNome,
      equipeIds: [],
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      observacoes: '',
      dataCriacao: agora,
      dataAtualizacao: agora,
    };

    ProjetoStorage.addProjeto(novoProjeto);
    toast.success('Projeto criado com sucesso.');
    router.push('/projetos/lista');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Novo Projeto</h1>
          <p className="text-muted-foreground mt-1">
            Cadastre rapidamente um projeto para começar a acompanhar tarefas e cronograma.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.back()} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados do Projeto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Projeto Nova Plataforma" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="codigo">Código *</Label>
              <Input id="codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="PRJ-001" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as Projeto['tipo'])}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="interno">Interno</SelectItem>
                  <SelectItem value="externo">Externo</SelectItem>
                  <SelectItem value="pesquisa">Pesquisa</SelectItem>
                  <SelectItem value="desenvolvimento">Desenvolvimento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Projeto['status'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planejamento">Planejamento</SelectItem>
                  <SelectItem value="em_andamento">Em andamento</SelectItem>
                  <SelectItem value="pausado">Pausado</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                  <SelectItem value="arquivado">Arquivado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={(v) => setPrioridade(v as Projeto['prioridade'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="critica">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data de início</Label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data fim prevista</Label>
              <Input type="date" value={dataFimPrevista} onChange={(e) => setDataFimPrevista(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Orçamento planejado (MT)</Label>
              <Input
                type="number"
                min="0"
                value={orcamentoPlanejado}
                onChange={(e) => setOrcamentoPlanejado(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Horas estimadas</Label>
              <Input type="number" min="0" value={horasEstimadas} onChange={(e) => setHorasEstimadas(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Gerente *</Label>
              <Input value={gerenteNome} onChange={(e) => setGerenteNome(e.target.value)} placeholder="Maria Santos" />
            </div>
            <div className="space-y-2">
              <Label>Tags (separadas por vírgula)</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="mobile, entrega rápida" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              rows={4}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Contexto, objetivos e premissas do projeto."
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => router.push('/projetos/lista')}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} className="gap-2">
              <Save className="h-4 w-4" />
              Salvar Projeto
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
