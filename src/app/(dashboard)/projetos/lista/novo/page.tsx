
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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

export default function NovoProjeto() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nome: '',
    codigo: '',
    descricao: '',
    clienteNome: '',
    tipo: 'interno' as const,
    status: 'planejamento' as const,
    prioridade: 'media' as const,
    dataInicio: new Date().toISOString().split('T')[0],
    dataFimPrevista: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    gerenteNome: '',
    orcamentoPlanejado: '0',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.nome || !formData.codigo || !formData.gerenteNome) {
        toast.error('Preencha todos os campos obrigatórios');
        setLoading(false);
        return;
      }

      const novoProjeto: Projeto = {
        id: `proj_${Date.now()}`,
        tenantId: 'default',
        codigo: formData.codigo,
        nome: formData.nome,
        descricao: formData.descricao,
        clienteNome: formData.clienteNome,
        tipo: formData.tipo,
        status: formData.status,
        prioridade: formData.prioridade,
        dataInicio: formData.dataInicio,
        dataFimPrevista: formData.dataFimPrevista,
        progresso: 0,
        orcamento: {
          planejado: parseFloat(formData.orcamentoPlanejado) || 0,
          utilizado: 0,
          restante: parseFloat(formData.orcamentoPlanejado) || 0,
        },
        horas: {
          estimadas: 0,
          trabalhadas: 0,
          restantes: 0,
        },
        gerenteId: `gerente_${Date.now()}`,
        gerenteNome: formData.gerenteNome,
        equipeIds: [],
        dataCriacao: new Date().toISOString(),
        dataAtualizacao: new Date().toISOString(),
      };

      ProjetoStorage.addProjeto(novoProjeto);
      toast.success('Projeto criado com sucesso');
      router.push('/projetos/lista');
    } catch (error) {
      toast.error('Erro ao criar projeto');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/projetos/lista">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">Novo Projeto</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informações Básicas</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="codigo">Código *</Label>
                <Input
                  id="codigo"
                  name="codigo"
                  value={formData.codigo}
                  onChange={handleChange}
                  placeholder="Ex: PROJ-001"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nome">Nome do Projeto *</Label>
                <Input
                  id="nome"
                  name="nome"
                  value={formData.nome}
                  onChange={handleChange}
                  placeholder="Ex: Sistema de Gestão"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clienteNome">Cliente</Label>
                <Input
                  id="clienteNome"
                  name="clienteNome"
                  value={formData.clienteNome}
                  onChange={handleChange}
                  placeholder="Nome do cliente"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gerenteNome">Gerente do Projeto *</Label>
                <Input
                  id="gerenteNome"
                  name="gerenteNome"
                  value={formData.gerenteNome}
                  onChange={handleChange}
                  placeholder="Nome do gerente"
                  required
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
                  placeholder="0"
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
                placeholder="Descrição do projeto"
                rows={4}
              />
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                {loading ? 'Criando...' : 'Criar Projeto'}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/projetos/lista">Cancelar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
