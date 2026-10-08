'use client';

/**
 * Papéis do utilizador (#176) — uma caixa por papel do tenant. Secção controlada: a
 * selecção vive no formulário de edição, que a grava com o único «Guardar» do ecrã
 * (action `atribuirRoles`). As recusas (delegação do #181, último administrador) vêm do
 * serviço e chegam aqui por `erro`.
 */

import { Checkbox } from '@/components/ui/checkbox';
import { FormSection } from '@/components/patterns';
import type { RoleRow } from '@/server/services/plataforma/user-admin.interface';

interface PapeisUtilizadorFormProps {
  roles: RoleRow[];
  escolhidos: string[];
  onChange: (escolhidos: string[]) => void;
  erro: string | null;
  disabled?: boolean;
}

export function PapeisUtilizadorForm({ roles, escolhidos, onChange, erro, disabled }: PapeisUtilizadorFormProps) {
  const alternar = (roleId: string, marcado: boolean) => {
    const semEste = escolhidos.filter((id) => id !== roleId);
    onChange(marcado ? [...semEste, roleId] : semEste);
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
                  disabled={disabled}
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

      {escolhidos.length === 0 && (
        <p className="text-sm text-destructive">Escolha pelo menos um papel.</p>
      )}

      {erro && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {erro}
        </div>
      )}
    </FormSection>
  );
}
