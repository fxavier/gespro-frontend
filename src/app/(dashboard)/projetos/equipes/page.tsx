
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Users, Plus, Edit, Trash2, UserPlus } from 'lucide-react';
import { EquipeStorage } from '@/lib/storage/projeto-storage';
import { Equipe, MembroEquipe } from '@/types/projeto';
import { toast } from 'sonner';

export default function EquipesPage() {
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isMembroDialogOpen, setIsMembroDialogOpen] = useState(false);
  const [editingEquipe, setEditingEquipe] = useState<Equipe | null>(null);
  const [selectedEquipeId, setSelectedEquipeId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    status: 'ativa' as Equipe['status']
  });
  const [membroFormData, setMembroFormData] = useState({
    nome: '',
    email: '',
    cargo: '',
    papel: 'desenvolvedor' as MembroEquipe['papel'],
    custoHora: '',
    horasSemanais: '',
    status: 'ativo' as MembroEquipe['status']
  });

  useEffect(() => {
    loadEquipes();
  }, []);

  const loadEquipes = () => {
    const data = EquipeStorage.getEquipes();
    setEquipes(data);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nome) {
      toast.error('Preencha o nome da equipe');
      return;
    }

    if (editingEquipe) {
      const updated = EquipeStorage.updateEquipe(editingEquipe.id, formData);
      if (updated) {
        toast.success('Equipe atualizada com sucesso');
      }
    } else {
      const novaEquipe: Equipe = {
        id: `team_${Date.now()}`,
        tenantId: 'tenant_1',
        nome: formData.nome,
        descricao: formData.descricao,
        liderIds: [],
        membros: [],
        projetosAtivos: 0,
        tarefasAbertas: 0,
        status: formData.status,
        dataCriacao: new Date().toISOString(),
        dataAtualizacao: new Date().toISOString()
      };
      EquipeStorage.addEquipe(novaEquipe);
      toast.success('Equipe criada com sucesso');
    }

    loadEquipes();
    setIsDialogOpen(false);
    resetForm();
  };

  const handleMembroSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedEquipeId || !membroFormData.nome || !membroFormData.email) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const equipe = equipes.find(e => e.id === selectedEquipeId);
    if (!equipe) return;

    const novoMembro: MembroEquipe = {
      id: `member_${Date.now()}`,
      usuarioId: `user_${Date.now()}`,
      nome: membroFormData.nome,
      email: membroFormData.email,
      cargo: membroFormData.cargo,
      papel: membroFormData.papel,
      custoHora: parseFloat(membroFormData.custoHora) || 0,
      horasSemanais: parseFloat(membroFormData.horasSemanais) || 40,
      dataEntrada: new Date().toISOString(),
      status: membroFormData.status
    };

    const membrosAtualizados = [...equipe.membros, novoMembro];
    EquipeStorage.updateEquipe(selectedEquipeId, { membros: membrosAtualizados });
    
    toast.success('Membro adicionado com sucesso');
    loadEquipes();
    setIsMembroDialogOpen(false);
    resetMembroForm();
  };

  const handleRemoverMembro = (equipeId: string, membroId: string) => {
    const equipe = equipes.find(e => e.id === equipeId);
    if (!equipe) return;

    const membrosAtualizados = equipe.membros.filter(m => m.id !== membroId);
    EquipeStorage.updateEquipe(equipeId, { membros: membrosAtualizados });
    
    toast.success('Membro removido com sucesso');
    loadEquipes();
  };

  const handleEdit = (equipe: Equipe) => {
    setEditingEquipe(equipe);
    setFormData({
      nome: equipe.nome,
      descricao: equipe.descricao || '',
      status: equipe.status
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    const success = EquipeStorage.deleteEquipe(id);
    if (success) {
      toast.success('Equipe excluída com sucesso');
      loadEquipes();
    }
  };

  const resetForm = () => {
    setEditingEquipe(null);
    setFormData({
      nome: '',
      descricao: '',
      status: 'ativa'
    });
  };

  const resetMembroForm = () => {
    setMembroFormData({
      nome: '',
      email: '',
      cargo: '',
      papel: 'desenvolvedor',
      custoHora: '',
      horasSemanais: '',
      status: 'ativo'
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Equipes</h1>
          <p className="text-muted-foreground">Gerencie as equipes de projetos</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nova Equipe
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingEquipe ? 'Editar Equipe' : 'Nova Equipe'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome da Equipe *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Nome da equipe"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Descrição da equipe"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status} onValueChange={(value: Equipe['status']) => setFormData({ ...formData, status: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativa">Ativa</SelectItem>
                    <SelectItem value="inativa">Inativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingEquipe ? 'Atualizar' : 'Criar'} Equipe
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {equipes.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhuma equipe cadastrada
            </CardContent>
          </Card>
        ) : (
          equipes.map((equipe) => (
            <Card key={equipe.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-xl">{equipe.nome}</CardTitle>
                    <Badge variant={equipe.status === 'ativa' ? 'default' : 'secondary'} className="mt-2">
                      {equipe.status === 'ativa' ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(equipe)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(equipe.id)}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {equipe.descricao && (
                  <p className="text-sm text-muted-foreground">{equipe.descricao}</p>
                )}

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Membros</p>
                    <p className="font-medium text-lg">{equipe.membros.length}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Projetos Ativos</p>
                    <p className="font-medium text-lg">{equipe.projetosAtivos}</p>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm font-medium">Membros da Equipe</p>
                    <Dialog open={isMembroDialogOpen && selectedEquipeId === equipe.id} onOpenChange={(open) => {
                      setIsMembroDialogOpen(open);
                      if (open) setSelectedEquipeId(equipe.id);
                      if (!open) resetMembroForm();
                    }}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Adicionar Membro</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleMembroSubmit} className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="membroNome">Nome *</Label>
                            <Input
                              id="membroNome"
                              value={membroFormData.nome}
                              onChange={(e) => setMembroFormData({ ...membroFormData, nome: e.target.value })}
                              placeholder="Nome do membro"
                              required
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="membroEmail">Email *</Label>
                            <Input
                              id="membroEmail"
                              type="email"
                              value={membroFormData.email}
                              onChange={(e) => setMembroFormData({ ...membroFormData, email: e.target.value })}
                              placeholder="email@exemplo.com"
                              required
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="membroCargo">Cargo</Label>
                            <Input
                              id="membroCargo"
                              value={membroFormData.cargo}
                              onChange={(e) => setMembroFormData({ ...membroFormData, cargo: e.target.value })}
                              placeholder="Cargo do membro"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="membroPapel">Papel</Label>
                            <Select value={membroFormData.papel} onValueChange={(value: MembroEquipe['papel']) => setMembroFormData({ ...membroFormData, papel: value })}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="gerente">Gerente</SelectItem>
                                <SelectItem value="lider">Líder</SelectItem>
                                <SelectItem value="desenvolvedor">Desenvolvedor</SelectItem>
                                <SelectItem value="designer">Designer</SelectItem>
                                <SelectItem value="analista">Analista</SelectItem>
                                <SelectItem value="tester">Tester</SelectItem>
                                <SelectItem value="outro">Outro</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="membroCustoHora">Custo/Hora (MT)</Label>
                              <Input
                                id="membroCustoHora"
                                type="number"
                                step="0.01"
                                value={membroFormData.custoHora}
                                onChange={(e) => setMembroFormData({ ...membroFormData, custoHora: e.target.value })}
                                placeholder="0.00"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="membroHorasSemanais">Horas/Semana</Label>
                              <Input
                                id="membroHorasSemanais"
                                type="number"
                                value={membroFormData.horasSemanais}
                                onChange={(e) => setMembroFormData({ ...membroFormData, horasSemanais: e.target.value })}
                                placeholder="40"
                              />
                            </div>
                          </div>

                          <div className="flex justify-end gap-4">
                            <Button type="button" variant="outline" onClick={() => setIsMembroDialogOpen(false)}>
                              Cancelar
                            </Button>
                            <Button type="submit">
                              Adicionar Membro
                            </Button>
                          </div>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>

                  {equipe.membros.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum membro cadastrado</p>
                  ) : (
                    <div className="space-y-2">
                      {equipe.membros.map((membro) => (
                        <div key={membro.id} className="flex justify-between items-center p-2 border rounded">
                          <div>
                            <p className="font-medium text-sm">{membro.nome}</p>
                            <p className="text-xs text-muted-foreground">{membro.papel}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoverMembro(equipe.id, membro.id)}
                          >
                            <Trash2 className="h-3 w-3 text-red-600" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
