
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  MapPin,
  Filter
} from 'lucide-react';
import { toast } from 'sonner';
import { ClienteStorage } from '@/lib/storage/cliente-storage';
import { usePagination } from '@/hooks/usePagination';
import { EnderecoCliente } from '@/types/cliente';

export default function EnderecosClientesPage() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [enderecos, setEnderecos] = useState<any[]>([]);
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [clienteFiltro, setClienteFiltro] = useState('todos');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    clienteId: '',
    tipo: 'facturacao' as 'facturacao' | 'entrega' | 'outro',
    rua: '',
    numero: '',
    bairro: '',
    cidade: '',
    provincia: '',
    codigoPostal: '',
    referencia: '',
    principal: false
  });

  useEffect(() => {
    const clientesData = ClienteStorage.getClientes();
    setClientes(clientesData);

    // Extrair todos os endereços dos clientes
    const todosEnderecos: any[] = [];
    clientesData.forEach(cliente => {
      if (cliente.endereco) {
        todosEnderecos.push({
          ...cliente.endereco,
          clienteId: cliente.id,
          clienteNome: cliente.nome
        });
      }
      if (cliente.enderecos) {
        cliente.enderecos.forEach((end: any) => {
          todosEnderecos.push({
            ...end,
            clienteId: cliente.id,
            clienteNome: cliente.nome
          });
        });
      }
    });
    setEnderecos(todosEnderecos);
  }, []);

  const enderecosFiltrados = enderecos.filter(e => {
    const correspondePesquisa = e.rua.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                                e.cidade.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                                e.bairro.toLowerCase().includes(termoPesquisa.toLowerCase());
    const correspondeCliente = clienteFiltro === 'todos' || e.clienteId === clienteFiltro;
    return correspondePesquisa && correspondeCliente;
  });

  const { paginatedData, currentPage, totalPages, handlePageChange, itemsPerPage, handleItemsPerPageChange } =
    usePagination({ data: enderecosFiltrados, initialItemsPerPage: 10 });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.clienteId || !formData.rua || !formData.cidade) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const cliente = ClienteStorage.getClienteById(formData.clienteId);
    if (!cliente) {
      toast.error('Cliente não encontrado');
      return;
    }

    const novoEndereco: EnderecoCliente = {
      id: editingId || Date.now().toString(),
      tipo: formData.tipo,
      rua: formData.rua,
      numero: formData.numero,
      bairro: formData.bairro,
      cidade: formData.cidade,
      provincia: formData.provincia,
      codigoPostal: formData.codigoPostal,
      referencia: formData.referencia,
      principal: formData.principal
    };

    if (!cliente.enderecos) {
      cliente.enderecos = [];
    }

    if (editingId) {
      const index = cliente.enderecos.findIndex(e => e.id === editingId);
      if (index !== -1) {
        cliente.enderecos[index] = novoEndereco;
      }
      toast.success('Endereço actualizado com sucesso!');
    } else {
      cliente.enderecos.push(novoEndereco);
      toast.success('Endereço criado com sucesso!');
    }

    ClienteStorage.updateCliente(formData.clienteId, cliente);
    const clientesData = ClienteStorage.getClientes();
    setClientes(clientesData);

    // Recarregar endereços
    const todosEnderecos: any[] = [];
    clientesData.forEach(c => {
      if (c.endereco) {
        todosEnderecos.push({
          ...c.endereco,
          clienteId: c.id,
          clienteNome: c.nome
        });
      }
      if (c.enderecos) {
        c.enderecos.forEach((end: any) => {
          todosEnderecos.push({
            ...end,
            clienteId: c.id,
            clienteNome: c.nome
          });
        });
      }
    });
    setEnderecos(todosEnderecos);

    setIsDialogOpen(false);
    setEditingId(null);
    setFormData({
      clienteId: '',
      tipo: 'facturacao',
      rua: '',
      numero: '',
      bairro: '',
      cidade: '',
      provincia: '',
      codigoPostal: '',
      referencia: '',
      principal: false
    });
  };

  const handleEdit = (endereco: any) => {
    setFormData({
      clienteId: endereco.clienteId,
      tipo: endereco.tipo as 'facturacao' | 'entrega' | 'outro',
      rua: endereco.rua,
      numero: endereco.numero,
      bairro: endereco.bairro,
      cidade: endereco.cidade,
      provincia: endereco.provincia,
      codigoPostal: endereco.codigoPostal || '',
      referencia: endereco.referencia || '',
      principal: endereco.principal
    });
    setEditingId(endereco.id);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string, clienteId: string) => {
    if (confirm('Tem certeza que deseja eliminar este endereço?')) {
      const cliente = ClienteStorage.getClienteById(clienteId);
      if (cliente && cliente.enderecos) {
        cliente.enderecos = cliente.enderecos.filter(e => e.id !== id);
        ClienteStorage.updateCliente(clienteId, cliente);

        const clientesData = ClienteStorage.getClientes();
        setClientes(clientesData);

        const todosEnderecos: any[] = [];
        clientesData.forEach(c => {
          if (c.endereco) {
            todosEnderecos.push({
              ...c.endereco,
              clienteId: c.id,
              clienteNome: c.nome
            });
          }
          if (c.enderecos) {
            c.enderecos.forEach((end: any) => {
              todosEnderecos.push({
                ...end,
                clienteId: c.id,
                clienteNome: c.nome
              });
            });
          }
        });
        setEnderecos(todosEnderecos);

        toast.success('Endereço eliminado com sucesso!');
      }
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Endereços de Clientes
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestão de endereços de facturação e entrega
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setEditingId(null);
              setFormData({
                clienteId: '',
                tipo: 'facturacao',
                rua: '',
                numero: '',
                bairro: '',
                cidade: '',
                provincia: '',
                codigoPostal: '',
                referencia: '',
                principal: false
              });
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Endereço
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar Endereço' : 'Novo Endereço'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clienteId">Cliente *</Label>
                <Select value={formData.clienteId} onValueChange={(value) => setFormData({ ...formData, clienteId: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map(cliente => (
                      <SelectItem key={cliente.id} value={cliente.id}>
                        {cliente.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo de Endereço *</Label>
                <Select value={formData.tipo} onValueChange={(value) => setFormData({ ...formData, tipo: value as 'facturacao' | 'entrega' | 'outro' })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="facturacao">Facturação</SelectItem>
                    <SelectItem value="entrega">Entrega</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rua">Rua/Avenida *</Label>
                  <Input
                    id="rua"
                    value={formData.rua}
                    onChange={(e) => setFormData({ ...formData, rua: e.target.value })}
                    placeholder="Nome da rua"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="numero">Número *</Label>
                  <Input
                    id="numero"
                    value={formData.numero}
                    onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                    placeholder="Número"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bairro">Bairro *</Label>
                <Input
                  id="bairro"
                  value={formData.bairro}
                  onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                  placeholder="Bairro"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cidade">Cidade *</Label>
                  <Select value={formData.cidade} onValueChange={(value) => setFormData({ ...formData, cidade: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar cidade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Maputo">Maputo</SelectItem>
                      <SelectItem value="Matola">Matola</SelectItem>
                      <SelectItem value="Beira">Beira</SelectItem>
                      <SelectItem value="Nampula">Nampula</SelectItem>
                      <SelectItem value="Tete">Tete</SelectItem>
                      <SelectItem value="Chimoio">Chimoio</SelectItem>
                      <SelectItem value="Quelimane">Quelimane</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="provincia">Província *</Label>
                  <Select value={formData.provincia} onValueChange={(value) => setFormData({ ...formData, provincia: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar província" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Maputo">Maputo</SelectItem>
                      <SelectItem value="Gaza">Gaza</SelectItem>
                      <SelectItem value="Inhambane">Inhambane</SelectItem>
                      <SelectItem value="Sofala">Sofala</SelectItem>
                      <SelectItem value="Manica">Manica</SelectItem>
                      <SelectItem value="Tete">Tete</SelectItem>
                      <SelectItem value="Zambézia">Zambézia</SelectItem>
                      <SelectItem value="Nampula">Nampula</SelectItem>
                      <SelectItem value="Niassa">Niassa</SelectItem>
                      <SelectItem value="Cabo Delgado">Cabo Delgado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="codigoPostal">Código Postal</Label>
                <Input
                  id="codigoPostal"
                  value={formData.codigoPostal}
                  onChange={(e) => setFormData({ ...formData, codigoPostal: e.target.value })}
                  placeholder="Código postal"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="referencia">Referência/Ponto de Referência</Label>
                <Input
                  id="referencia"
                  value={formData.referencia}
                  onChange={(e) => setFormData({ ...formData, referencia: e.target.value })}
                  placeholder="Ex: Perto do mercado"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingId ? 'Actualizar' : 'Criar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Filtros e Pesquisa</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Pesquisar por rua, bairro ou cidade..."
                  value={termoPesquisa}
                  onChange={(e) => setTermoPesquisa(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Select value={clienteFiltro} onValueChange={setClienteFiltro}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Filtrar por cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Clientes</SelectItem>
                {clientes.map(cliente => (
                  <SelectItem key={cliente.id} value={cliente.id}>
                    {cliente.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Endereços ({enderecosFiltrados.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Endereço</TableHead>
                  <TableHead>Bairro</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Província</TableHead>
                  <TableHead>Principal</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.map((endereco) => (
                  <TableRow key={endereco.id}>
                    <TableCell className="font-medium">{endereco.clienteNome}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {endereco.tipo === 'facturacao' ? 'Facturação' : endereco.tipo === 'entrega' ? 'Entrega' : 'Outro'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {endereco.rua}, {endereco.numero}
                      </div>
                    </TableCell>
                    <TableCell>{endereco.bairro}</TableCell>
                    <TableCell>{endereco.cidade}</TableCell>
                    <TableCell>{endereco.provincia}</TableCell>
                    <TableCell>
                      <Badge variant={endereco.principal ? 'default' : 'secondary'}>
                        {endereco.principal ? 'Sim' : 'Não'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(endereco)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(endereco.id, endereco.clienteId)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {paginatedData.length === 0 && (
            <div className="text-center py-8">
              <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Nenhum endereço encontrado</p>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Itens por página:</span>
                <Select value={itemsPerPage.toString()} onValueChange={(value) => handleItemsPerPageChange(parseInt(value))}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Anterior
                </Button>
                <span className="text-sm">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
