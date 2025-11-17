
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
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { ClienteStorage } from '@/lib/storage/cliente-storage';
import { validarNUIT } from '@/lib/validacao-nuit';

export default function EditarClientePage() {
  const params = useParams();
  const router = useRouter();
  const clienteId = params.id as string;

  const [formData, setFormData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cliente = ClienteStorage.getClienteById(clienteId);
    if (cliente) {
      setFormData(cliente);
    }
    setLoading(false);
  }, [clienteId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nome || !formData.nuit || !formData.telefone) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (!validarNUIT(formData.nuit)) {
      toast.error('NUIT inválido');
      return;
    }

    ClienteStorage.updateCliente(clienteId, formData);
    toast.success('Cliente actualizado com sucesso!');
    router.push(`/clientes/${clienteId}`);
  };

  if (loading || !formData) {
    return (
      <div className="p-6">
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Editar Cliente</h1>
          <p className="text-muted-foreground">{formData.nome}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Informações do Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo de Cliente *</Label>
                <Select
                  value={formData.tipo}
                  onValueChange={(value) => setFormData({ ...formData, tipo: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fisica">Pessoa Física</SelectItem>
                    <SelectItem value="juridica">Pessoa Jurídica</SelectItem>
                    <SelectItem value="revendedor">Revendedor</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nome">Nome Completo / Razão Social *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Digite o nome"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nuit">NUIT *</Label>
                <Input
                  id="nuit"
                  value={formData.nuit}
                  onChange={(e) => setFormData({ ...formData, nuit: e.target.value })}
                  placeholder="000000000"
                  maxLength={9}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone *</Label>
                <Input
                  id="telefone"
                  value={formData.telefone}
                  onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                  placeholder="+258 84 000 0000"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                    <SelectItem value="suspenso">Suspenso</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="categoria">Categoria</Label>
                <Select
                  value={formData.categoria}
                  onValueChange={(value) => setFormData({ ...formData, categoria: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vip">VIP</SelectItem>
                    <SelectItem value="regular">Regular</SelectItem>
                    <SelectItem value="novo">Novo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="limiteCreditoMT">Limite de Crédito (MT)</Label>
                <Input
                  id="limiteCreditoMT"
                  type="number"
                  value={formData.limiteCreditoMT}
                  onChange={(e) => setFormData({ ...formData, limiteCreditoMT: parseFloat(e.target.value) })}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="diasPagamento">Dias para Pagamento</Label>
                <Input
                  id="diasPagamento"
                  type="number"
                  value={formData.diasPagamento}
                  onChange={(e) => setFormData({ ...formData, diasPagamento: parseInt(e.target.value) })}
                  placeholder="30"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="endereco">Endereço</Label>
                <Input
                  id="endereco"
                  value={formData.endereco?.rua || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    endereco: { ...formData.endereco, rua: e.target.value }
                  })}
                  placeholder="Rua, Avenida"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cidade">Cidade</Label>
                <Select
                  value={formData.endereco?.cidade || ''}
                  onValueChange={(value) => setFormData({
                    ...formData,
                    endereco: { ...formData.endereco, cidade: value }
                  })}
                >
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

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea
                  id="observacoes"
                  value={formData.observacoes || ''}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  placeholder="Informações adicionais"
                  rows={4}
                />
              </div>
            </div>

            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancelar
              </Button>
              <Button type="submit" className="gap-2">
                <Save className="h-4 w-4" />
                Guardar Alterações
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
