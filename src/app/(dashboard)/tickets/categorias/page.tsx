
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CategoriaTicketStorage } from '@/lib/storage/ticket-storage';
import { CategoriaTicket } from '@/types/ticket';
import { FolderOpen, Plus, Edit, Trash2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export default function CategoriasTickets() {
  const [categorias, setCategorias] = useState<CategoriaTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<CategoriaTicket | null>(null);

  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    subcategorias: '',
    tempoResposta: 4,
    tempoResolucao: 48
  });

  useEffect(() => {
    loadCategorias();
  }, []);

  const loadCategorias = () => {
    setLoading(true);
    const data = CategoriaTicketStorage.getCategorias();
    setCategorias(data);
    setLoading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const subcategoriasArray = formData.subcategorias
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (editando) {
      const updated = CategoriaTicketStorage.updateCategoria(editando.id, {
        nome: formData.nome,
        descricao: formData.descricao,
        subcategorias: subcategoriasArray,
        sla: {
          tempoResposta: formData.tempoResposta,
          tempoResolucao: formData.tempoResolucao
        }
      });

      if (updated) {
        toast.success('Categoria atualizada com sucesso!');
        loadCategorias();
        resetForm();
      }
    } else {
      const novaCategoria: CategoriaTicket = {
        id: Date.now().toString(),
        tenantId: 'default',
        nome: formData.nome,
        descricao: formData.descricao,
        subcategorias: subcategoriasArray,
        sla: {
          tempoResposta: formData.tempoResposta,
          tempoResolucao: formData.tempoResolucao
        },
        ativa: true,
        dataCriacao: new Date().toISOString(),
        dataAtualizacao: new Date().toISOString()
      };

      CategoriaTicketStorage.addCategoria(novaCategoria);
      toast.success('Categoria criada com sucesso!');
      loadCategorias();
      resetForm();
    }
  };

  const handleEditar = (categoria: CategoriaTicket) => {
    setEditando(categoria);
    setFormData({
      nome: categoria.nome,
      descricao: categoria.descricao || '',
      subcategorias: categoria.subcategorias?.join(', ') || '',
      tempoResposta: categoria.sla.tempoResposta,
      tempoResolucao: categoria.sla.tempoResolucao
    });
    setDialogOpen(true);
  };

  const handleExcluir = (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta categoria?')) {
      const success = CategoriaTicketStorage.deleteCategoria(id);
      if (success) {
        toast.success('Categoria excluída com sucesso!');
        loadCategorias();
      } else {
        toast.error('Erro ao excluir categoria');
      }
    }
  };

  const resetForm = () => {
    setFormData({
      nome: '',
      descricao: '',
      subcategorias: '',
      tempoResposta: 4,
      tempoResolucao: 48
    });
    setEditando(null);
    setDialogOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando categorias...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FolderOpen className="h-8 w-8" />
            Categorias de Tickets
          </h1>
          <p className="text-muted-foreground">Gerencie as categorias e subcategorias</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Categoria
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editando ? 'Editar Categoria' : 'Nova Categoria'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subcategorias">Subcategorias (separadas por vírgula)</Label>
                <Input
                  id="subcategorias"
                  value={formData.subcategorias}
                  onChange={(e) => setFormData({ ...formData, subcategorias: e.target.value })}
                  placeholder="Ex: Computador, Impressora, Periféricos"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tempoResposta">Tempo de Resposta (horas) *</Label>
                  <Input
                    id="tempoResposta"
                    type="number"
                    min="1"
                    value={formData.tempoResposta}
                    onChange={(e) => setFormData({ ...formData, tempoResposta: parseInt(e.target.value) })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tempoResolucao">Tempo de Resolução (horas) *</Label>
                  <Input
                    id="tempoResolucao"
                    type="number"
                    min="1"
                    value={formData.tempoResolucao}
                    onChange={(e) => setFormData({ ...formData, tempoResolucao: parseInt(e.target.value) })}
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  <X className="mr-2 h-4 w-4" />
                  Cancelar
                </Button>
                <Button type="submit">
                  <Save className="mr-2 h-4 w-4" />
                  {editando ? 'Atualizar' : 'Criar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {categorias.map((categoria) => (
          <Card key={categoria.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{categoria.nome}</span>
                <Badge variant={categoria.ativa ? 'default' : 'secondary'}>
                  {categoria.ativa ? 'Ativa' : 'Inativa'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {categoria.descricao && (
                <p className="text-sm text-muted-foreground">{categoria.descricao}</p>
              )}

              {categoria.subcategorias && categoria.subcategorias.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Subcategorias:</p>
                  <div className="flex flex-wrap gap-1">
                    {categoria.subcategorias.map((sub, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {sub}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tempo de Resposta:</span>
                  <span className="font-medium">{categoria.sla.tempoResposta}h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tempo de Resolução:</span>
                  <span className="font-medium">{categoria.sla.tempoResolucao}h</span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleEditar(categoria)}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleExcluir(categoria.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
