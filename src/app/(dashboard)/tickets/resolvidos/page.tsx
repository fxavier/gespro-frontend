
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TicketStorage } from '@/lib/storage/ticket-storage';
import { Ticket } from '@/types/ticket';
import { CheckCircle, Eye, Star } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function TicketsResolvidos() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTickets();
  }, []);

  const loadTickets = () => {
    setLoading(true);
    const allTickets = TicketStorage.getTickets();
    const resolvidos = allTickets.filter(
      t => ['resolvido', 'fechado'].includes(t.status)
    );
    setTickets(resolvidos);
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
            <CheckCircle className="h-8 w-8 text-green-500" />
            Tickets Resolvidos
          </h1>
          <p className="text-muted-foreground">Tickets resolvidos e fechados</p>
        </div>
        <Badge variant="secondary" className="text-lg px-4 py-2">
          {tickets.length} tickets
        </Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          {tickets.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum ticket resolvido</p>
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
                        <Badge variant="secondary">
                          {ticket.status.replace('_', ' ')}
                        </Badge>
                        {ticket.avaliacao && (
                          <Badge variant="outline" className="gap-1">
                            <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                            {ticket.avaliacao.nota}/5
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
                        {ticket.tempos.dataResolucao && (
                          <>
                            <span>Resolvido em {format(new Date(ticket.tempos.dataResolucao), 'dd/MM/yyyy', { locale: ptBR })}</span>
                          </>
                        )}
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
