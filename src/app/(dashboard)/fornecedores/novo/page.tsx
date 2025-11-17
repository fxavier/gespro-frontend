
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
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { validarNUIT } from '@/lib/validacao-nuit';

export default function NovoFornecedorPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    nome: '',
    nuit: '',
    email: '',
    telefone: '',
    endereco: '',
    cidade: '',
    tipo: 'pessoa_juridica',
    classificacao: 'novo',
    diasPagamento: 30,
    formasPagamento: [] as string[],
    observacoes: ''
  });

  const formasPagamentoOpcoes = [
    'Dinheiro',
    'Transferência Bancária',
    'Cheque',
    'Crédito'
  ];

  const cidades = [
    'Maputo',
    'Matola',
    'Beira',
    'Nampula',
    'Tete',
    'Chimoio',
    'Quelimane',
    'Inhambane',
    'Gaza',
    'Xai-Xai'
  ];

  const handleToggleFormaPagamento = (forma: string) => {
    setFormData(prev => ({
      ...prev,
      formasPagamento: prev.formasPagamento.includes(forma)
        ? prev.formasPagamento.filter(f => f !== forma)
        : [...prev.formasPagamento, forma]
    }));
  };

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

    if (formData.formasPagamento.length === 0) {
      toast.error('Selecione pelo menos uma forma de pagamento');
      return;
    }

    toast.success('Fornecedor criado com sucesso!');
    router.push('/fornecedores/lista');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Novo Fornecedor</h1>
          <p className="text-muted-foreground">Cadastrar novo fornecedor no sistema</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          {/* Informações Básicas */}
          <Card>
            <CardHeader>
              <CardTitle>Informações Básicas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tipo">Tipo de Fornecedor *</Label>
                  <Select 
                    value={formData.tipo} 
                    onValueChange={(value) => setFormData({ ...formData, tipo: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pessoa_fisica">Pessoa Física</SelectItem>
                      <SelectItem value="pessoa_juridica">Pessoa Jurídica</SelectItem>
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
                      {cidades.map(cidade => (
                        <SelectItem key={cidade} value={cidade}>
                          {cidade}
                        </SelectItem>
                      ))}
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
              </div>
            </CardContent>
          </Card>

          {/* Condições Comerciais */}
          <Card>
            <CardHeader>
              <CardTitle>Condições Comerciais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="classificacao">Classificação *</Label>
                  <Select 
                    value={formData.classificacao} 
                    onValueChange={(value) => setFormData({ ...formData, classificacao: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="preferencial">Preferencial</SelectItem>
                      <SelectItem value="regular">Regular</SelectItem>
                      <SelectItem value="novo">Novo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="diasPagamento">Dias para Pagamento *</Label>
                  <Input
                    id="diasPagamento"
                    type="number"
                    value={formData.diasPagamento}
                    onChange={(e) => setFormData({ ...formData, diasPagamento: parseInt(e.target.value) })}
                    placeholder="30"
                    min="1"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label>Formas de Pagamento *</Label>
                <div className="space-y-2">
                  {formasPagamentoOpcoes.map(forma => (
                    <div key={forma} className="flex items-center space-x-2">
                      <Checkbox
                        id={forma}
                        checked={formData.formasPagamento.includes(forma)}
                        onCheckedChange={() => handleToggleFormaPagamento(forma)}
                      />
                      <Label htmlFor={forma} className="font-normal cursor-pointer">
                        {forma}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Observações */}
          <Card>
            <CardHeader>
              <CardTitle>Observações</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="observacoes">Informações Adicionais</Label>
                <Textarea
                  id="observacoes"
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  placeholder="Informações adicionais sobre o fornecedor"
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancelar
            </Button>
            <Button type="submit" className="gap-2">
              <Save className="h-4 w-4" />
              Guardar Fornecedor
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
