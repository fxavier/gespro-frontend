
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
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { Servico } from '@/types/servico';

export default function NovoServicoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<Servico>>(
    {
      codigo: '',
      nome: '',
      descricao: '',
      categoria: '',
      preco: 0,
      duracaoEstimada: 60,
      unidadeMedida: 'Hora',
      taxaIva: 16,
      ativo: true,
      observacoes: '',
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.codigo || !formData.nome || !formData.categoria) {
        toast.error('Por favor, preencha todos os campos obrigatórios');
        return;
      }

      const novoServico: Servico = {
        id: Date.now().toString(),
        tenantId: '1',
        codigo: formData.codigo!,
        nome: formData.nome!,
        descricao: formData.descricao,
        categoria: formData.categoria!,
        preco: formData.preco || 0,
        duracaoEstimada: formData.duracaoEstimada || 60,
        unidadeMedida: formData.unidadeMedida || 'Hora',
        taxaIva: formData.taxaIva || 16,
        ativo: formData.ativo ?? true,
        observacoes: formData.observacoes,
        tipoServico: 'outro',
        incluiMaterial: false,
        requerAgendamento: false,
        requerTecnico: false,
        disponivel: true,
        diasDisponibilidade: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
        totalVendas: 0,
        faturamentoTotal: 0,
        dataCriacao: new Date().toISOString(),
        dataAtualizacao: new Date().toISOString(),
      };

      const servicosExistentes = JSON.parse(localStorage.getItem('servicos') || '[]');
      servicosExistentes.push(novoServico);
      localStorage.setItem('servicos', JSON.stringify(servicosExistentes));

      toast.success('Serviço criado com sucesso!');
      router.push('/servicos');
    } catch (error) {
      toast.error('Erro ao criar serviço');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Novo Serviço</h1>
          <p className="text-muted-foreground">Criar um novo serviço no sistema</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Informações Básicas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="codigo">Código *</Label>
                    <Input
                      id="codigo"
                      placeholder="SRV001"
                      value={formData.codigo}
                      onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="categoria">Categoria *</Label>
                    <Select
                      value={formData.categoria}
                      onValueChange={(value) => setFormData({ ...formData, categoria: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Consultoria">Consultoria</SelectItem>
                        <SelectItem value="Manutenção">Manutenção</SelectItem>
                        <SelectItem value="Instalação">Instalação</SelectItem>
                        <SelectItem value="Reparação">Reparação</SelectItem>
                        <SelectItem value="Limpeza">Limpeza</SelectItem>
                        <SelectItem value="Outros">Outros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nome">Nome do Serviço *</Label>
                  <Input
                    id="nome"
                    placeholder="Nome do serviço"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="descricao">Descrição</Label>
                  <Textarea
                    id="descricao"
                    placeholder="Descrição detalhada do serviço"
                    value={formData.descricao}
                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                    rows={4}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Preços e Duração</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="preco">Preço (€)</Label>
                    <Input
                      id="preco"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formData.preco}
                      onChange={(e) => setFormData({ ...formData, preco: parseFloat(e.target.value) || 0 })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="taxaIva">Taxa IVA (%)</Label>
                    <Select
                      value={formData.taxaIva?.toString()}
                      onValueChange={(value) => setFormData({ ...formData, taxaIva: parseFloat(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0%</SelectItem>
                        <SelectItem value="6">6%</SelectItem>
                        <SelectItem value="13">13%</SelectItem>
                        <SelectItem value="16">16%</SelectItem>
                        <SelectItem value="23">23%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="duracao">Duração Estimada (minutos)</Label>
                    <Input
                      id="duracao"
                      type="number"
                      min="0"
                      placeholder="60"
                      value={formData.duracaoEstimada}
                      onChange={(e) => setFormData({ ...formData, duracaoEstimada: parseInt(e.target.value) || 0 })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="unidade">Unidade de Medida</Label>
                    <Select
                      value={formData.unidadeMedida}
                      onValueChange={(value) => setFormData({ ...formData, unidadeMedida: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Hora">Hora</SelectItem>
                        <SelectItem value="Dia">Dia</SelectItem>
                        <SelectItem value="Serviço">Serviço</SelectItem>
                        <SelectItem value="Projeto">Projeto</SelectItem>
                        <SelectItem value="Mês">Mês</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ativo">Serviço Ativo</Label>
                  <Switch
                    id="ativo"
                    checked={formData.ativo}
                    onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Observações</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Observações adicionais sobre o serviço"
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  rows={6}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 space-y-3">
                <Button type="submit" className="w-full gap-2" disabled={loading}>
                  <Save className="h-4 w-4" />
                  {loading ? 'A guardar...' : 'Guardar Serviço'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => router.back()}
                  disabled={loading}
                >
                  Cancelar
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
