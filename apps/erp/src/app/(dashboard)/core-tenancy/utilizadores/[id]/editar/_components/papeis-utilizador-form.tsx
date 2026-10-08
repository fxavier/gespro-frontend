'use client';

/**
 * Papéis do utilizador (#176) — uma caixa por papel do tenant; «Guardar papéis»
 * substitui a lista pela action `atribuirRoles`. As recusas (delegação do #181,
 * último administrador) vêm do serviço e ficam visíveis no ecrã.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormSection } from '@/components/patterns';
import { atribuirRoles } from '@/server/actions/plataforma.actions';
import type { UserRow, RoleRow } from '@/server/services/plataforma/user-admin.interface';

interface PapeisUtilizadorFormProps {
  utilizador: UserRow;
  roles: RoleRow[];
}

export function PapeisUtilizadorForm({ utilizador, roles }: PapeisUtilizadorFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [escolhidos, setEscolhidos] = useState<string[]>(() => utilizador.roles.map((r) => r.id));
  const [erro, setErro] = useState<string | null>(null);

  const alternar = (roleId: string, marcado: boolean) =>
    setEscolhidos((actuais) =>
      marcado ? [...actuais.filter((id) => id !== roleId), roleId] : actuais.filter((id) => id !== roleId),
    );

  const guardar = () => {
    setErro(null);
    startTransition(async () => {
      const r = await atribuirRoles({ userId: utilizador.id, roleIds: escolhidos });
      if (!r.ok) {
        setErro(r.error.message);
        toast.error(r.error.message);
        return;
      }
      toast.success('Papéis actualizados.');
      router.refresh();
    });
  };

  return (
    <FormSection title="Papéis" description="Papéis atribuídos a este utilizador">
      <div className="space-y-1.5">
        {roles.map((role) => {
          const idCaixa = `papel-${role.id}`;
          const idDescricao = `${idCaixa}-descricao`;
          return (
            <div key={role.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <div className="flex items-start gap-2">
                <Checkbox
                  id={idCaixa}
                  checked={escolhidos.includes(role.id)}
                  onCheckedChange={(v) => alternar(role.id, v === true)}
                  disabled={isPending}
                  aria-describedby={role.descricao ? idDescricao : undefined}
                  className="mt-0.5"
                />
                <div>
                  <label htmlFor={idCaixa} className="text-sm font-medium">
                    {role.nome}
                  </label>
                  {role.descricao && (
                    <p id={idDescricao} className="text-xs text-muted-foreground">
                      {role.descricao}
                    </p>
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {role.permissions.length} permissões
              </span>
            </div>
          );
        })}
      </div>

      {erro && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {erro}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={guardar} disabled={isPending || escolhidos.length === 0}>
          <Save className="h-4 w-4 mr-1.5" />
          {isPending ? 'A guardar…' : 'Guardar papéis'}
        </Button>
      </div>
    </FormSection>
  );
}
