
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
import { TicketStorage, CategoriaTicketStorage, ConfiguracaoStorage } from '@/lib/storage/ticket-storage';
import { Ticket } from '@/types/ticket';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function NovoTicket() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const categorias = CategoriaTicketStorage.getCategorias();
  const config = ConfiguracaoStorage.getConfiguracoes();

  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    tipo: 'incidente' as const,
    categoria: '',
    subcategoria: '',
    prioridade: 'normal' as const,
    solicitanteNome: '',
    solicitanteEmail: '',
    solicitanteTelefone: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const categoriaObj = categorias.find(c => c.nome === formData.categoria);
      const slaConfig = config?.slasPadrao[formData.prioridade] || { resposta: 4, resolucao: 48 };

      const now = new Date();
      const dataLimiteResposta = new Date(now.getTime() + slaConfig.resposta * 60 * 60 * 1000);
      const dataLimiteResolucao = new Date(now.getTime() + slaConfig.resolucao * 60 * 60 * 1000);

      const novoTicket: Ticket = {
        id: Date.now().toString(),
        tenantId: 'default',
        numero: TicketStorage.getProximoNumero(),
        titulo: formData.titulo,
        descricao: formData.descricao,
        tipo: formData.tipo,
        categoria: formData.categoria,
        subcategoria: formData.subcategoria || undefined,
        prioridade: formData.prioridade,
        status: 'aberto',
        solicitanteId: 'user-' + Date.now(),
        solicitanteNome: formData.solicitanteNome,
        solicitanteEmail: formData.solicitanteEmail,
        solicitanteTelefone: formData.solicitanteTelefone || undefined,
        sla: {
          tempoResposta: slaConfig.resposta,
          tempoResolucao: slaConfig.resolucao,
          dataLimiteResposta: dataLimiteResposta.toISOString(),
          dataLimiteResolucao: dataLimiteResolucao.toISOString(),
          emAtraso: false
        },
        tempos: {
          dataAbertura: now.toISOString()
        },
        atividades: [
          {
            id: '1',
            tipo: 'sistema',
            descricao: 'Ticket criado',
            autorId: 'system',
            autorNome: 'Sistema',
            visibilidade: 'interna',
            dataCriacao: now.toISOString()
          }
        ],
        dataCriacao: now.toISOString(),
        dataAtualizacao: now.toISOString()
      };

      TicketStorage.addTicket(novoTicket);
      toast.success('Ticket criado com sucesso!');
      router.push('/tickets/lista');
    } catch (error) {
      toast.error('Erro ao criar ticket');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const categoriaSelecionada = categorias.find(c => c.nome === formData.categoria);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/tickets/lista">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Novo Ticket</h1>
          <p className="text-muted-foreground">Crie um novo ticket de suporte</p>
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
                  placeholder="Descreva brevemente o problema"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo *</Label>
                <Select
                  value={formData.tipo}
                  onValueChange={(value: any) => setFormData({ ...formData, tipo: value })}
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
                placeholder="Descreva o problema em detalhes"
                rows={5}
                required
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
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
                  onValueChange={(value: any) => setFormData({ ...formData, prioridade: value })}
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
                    placeholder="Nome completo"
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
                    placeholder="email@exemplo.com"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="solicitanteTelefone">Telefone</Label>
                  <Input
                    id="solicitanteTelefone"
                    value={formData.solicitanteTelefone}
                    onChange={(e) => setFormData({ ...formData, solicitanteTelefone: e.target.value })}
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4 pt-4">
              <Link href="/tickets/lista">
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </Link>
              <Button type="submit" disabled={loading}>
                {loading ? 'Criando...' : 'Criar Ticket'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
