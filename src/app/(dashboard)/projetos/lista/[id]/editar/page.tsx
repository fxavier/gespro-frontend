
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { ProjetoStorage } from '@/lib/storage/projeto-storage';
import { Projeto } from '@/types/projeto';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function EditarProjetoPage() {
  const params = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    codigo: '',
    descricao: '',
    clienteNome: '',
    tipo: 'interno' as 'interno' | 'externo' | 'pesquisa' | 'desenvolvimento',
    status: 'planejamento' as 'planejamento' | 'em_andamento' | 'pausado' | 'concluido' | 'cancelado' | 'arquivado',
    prioridade: 'media' as 'baixa' | 'media' | 'alta' | 'critica',
    dataInicio: '',
    dataFimPrevista: '',
    gerenteNome: '',
    progresso: 0,
    orcamentoPlanejado: '0',
  });

  useEffect(() => {
    const projetoId = params.id as string;
    const projetoData = ProjetoStorage.getProjetoById(projetoId);
    if (projetoData) {
      setProjeto(projetoData);
      setFormData({
        nome: projetoData.nome,
        codigo: projetoData.codigo,
        descricao: projetoData.descricao || '',
        clienteNome: projetoData.clienteNome || '',
        tipo: projetoData.tipo,
        status: projetoData.status,
        prioridade: projetoData.prioridade,
        dataInicio: projetoData.dataInicio,
        dataFimPrevista: projetoData.dataFimPrevista,
        gerenteNome: projetoData.gerenteNome,
        progresso: projetoData.progresso,
        orcamentoPlanejado: projetoData.orcamento.planejado.toString(),
      });
    }
    setLoading(false);
  }, [params.id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (!projeto) return;

      ProjetoStorage.updateProjeto(projeto.id, {
        nome: formData.nome,
        codigo: formData.codigo,
        descricao: formData.descricao,
        clienteNome: formData.clienteNome,
        tipo: formData.tipo,
        status: formData.status,
        prioridade: formData.prioridade,
        dataInicio: formData.dataInicio,
        dataFimPrevista: formData.dataFimPrevista,
        gerenteNome: formData.gerenteNome,
        progresso: formData.progresso,
        orcamento: {
          planejado: parseFloat(formData.orcamentoPlanejado) || 0,
          utilizado: projeto.orcamento.utilizado,
          restante: (parseFloat(formData.orcamentoPlanejado) || 0) - projeto.orcamento.utilizado,
        },
      });

      toast.success('Projeto atualizado com sucesso');
      router.push(`/projetos/lista/${projeto.id}`);
    } catch (error) {
      toast.error('Erro ao atualizar projeto');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="container mx-auto p-6">Carregando...</div>;
  }

  if (!projeto) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Projeto não encontrado</h2>
          <Button asChild>
            <Link href="/projetos/lista">Voltar para lista</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href={`/projetos/lista/${projeto.id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">Editar Projeto</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informações do Projeto</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="codigo">Código</Label>
                <Input
                  id="codigo"
                  name="codigo"
                  value={formData.codigo}
                  onChange={handleChange}
                  disabled
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nome">Nome do Projeto</Label>
                <Input
                  id="nome"
                  name="nome"
                  value={formData.nome}
                  onChange={handleChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clienteNome">Cliente</Label>
                <Input
                  id="clienteNome"
                  name="clienteNome"
                  value={formData.clienteNome}
                  onChange={handleChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gerenteNome">Gerente do Projeto</Label>
                <Input
                  id="gerenteNome"
                  name="gerenteNome"
                  value={formData.gerenteNome}
                  onChange={handleChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo de Projeto</Label>
                <Select value={formData.tipo} onValueChange={(value) => handleSelectChange('tipo', value)}>
                  <SelectTrigger>
                    <SelectValue />
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
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status} onValueChange={(value) => handleSelectChange('status', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planejamento">Planejamento</SelectItem>
                    <SelectItem value="em_andamento">Em Andamento</SelectItem>
                    <SelectItem value="pausado">Pausado</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                    <SelectItem value="arquivado">Arquivado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="prioridade">Prioridade</Label>
                <Select value={formData.prioridade} onValueChange={(value) => handleSelectChange('prioridade', value)}>
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

              <div className="space-y-2">
                <Label htmlFor="progresso">Progresso (%)</Label>
                <Input
                  id="progresso"
                  name="progresso"
                  type="number"
                  min="0"
                  max="100"
                  value={formData.progresso}
                  onChange={handleChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dataInicio">Data de Início</Label>
                <Input
                  id="dataInicio"
                  name="dataInicio"
                  type="date"
                  value={formData.dataInicio}
                  onChange={handleChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dataFimPrevista">Data de Conclusão Prevista</Label>
                <Input
                  id="dataFimPrevista"
                  name="dataFimPrevista"
                  type="date"
                  value={formData.dataFimPrevista}
                  onChange={handleChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="orcamentoPlanejado">Orçamento Planejado (MT)</Label>
                <Input
                  id="orcamentoPlanejado"
                  name="orcamentoPlanejado"
                  type="number"
                  value={formData.orcamentoPlanejado}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea
                id="descricao"
                name="descricao"
                value={formData.descricao}
                onChange={handleChange}
                rows={4}
              />
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href={`/projetos/lista/${projeto.id}`}>Cancelar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
