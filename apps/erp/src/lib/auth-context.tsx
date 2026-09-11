'use client';

/**
 * Shim de AuthProvider/useAuth baseado em next-auth (sessão real).
 *
 * Mantém compatibilidade com consumidores existentes de useAuth() enquanto os
 * agentes UI paralelos migram cada componente para useSession() directamente.
 *
 * NOTA PARA AGENTES UI: Migrar cada componente que usa useAuth() para:
 *   import { useSession } from 'next-auth/react';
 *   const { data: session } = useSession();
 * Os ficheiros afectados são:
 *   - src/components/auth/LoginForm.tsx
 *   - src/components/auth/RegisterForm.tsx
 *   - src/components/dashboard/Dashboard.tsx
 *   - src/components/layout/MainLayout.tsx
 *   - src/components/configuracoes/*.tsx
 */

import React, { createContext, useContext } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import type { Tenant, Usuario } from '@/types/tenant';

interface AuthContextType {
  tenant: Tenant | null;
  usuario: Usuario | null;
  isAuthenticated: boolean;
  login: (email: string, senha: string) => Promise<boolean>;
  logout: () => void;
  registrarTenant: (
    dadosTenant: Partial<Tenant>,
    dadosUsuario: Partial<Usuario>,
    senha: string
  ) => Promise<boolean>;
  carregando: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * AuthProvider shim: usa a sessão real next-auth.
 * Não usa localStorage; não tem estado de registo de tenant (usar API dedicada).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  const carregando = status === 'loading';
  const isAuthenticated = status === 'authenticated' && !!session?.user;

  // Construir um objecto Usuario a partir da sessão next-auth
  const usuario: Usuario | null = session?.user
    ? {
        id: session.user.id,
        tenantId: session.user.tenantId,
        nome: session.user.name ?? 'Utilizador',
        email: session.user.email ?? '',
        funcao: 'TENANT_ADMIN', // permissões reais estão em session.user.permissions
        ativo: true,
        permissoes: session.user.permissions ?? [],
      }
    : null;

  // Stub de Tenant — os dados reais do tenant precisam de chamada ao servidor
  const tenant: Tenant | null = session?.user
    ? {
        id: session.user.tenantId,
        nomeEmpresa: 'GestPro',
        nuit: '',
        email: session.user.email ?? '',
        timezone: 'Africa/Maputo',
        moedaBase: 'MZN',
        planoAssinatura: 'profissional',
        statusAtivo: true,
        dataRegistro: new Date().toISOString(),
        configuracoesFiscais: {
          regimeIva: 'normal',
          taxaIvaDefault: 16,
          seriesFaturas: [],
          proximoNumeroFatura: 1,
          proximoNumeroRecibo: 1,
        },
      }
    : null;

  // Desde o ADR-0010 o login é OIDC (Keycloak): não há credenciais a validar
  // aqui — o par (email, senha) é ignorado e o browser é reencaminhado para o
  // fornecedor de identidade. Assinatura mantida por compatibilidade do shim.
  const login = async (email: string, senha: string): Promise<boolean> => {
    // ADR-0029: o provider passou a ser `credentials` e o par (email, senha)
    // voltou a ter significado — deixou de ser ignorado como no tempo do salto.
    const res = await signIn('credentials', {
      identificador: email,
      palavraPasse: senha,
      redirect: false,
    });
    return !!res && !res.error;
  };

  const logout = () => {
    // ADR-0029: sem sessão SSO, terminar é limpar o cookie local — a revogação
    // do token de renovação acontece no `events.signOut`, no servidor.
    void signOut({ callbackUrl: '/auth/login' });
  };

  // registrarTenant: funcionalidade removida do cliente — usar API de plataforma
  const registrarTenant = async (
    _dadosTenant: Partial<Tenant>,
    _dadosUsuario: Partial<Usuario>,
    _senha: string
  ): Promise<boolean> => {
    console.warn('[AuthProvider] registrarTenant() não suportado no shim. Usar API de plataforma.');
    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        tenant,
        usuario,
        isAuthenticated,
        login,
        logout,
        registrarTenant,
        carregando,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}
