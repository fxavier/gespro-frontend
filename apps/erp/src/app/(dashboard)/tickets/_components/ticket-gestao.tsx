'use client';

/**
 * Gestão de um ticket no detalhe (#169): atribuir agente, comentar e avaliar.
 *
 * Sem modais — tudo inline. Mesmo padrão de `TicketAcoes`: `useTransition` → action →
 * toast → `router.refresh()`. O nome do agente nunca sai daqui: só o id; o servidor lê
 * `User.nome`.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ComboboxRemoto, type ComboboxOption } from '@/components/patterns';
import {
  atribuirTicketAction,
  adicionarComentarioTicketAction,
  avaliarTicketAction,
  procurarAgentesTicketAction,
} from '@/server/actions/tickets.actions';

type Utilizador = { id: string; nome: string; email: string };

const opcao = (u: Utilizador): ComboboxOption => ({ value: u.id, label: `${u.nome} — ${u.email}` });

// ─── Atribuir agente ──────────────────────────────────────────────────────────

export function AtribuirAgenteTicket({
  ticketId,
  agenteActualId,
  agentesIniciais,
}: {
  ticketId: string;
  agenteActualId: string | null;
  agentesIniciais: Utilizador[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [agenteId, setAgenteId] = useState(agenteActualId ?? '');

  const procurar = async (q: string): Promise<ComboboxOption[] | null> => {
    const r = await procurarAgentesTicketAction({ q });
    return r.ok ? r.data.map(opcao) : null;
  };

  const atribuir = () => {
    if (!agenteId) {
      toast.error('Escolha um agente.');
      return;
    }
    iniciar(async () => {
      const r = await atribuirTicketAction({ ticketId, atribuidoParaId: agenteId });
      if (r.ok) {
        toast.success(`Ticket atribuído a ${r.data.atribuidoParaNome ?? 'agente'}.`);
        router.refresh();
      } else {
        toast.error(r.error.message ?? 'Erro ao atribuir o ticket.');
      }
    });
  };

  return (
    <div className="space-y-2">
      <ComboboxRemoto
        aria-label="Agente a atribuir"
        opcoesIniciais={agentesIniciais.map(opcao)}
        procurar={procurar}
        value={agenteId}
        onChange={setAgenteId}
        placeholder="Escolher agente…"
        emptyText="Nenhum utilizador encontrado."
        disabled={pendente}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={atribuir}
        disabled={pendente || !agenteId || agenteId === agenteActualId}
      >
        {pendente ? 'A atribuir…' : 'Atribuir'}
      </Button>
    </div>
  );
}

// ─── Comentar ─────────────────────────────────────────────────────────────────

export function ComentarTicket({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [texto, setTexto] = useState('');
  const [interna, setInterna] = useState(false);
  const campoId = `comentario-${ticketId}`;
  const internaId = `comentario-interno-${ticketId}`;

  const comentar = () => {
    if (!texto.trim()) {
      toast.error('Escreva o comentário.');
      return;
    }
    iniciar(async () => {
      const r = await adicionarComentarioTicketAction({
        ticketId,
        descricao: texto.trim(),
        visibilidade: interna ? 'INTERNA' : 'PUBLICA',
      });
      if (r.ok) {
        toast.success('Comentário adicionado.');
        setTexto('');
        setInterna(false);
        router.refresh();
      } else {
        toast.error(r.error.message ?? 'Erro ao adicionar o comentário.');
      }
    });
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={campoId}>Comentário</Label>
      <Textarea
        id={campoId}
        className="resize-none"
        placeholder="Escreva uma resposta ou nota…"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={3}
        maxLength={5000}
        disabled={pendente}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Checkbox id={internaId} checked={interna} onCheckedChange={(v) => setInterna(v === true)} />
          <Label htmlFor={internaId} className="text-sm font-normal">
            Nota interna (marcada como interna no histórico)
          </Label>
        </div>
        <Button type="button" size="sm" onClick={comentar} disabled={pendente || !texto.trim()}>
          {pendente ? 'A enviar…' : 'Comentar'}
        </Button>
      </div>
    </div>
  );
}

// ─── Avaliar ──────────────────────────────────────────────────────────────────

const NOTAS = [1, 2, 3, 4, 5] as const;

export function AvaliarTicket({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [nota, setNota] = useState('');
  const [observacao, setObservacao] = useState('');
  const obsId = `avaliacao-obs-${ticketId}`;

  const avaliar = () => {
    if (!nota) {
      toast.error('Escolha uma nota de 1 a 5.');
      return;
    }
    iniciar(async () => {
      const r = await avaliarTicketAction({
        ticketId,
        nota: Number(nota),
        comentario: observacao.trim() || undefined,
      });
      if (r.ok) {
        toast.success('Avaliação registada. Obrigado!');
        router.refresh();
      } else {
        toast.error(r.error.message ?? 'Erro ao registar a avaliação.');
      }
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Como avalia a resolução deste ticket?</p>
      <RadioGroup
        aria-label="Nota da avaliação"
        value={nota}
        onValueChange={setNota}
        className="flex gap-4"
        disabled={pendente}
      >
        {NOTAS.map((n) => (
          <div key={n} className="flex items-center gap-1.5">
            <RadioGroupItem value={String(n)} id={`nota-${ticketId}-${n}`} />
            <Label htmlFor={`nota-${ticketId}-${n}`} className="tabular-nums">
              {n}
            </Label>
          </div>
        ))}
      </RadioGroup>
      <div className="space-y-1.5">
        <Label htmlFor={obsId}>Observação (opcional)</Label>
        <Textarea
          id={obsId}
          className="resize-none"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          maxLength={1000}
          disabled={pendente}
        />
      </div>
      <Button type="button" size="sm" onClick={avaliar} disabled={pendente || !nota}>
        {pendente ? 'A enviar…' : 'Avaliar'}
      </Button>
    </div>
  );
}
