
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Search, PieChart } from 'lucide-react';
import { CentroCusto } from '@/types/contabilidade';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function CentrosCustoPage() {
  const [centros, setCentros] = useState<CentroCusto[]>([]);
  const [filteredCentros, setFilteredCentros] = useState<CentroCusto[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCentro, setEditingCentro] = useState<CentroCusto | null>(null);
  const [formData, setFormData] = useState({
    codigo: '',
    nome: '',
    descricao: '',
    tipo: 'departamento' as CentroCusto['tipo'],
    responsavelNome: '',
    orcamento: '',
    ativo: true
  });

  useEffect(() => {
    loadCentros();
  }, []);

  useEffect(() => {
    filterCentros();
  }, [searchTerm, centros]);

  const loadCentros = () => {
    const stored = localStorage.getItem('centros_custo');
    if (stored) {
      setCentros(JSON.parse(stored));
    }
  };

  const filterCentros = () => {
    if (!searchTerm) {
      setFilteredCentros(centros);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = centros.filter(centro =>
      centro.codigo.toLowerCase().includes(term) ||
      centro.nome.toLowerCase().includes(term)
    );
    setFilteredCentros(filtered);
  };

  const handleSubmit = () => {
    if (!formData.codigo || !formData.nome) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const now = new Date().toISOString();
    
    if (editingCentro) {
      const updated = centros.map(c =>
        c.id === editingCentro.id
          ? {
              ...c,
              ...formData,
              orcamento: formData.orcamento ? parseFloat(formData.orcamento) : undefined,
              dataAtualizacao: now
            }
          : c
      );
      setCentros(updated);
      localStorage.setItem('centros_custo', JSON.stringify(updated));
      toast.success('Centro de custo atualizado com sucesso');
    } else {
      const novoCentro: CentroCusto = {
        id: Date.now().toString(),
        tenantId: 'default',
        ...formData,
        orcamento: formData.orcamento ? parseFloat(formData.orcamento) : undefined,
        dataCriacao: now,
        dataAtualizacao: now
      };

      const updated = [...centros, novoCentro];
      setCentros(updated);
      localStorage.setItem('centros_custo', JSON.stringify(updated));
      toast.success('Centro de custo criado com sucesso');
    }

    resetForm();
    setIsDialogOpen(false);
  };

  const handleEdit = (centro: CentroCusto) => {
    setEditingCentro(centro);
    setFormData({
      codigo: centro.codigo,
      nome: centro.nome,
      descricao: centro.descricao || '',
      tipo: centro.tipo,
      responsavelNome: centro.responsavelNome || '',
      orcamento: centro.orcamento?.toString() || '',
      ativo: centro.ativo
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    const updated = centros.filter(c => c.id !== id);
    setCentros(updated);
    localStorage.setItem('centros_custo', JSON.stringify(updated));
    toast.success('Centro de custo excluído com sucesso');
  };

  const resetForm = () => {
    setFormData({
      codigo: '',
      nome: '',
      descricao: '',
      tipo: 'departamento',
      responsavelNome: '',
      orcamento: '',
      ativo: true
    });
    setEditingCentro(null);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <PieChart className="h-8 w-8" />
            Centros de Custo
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie departamentos, projetos e centros de custo
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Centro de Custo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingCentro ? 'Editar Centro de Custo' : 'Novo Centro de Custo'}
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="codigo">Código *</Label>
                  <Input
                    id="codigo"
                    value={formData.codigo}
                    onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                    placeholder="Ex: CC001"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tipo">Tipo *</Label>
                  <Select
                    value={formData.tipo}
                    onValueChange={(value: CentroCusto['tipo']) => setFormData({ ...formData, tipo: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="departamento">Departamento</SelectItem>
                      <SelectItem value="projeto">Projeto</SelectItem>
                      <SelectItem value="filial">Filial</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nome">Nome *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Ex: Departamento de Vendas"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Descrição do centro de custo (opcional)"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="responsavel">Responsável</Label>
                  <Input
                    id="responsavel"
                    value={formData.responsavelNome}
                    onChange={(e) => setFormData({ ...formData, responsavelNome: e.target.value })}
                    placeholder="Nome do responsável"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="orcamento">Orçamento</Label>
                  <Input
                    id="orcamento"
                    type="number"
                    step="0.01"
                    value={formData.orcamento}
                    onChange={(e) => setFormData({ ...formData, orcamento: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="ativo"
                  checked={formData.ativo}
                  onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })}
                />
                <Label htmlFor="ativo">Ativo</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit}>
                {editingCentro ? 'Atualizar' : 'Criar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Centros de Custo Cadastrados</CardTitle>
          <CardDescription>
            Lista de todos os centros de custo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por código ou nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Orçamento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCentros.map(centro => (
                <TableRow key={centro.id}>
                  <TableCell className="font-mono">{centro.codigo}</TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{centro.nome}</div>
                      {centro.descricao && (
                        <div className="text-sm text-muted-foreground">{centro.descricao}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {centro.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell>{centro.responsavelNome || '-'}</TableCell>
                  <TableCell>
                    {centro.orcamento ? (
                      <span className="font-mono">
                        {new Intl.NumberFormat('pt-MZ', {
                          style: 'currency',
                          currency: 'MZN'
                        }).format(centro.orcamento)}
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={centro.ativo ? 'default' : 'secondary'}>
                      {centro.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(centro)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(centro.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredCentros.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum centro de custo encontrado
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
