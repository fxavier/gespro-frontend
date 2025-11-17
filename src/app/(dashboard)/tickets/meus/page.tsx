
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TicketStorage } from '@/lib/storage/ticket-storage';
import { Ticket } from '@/types/ticket';
import { UserCircle, Eye, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function MeusTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTickets();
  }, []);

  const loadTickets = () => {
    setLoading(true);
    const allTickets = TicketStorage.getTickets();
    const meusTickets = allTickets.filter(
      t => t.atribuidoParaId === 'user-1' && !['fechado', 'cancelado'].includes(t.status)
    );
    setTickets(meusTickets);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando tickets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <UserCircle className="h-8 w-8" />
            Meus Tickets
          </h1>
          <p className="text-muted-foreground">Tickets atribuídos a você</p>
        </div>
        <Badge variant="secondary" className="text-lg px-4 py-2">
          {tickets.length} tickets
        </Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          {tickets.length === 0 ? (
            <div className="text-center py-12">
              <UserCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Você não tem tickets atribuídos</p>
            </div>
          ) : (
            <div className="divide-y">
              {tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="p-4 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium">{ticket.numero}</span>
                        <Badge variant={
                          ticket.prioridade === 'urgente' ? 'destructive' :
                          ticket.prioridade === 'alta' ? 'default' :
                          'secondary'
                        }>
                          {ticket.prioridade}
                        </Badge>
                        <Badge variant="outline">
                          {ticket.status.replace('_', ' ')}
                        </Badge>
                        {ticket.sla.emAtraso && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Em Atraso
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold mb-1">{ticket.titulo}</h3>
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                        {ticket.descricao}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{ticket.solicitanteNome}</span>
                        <span>•</span>
                        <span>{ticket.categoria}</span>
                        <span>•</span>
                        <span>{format(new Date(ticket.tempos.dataAbertura), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>
                      </div>
                    </div>
                    <Link href={`/tickets/${ticket.id}`}>
                      <Button variant="outline" size="sm">
                        <Eye className="mr-2 h-4 w-4" />
                        Ver Detalhes
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
