'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { actualizarPreferenciaNotificacao } from '@/server/actions/notificacoes.actions';
import type { TipoNotificacao, CanalNotificacao } from '@/server/services/plataforma/notificacao.interface';
import type { PreferenciaNotificacaoItem } from '@/server/services/plataforma/notificacao.interface';

const TIPO_LABELS: Record<TipoNotificacao, string> = {
  DOCUMENTO_EXPIRADO: 'Documento Expirado',
  DOCUMENTO_PROXIMO_EXPIRAR: 'Documento Próximo a Expirar',
  MANUTENCAO_PENDENTE: 'Manutenção Pendente',
  RESET_PASSWORD: 'Recuperação de Palavra-passe',
  CONVITE_UTILIZADOR: 'Convite de Utilizador',
  ALERTA_SISTEMA: 'Alertas do Sistema',
};

const TIPO_DESCRICAO: Record<TipoNotificacao, string> = {
  DOCUMENTO_EXPIRADO: 'Alertas quando documentos de viatura ou motorista expiram.',
  DOCUMENTO_PROXIMO_EXPIRAR: 'Alertas quando documentos estão próximos da data de validade.',
  MANUTENCAO_PENDENTE: 'Alertas de manutenção preventiva em atraso.',
  RESET_PASSWORD: 'Email enviado ao solicitar recuperação de palavra-passe.',
  CONVITE_UTILIZADOR: 'Email enviado ao convidar um novo utilizador.',
  ALERTA_SISTEMA: 'Alertas gerais do sistema GestPro.',
};

const CANAIS_EDITAVEIS: TipoNotificacao[] = [
  'DOCUMENTO_EXPIRADO',
  'DOCUMENTO_PROXIMO_EXPIRAR',
  'MANUTENCAO_PENDENTE',
  'ALERTA_SISTEMA',
];

interface PreferenciaRowProps {
  tipo: TipoNotificacao;
  canaisActivos: CanalNotificacao[];
}

function PreferenciaRow({ tipo, canaisActivos }: PreferenciaRowProps) {
  const [isPending, startTransition] = useTransition();

  function handleToggle(canal: CanalNotificacao, checked: boolean) {
    const novosCanais: CanalNotificacao[] = checked
      ? [...new Set([...canaisActivos, canal])]
      : canaisActivos.filter((c) => c !== canal);

    startTransition(async () => {
      const result = await actualizarPreferenciaNotificacao({ tipo, canais: novosCanais });
      if (result.ok) {
        toast.success('Preferência actualizada');
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const editavel = CANAIS_EDITAVEIS.includes(tipo);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4 py-4 border-b last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{TIPO_LABELS[tipo]}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{TIPO_DESCRICAO[tipo]}</p>
      </div>

      {editavel ? (
        <div className="flex items-center gap-6 flex-shrink-0">
          {/* Canal In-App */}
          <div className="flex items-center gap-2">
            <Switch
              id={`${tipo}-IN_APP`}
              checked={canaisActivos.includes('IN_APP')}
              onCheckedChange={(checked) => handleToggle('IN_APP', checked)}
              disabled={isPending}
              aria-label={`Notificação in-app para ${TIPO_LABELS[tipo]}`}
            />
            <Label htmlFor={`${tipo}-IN_APP`} className="text-sm cursor-pointer">
              In-App
            </Label>
          </div>

          {/* Canal Email */}
          <div className="flex items-center gap-2">
            <Switch
              id={`${tipo}-EMAIL`}
              checked={canaisActivos.includes('EMAIL')}
              onCheckedChange={(checked) => handleToggle('EMAIL', checked)}
              disabled={isPending}
              aria-label={`Email para ${TIPO_LABELS[tipo]}`}
            />
            <Label htmlFor={`${tipo}-EMAIL`} className="text-sm cursor-pointer">
              Email
            </Label>
          </div>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground italic flex-shrink-0">
          Sempre activo
        </span>
      )}
    </div>
  );
}

interface PreferenciasFormProps {
  preferencias: PreferenciaNotificacaoItem[];
}

const TODOS_OS_TIPOS: TipoNotificacao[] = [
  'DOCUMENTO_EXPIRADO',
  'DOCUMENTO_PROXIMO_EXPIRAR',
  'MANUTENCAO_PENDENTE',
  'RESET_PASSWORD',
  'CONVITE_UTILIZADOR',
  'ALERTA_SISTEMA',
];

const CANAIS_DEFAULT: Record<TipoNotificacao, CanalNotificacao[]> = {
  DOCUMENTO_EXPIRADO: ['IN_APP', 'EMAIL'],
  DOCUMENTO_PROXIMO_EXPIRAR: ['IN_APP', 'EMAIL'],
  MANUTENCAO_PENDENTE: ['IN_APP', 'EMAIL'],
  RESET_PASSWORD: ['EMAIL'],
  CONVITE_UTILIZADOR: ['EMAIL'],
  ALERTA_SISTEMA: ['IN_APP'],
};

/**
 * Formulário de preferências de notificação — Client Component.
 * Mutações imediatas via Server Action (toggle → save instantâneo).
 */
export function PreferenciasForm({ preferencias }: PreferenciasFormProps) {
  const prefMap = new Map(preferencias.map((p) => [p.tipo, p.canais]));

  return (
    <div className="divide-y divide-border">
      {TODOS_OS_TIPOS.map((tipo) => {
        const canaisActivos =
          prefMap.get(tipo as TipoNotificacao) ??
          CANAIS_DEFAULT[tipo as TipoNotificacao] ??
          [];
        return (
          <PreferenciaRow
            key={tipo}
            tipo={tipo as TipoNotificacao}
            canaisActivos={canaisActivos as CanalNotificacao[]}
          />
        );
      })}
    </div>
  );
}
