
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
import { TicketStorage, CategoriaTicketStorage } from '@/lib/storage/ticket-storage';
import { Ticket } from '@/types/ticket';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function EditarTicket() {
  const params = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const categorias = CategoriaTicketStorage.getCategorias();

  const [formData, setFormData] = useState<{
    titulo: string;
    descricao: string;
    tipo: 'incidente' | 'requisicao' | 'problema' | 'mudanca' | 'consulta';
    categoria: string;
    subcategoria: string;
    prioridade: 'baixa' | 'normal' | 'alta' | 'urgente';
    status: 'aberto' | 'em_progresso' | 'aguardando_cliente' | 'aguardando_terceiro' | 'resolvido' | 'fechado' | 'cancelado';
    solicitanteNome: string;
    solicitanteEmail: string;
    solicitanteTelefone: string;
  }>({
    titulo: '',
    descricao: '',
    tipo: 'incidente',
    categoria: '',
    subcategoria: '',
    prioridade: 'normal',
    status: 'aberto',
    solicitanteNome: '',
    solicitanteEmail: '',
    solicitanteTelefone: ''
  });

  useEffect(() => {
    loadTicket();
  }, [params.id]);

  const loadTicket = () => {
    setLoading(true);
    const ticket = TicketStorage.getTicketById(params.id as string);
    
    if (ticket) {
      setFormData({
        titulo: ticket.titulo,
        descricao: ticket.descricao,
        tipo: ticket.tipo,
        categoria: ticket.categoria,
        subcategoria: ticket.subcategoria || '',
        prioridade: ticket.prioridade,
        status: ticket.status,
        solicitanteNome: ticket.solicitanteNome,
        solicitanteEmail: ticket.solicitanteEmail,
        solicitanteTelefone: ticket.solicitanteTelefone || ''
      });
    }
    
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const updated = TicketStorage.updateTicket(params.id as string, {
        titulo: formData.titulo,
        descricao: formData.descricao,
        tipo: formData.tipo,
        categoria: formData.categoria,
        subcategoria: formData.subcategoria || undefined,
        prioridade: formData.prioridade,
        status: formData.status,
        solicitanteNome: formData.solicitanteNome,
        solicitanteEmail: formData.solicitanteEmail,
        solicitanteTelefone: formData.solicitanteTelefone || undefined
      });

      if (updated) {
        toast.success('Ticket atualizado com sucesso!');
        router.push(`/tickets/${params.id}`);
      } else {
        toast.error('Erro ao atualizar ticket');
      }
    } catch (error) {
      toast.error('Erro ao atualizar ticket');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const categoriaSelecionada = categorias.find(c => c.nome === formData.categoria);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando ticket...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/tickets/${params.id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Editar Ticket</h1>
          <p className="text-muted-foreground">Atualize as informações do ticket</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Informações do Ticket</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="titulo">Título *</Label>
                <Input
                  id="titulo"
                  value={formData.titulo}
                  onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo *</Label>
                <Select
                  value={formData.tipo}
                  onValueChange={(value: 'incidente' | 'requisicao' | 'problema' | 'mudanca' | 'consulta') => 
                    setFormData({ ...formData, tipo: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="incidente">Incidente</SelectItem>
                    <SelectItem value="requisicao">Requisição</SelectItem>
                    <SelectItem value="problema">Problema</SelectItem>
                    <SelectItem value="mudanca">Mudança</SelectItem>
                    <SelectItem value="consulta">Consulta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição *</Label>
              <Textarea
                id="descricao"
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                rows={5}
                required
              />
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="categoria">Categoria *</Label>
                <Select
                  value={formData.categoria}
                  onValueChange={(value) => setFormData({ ...formData, categoria: value, subcategoria: '' })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((cat) => (
                      <SelectItem key={cat.id} value={cat.nome}>
                        {cat.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {categoriaSelecionada?.subcategorias && categoriaSelecionada.subcategorias.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="subcategoria">Subcategoria</Label>
                  <Select
                    value={formData.subcategoria}
                    onValueChange={(value) => setFormData({ ...formData, subcategoria: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoriaSelecionada.subcategorias.map((sub) => (
                        <SelectItem key={sub} value={sub}>
                          {sub}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="prioridade">Prioridade *</Label>
                <Select
                  value={formData.prioridade}
                  onValueChange={(value: 'baixa' | 'normal' | 'alta' | 'urgente') => 
                    setFormData({ ...formData, prioridade: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: 'aberto' | 'em_progresso' | 'aguardando_cliente' | 'aguardando_terceiro' | 'resolvido' | 'fechado' | 'cancelado') => 
                    setFormData({ ...formData, status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberto">Aberto</SelectItem>
                    <SelectItem value="em_progresso">Em Progresso</SelectItem>
                    <SelectItem value="aguardando_cliente">Aguardando Cliente</SelectItem>
                    <SelectItem value="aguardando_terceiro">Aguardando Terceiro</SelectItem>
                    <SelectItem value="resolvido">Resolvido</SelectItem>
                    <SelectItem value="fechado">Fechado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <h3 className="font-semibold mb-4">Informações do Solicitante</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="solicitanteNome">Nome *</Label>
                  <Input
                    id="solicitanteNome"
                    value={formData.solicitanteNome}
                    onChange={(e) => setFormData({ ...formData, solicitanteNome: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="solicitanteEmail">E-mail *</Label>
                  <Input
                    id="solicitanteEmail"
                    type="email"
                    value={formData.solicitanteEmail}
                    onChange={(e) => setFormData({ ...formData, solicitanteEmail: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="solicitanteTelefone">Telefone</Label>
                  <Input
                    id="solicitanteTelefone"
                    value={formData.solicitanteTelefone}
                    onChange={(e) => setFormData({ ...formData, solicitanteTelefone: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4 pt-4">
              <Link href={`/tickets/${params.id}`}>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </Link>
              <Button type="submit" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
