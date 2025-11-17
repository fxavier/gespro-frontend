
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { TicketStorage } from '@/lib/storage/ticket-storage';
import { Ticket, AtividadeTicket } from '@/types/ticket';
import { 
  ArrowLeft, 
  Clock, 
  User, 
  Mail, 
  Phone, 
  Tag,
  MessageSquare,
  Paperclip,
  Star,
  Edit,
  Trash2,
  Send
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function DetalhesTicket() {
  const params = useParams();
  const router = useRouter();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [novoComentario, setNovoComentario] = useState('');
  const [enviandoComentario, setEnviandoComentario] = useState(false);

  useEffect(() => {
    loadTicket();
  }, [params.id]);

  const loadTicket = () => {
    setLoading(true);
    const ticketData = TicketStorage.getTicketById(params.id as string);
    setTicket(ticketData);
    setLoading(false);
  };

  const handleStatusChange = (novoStatus: string) => {
    if (!ticket) return;

    const updated = TicketStorage.updateTicket(ticket.id, {
      status: novoStatus as any,
      atividades: [
        ...(ticket.atividades || []),
        {
          id: Date.now().toString(),
          tipo: 'mudanca_status',
          descricao: `Status alterado para ${novoStatus.replace('_', ' ')}`,
          autorId: 'user-1',
          autorNome: 'Usuário Atual',
          visibilidade: 'interna',
          dataCriacao: new Date().toISOString()
        }
      ]
    });

    if (updated) {
      setTicket(updated);
      toast.success('Status atualizado com sucesso!');
    }
  };

  const handlePrioridadeChange = (novaPrioridade: string) => {
    if (!ticket) return;

    const updated = TicketStorage.updateTicket(ticket.id, {
      prioridade: novaPrioridade as any,
      atividades: [
        ...(ticket.atividades || []),
        {
          id: Date.now().toString(),
          tipo: 'mudanca_status',
          descricao: `Prioridade alterada para ${novaPrioridade}`,
          autorId: 'user-1',
          autorNome: 'Usuário Atual',
          visibilidade: 'interna',
          dataCriacao: new Date().toISOString()
        }
      ]
    });

    if (updated) {
      setTicket(updated);
      toast.success('Prioridade atualizada com sucesso!');
    }
  };

  const handleAdicionarComentario = () => {
    if (!ticket || !novoComentario.trim()) return;

    setEnviandoComentario(true);

    const novaAtividade: AtividadeTicket = {
      id: Date.now().toString(),
      tipo: 'comentario',
      descricao: novoComentario,
      autorId: 'user-1',
      autorNome: 'Usuário Atual',
      visibilidade: 'publica',
      dataCriacao: new Date().toISOString()
    };

    const updated = TicketStorage.updateTicket(ticket.id, {
      atividades: [...(ticket.atividades || []), novaAtividade]
    });

    if (updated) {
      setTicket(updated);
      setNovoComentario('');
      toast.success('Comentário adicionado com sucesso!');
    }

    setEnviandoComentario(false);
  };

  const handleExcluir = () => {
    if (!ticket) return;

    if (confirm('Tem certeza que deseja excluir este ticket?')) {
      const success = TicketStorage.deleteTicket(ticket.id);
      if (success) {
        toast.success('Ticket excluído com sucesso!');
        router.push('/tickets/lista');
      } else {
        toast.error('Erro ao excluir ticket');
      }
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      aberto: 'default',
      em_progresso: 'secondary',
      aguardando_cliente: 'outline',
      aguardando_terceiro: 'outline',
      resolvido: 'secondary',
      fechado: 'outline',
      cancelado: 'destructive'
    };

    return (
      <Badge variant={variants[status] || 'default'}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const getPrioridadeBadge = (prioridade: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      baixa: 'secondary',
      normal: 'default',
      alta: 'default',
      urgente: 'destructive'
    };

    return (
      <Badge variant={variants[prioridade] || 'default'}>
        {prioridade}
      </Badge>
    );
  };

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

  if (!ticket) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Ticket não encontrado</p>
            <Link href="/tickets/lista">
              <Button className="mt-4">Voltar para lista</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/tickets/lista">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">{ticket.numero}</h1>
              {getStatusBadge(ticket.status)}
              {getPrioridadeBadge(ticket.prioridade)}
              {ticket.sla.emAtraso && (
                <Badge variant="destructive">Em Atraso</Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1">{ticket.titulo}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/tickets/${ticket.id}/editar`}>
            <Button variant="outline">
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Button>
          </Link>
          <Button variant="destructive" onClick={handleExcluir}>
            <Trash2 className="mr-2 h-4 w-4" />
            Excluir
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Descrição</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{ticket.descricao}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Atividades e Comentários
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ticket.atividades && ticket.atividades.length > 0 ? (
                ticket.atividades.map((atividade) => (
                  <div key={atividade.id} className="border-l-2 border-primary pl-4 py-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{atividade.autorNome}</span>
                          <Badge variant="outline" className="text-xs">
                            {atividade.tipo.replace('_', ' ')}
                          </Badge>
                          {atividade.visibilidade === 'interna' && (
                            <Badge variant="secondary" className="text-xs">
                              Interno
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm mt-1">{atividade.descricao}</p>
                        {atividade.detalhes && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {atividade.detalhes}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(atividade.dataCriacao), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-4">
                  Nenhuma atividade registrada
                </p>
              )}

              <Separator />

              <div className="space-y-2">
                <label className="text-sm font-medium">Adicionar Comentário</label>
                <Textarea
                  value={novoComentario}
                  onChange={(e) => setNovoComentario(e.target.value)}
                  placeholder="Digite seu comentário..."
                  rows={3}
                />
                <Button 
                  onClick={handleAdicionarComentario}
                  disabled={!novoComentario.trim() || enviandoComentario}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {enviandoComentario ? 'Enviando...' : 'Enviar Comentário'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {ticket.avaliacao && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-500" />
                  Avaliação
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-5 w-5 ${
                        star <= ticket.avaliacao!.nota
                          ? 'fill-yellow-500 text-yellow-500'
                          : 'text-gray-300'
                      }`}
                    />
                  ))}
                  <span className="font-medium">{ticket.avaliacao.nota}/5</span>
                </div>
                {ticket.avaliacao.comentario && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {ticket.avaliacao.comentario}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Avaliado por {ticket.avaliacao.avaliadoPorNome} em{' '}
                  {format(new Date(ticket.avaliacao.dataAvaliacao), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select value={ticket.status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="mt-1">
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

              <div>
                <label className="text-sm font-medium">Prioridade</label>
                <Select value={ticket.prioridade} onValueChange={handlePrioridadeChange}>
                  <SelectTrigger className="mt-1">
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

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Tipo:</span>
                  <span>{ticket.tipo}</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Categoria:</span>
                  <span>{ticket.categoria}</span>
                </div>

                {ticket.subcategoria && (
                  <div className="flex items-center gap-2 text-sm">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Subcategoria:</span>
                    <span>{ticket.subcategoria}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Solicitante</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{ticket.solicitanteNome}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{ticket.solicitanteEmail}</span>
              </div>
              {ticket.solicitanteTelefone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{ticket.solicitanteTelefone}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SLA</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Tempo de Resposta</span>
                  <span className="font-medium">{ticket.sla.tempoResposta}h</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Limite: {format(new Date(ticket.sla.dataLimiteResposta), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Tempo de Resolução</span>
                  <span className="font-medium">{ticket.sla.tempoResolucao}h</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Limite: {format(new Date(ticket.sla.dataLimiteResolucao), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                </p>
              </div>

              {ticket.sla.emAtraso && (
                <Badge variant="destructive" className="w-full justify-center">
                  SLA em Atraso
                </Badge>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tempos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Abertura:</span>
                <span>{format(new Date(ticket.tempos.dataAbertura), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>
              </div>

              {ticket.tempos.dataPrimeiraResposta && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Primeira Resposta:</span>
                  <span>{format(new Date(ticket.tempos.dataPrimeiraResposta), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>
                </div>
              )}

              {ticket.tempos.dataResolucao && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Resolução:</span>
                  <span>{format(new Date(ticket.tempos.dataResolucao), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>
                </div>
              )}

              {ticket.tempos.dataFechamento && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Fechamento:</span>
                  <span>{format(new Date(ticket.tempos.dataFechamento), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
