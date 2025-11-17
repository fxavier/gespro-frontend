
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EquipeStorage } from '@/lib/storage/projeto-storage';
import { Equipe, MembroEquipe } from '@/types/projeto';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function EquipaContent() {
  const searchParams = useSearchParams();
  const projetoId = searchParams.get('projetoId');

  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [formData, setFormData] = useState({
    nome: '',
    papel: 'desenvolvedor' as const,
    email: '',
    cargo: '',
    custoHora: '0',
  });

  useEffect(() => {
    const data = EquipeStorage.getEquipes();
    setEquipes(data);
    setLoading(false);
  }, []);

  const handleAddMembro = () => {
    if (!formData.nome || !formData.email) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const novoMembro: MembroEquipe = {
      id: `membro_${Date.now()}`,
      usuarioId: `user_${Date.now()}`,
      nome: formData.nome,
      email: formData.email,
      cargo: formData.cargo,
      papel: formData.papel,
      custoHora: parseFloat(formData.custoHora) || 0,
      horasSemanais: 40,
      dataEntrada: new Date().toISOString(),
      status: 'ativo',
    };

    if (equipes.length === 0) {
      const novaEquipe: Equipe = {
        id: `equipe_${Date.now()}`,
        tenantId: 'default',
        nome: 'Equipe Padrão',
        membros: [novoMembro],
        liderIds: [],
        projetosAtivos: 1,
        tarefasAbertas: 0,
        status: 'ativa',
        dataCriacao: new Date().toISOString(),
        dataAtualizacao: new Date().toISOString(),
      };
      EquipeStorage.addEquipe(novaEquipe);
      setEquipes([novaEquipe]);
    } else {
      const equipeAtualizada = { ...equipes[0], membros: [...equipes[0].membros, novoMembro] };
      EquipeStorage.updateEquipe(equipes[0].id, equipeAtualizada);
      setEquipes([equipeAtualizada]);
    }

    setOpenDialog(false);
    setFormData({
      nome: '',
      papel: 'desenvolvedor',
      email: '',
      cargo: '',
      custoHora: '0',
    });
    toast.success('Membro adicionado com sucesso');
  };

  const handleRemoveMembro = (membroId: string) => {
    if (confirm('Tem certeza que deseja remover este membro?')) {
      const equipeAtualizada = {
        ...equipes[0],
        membros: equipes[0].membros.filter(m => m.id !== membroId),
      };
      EquipeStorage.updateEquipe(equipes[0].id, equipeAtualizada);
      setEquipes([equipeAtualizada]);
      toast.success('Membro removido com sucesso');
    }
  };

  if (loading) {
    return <div className="container mx-auto p-6">Carregando...</div>;
  }

  const equipeAtual = equipes[0];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Gestão de Equipa</h1>
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Membro
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Membro à Equipa</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
                  placeholder="Nome do membro"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="Email do membro"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cargo">Cargo</Label>
                <Input
                  id="cargo"
                  value={formData.cargo}
                  onChange={(e) => setFormData(prev => ({ ...prev, cargo: e.target.value }))}
                  placeholder="Cargo do membro"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="papel">Papel</Label>
                <Select value={formData.papel} onValueChange={(value) => setFormData(prev => ({ ...prev, papel: value as any }))}>
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

              <div className="space-y-2">
                <Label htmlFor="custoHora">Custo por Hora (MT)</Label>
                <Input
                  id="custoHora"
                  type="number"
                  value={formData.custoHora}
                  onChange={(e) => setFormData(prev => ({ ...prev, custoHora: e.target.value }))}
                  placeholder="0"
                />
              </div>

              <Button onClick={handleAddMembro} className="w-full">
                Adicionar Membro
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Membros da Equipa</CardTitle>
        </CardHeader>
        <CardContent>
          {!equipeAtual || equipeAtual.membros.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Nenhum membro na equipa</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>Custo/Hora (MT)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equipeAtual.membros.map((membro) => (
                    <TableRow key={membro.id}>
                      <TableCell className="font-medium">{membro.nome}</TableCell>
                      <TableCell>{membro.email}</TableCell>
                      <TableCell>{membro.cargo}</TableCell>
                      <TableCell className="capitalize">{membro.papel}</TableCell>
                      <TableCell>MT {membro.custoHora.toFixed(2)}</TableCell>
                      <TableCell className="capitalize">{membro.status}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMembro(membro.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resumo da Equipa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Total de Membros</p>
              <p className="text-2xl font-bold">{equipeAtual?.membros.length || 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Custo Total/Semana (MT)</p>
              <p className="text-2xl font-bold">
                MT {((equipeAtual?.membros.reduce((acc, m) => acc + (m.custoHora * m.horasSemanais), 0) || 0).toFixed(2))}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Horas Semanais</p>
              <p className="text-2xl font-bold">{(equipeAtual?.membros.reduce((acc, m) => acc + m.horasSemanais, 0) || 0)}h</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="text-2xl font-bold capitalize">{equipeAtual?.status || 'N/A'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
