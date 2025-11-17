
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
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { validarNUIT } from '@/lib/validacao-nuit';

export default function NovoClientePage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    nome: '',
    nuit: '',
    email: '',
    telefone: '',
    endereco: '',
    cidade: '',
    tipo: 'Pessoa Física',
    observacoes: ''
  });

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

    toast.success('Cliente criado com sucesso!');
    router.push('/clientes');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Novo Cliente</h1>
          <p className="text-muted-foreground">Cadastrar novo cliente no sistema</p>
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
                    <SelectItem value="Pessoa Física">Pessoa Física</SelectItem>
                    <SelectItem value="Pessoa Jurídica">Pessoa Jurídica</SelectItem>
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
                <Label htmlFor="cidade">Cidade</Label>
                <Select 
                  value={formData.cidade} 
                  onValueChange={(value) => setFormData({ ...formData, cidade: value })}
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
                <Label htmlFor="endereco">Endereço</Label>
                <Input
                  id="endereco"
                  value={formData.endereco}
                  onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                  placeholder="Rua, Avenida, Número"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea
                  id="observacoes"
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  placeholder="Informações adicionais sobre o cliente"
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
                Guardar Cliente
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
