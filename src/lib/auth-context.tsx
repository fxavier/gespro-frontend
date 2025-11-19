
'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Tenant, Usuario } from '@/types/tenant';

interface AuthContextType {
  tenant: Tenant | null;
  usuario: Usuario | null;
  isAuthenticated: boolean;
  login: (email: string, senha: string) => Promise<boolean>;
  logout: () => void;
  registrarTenant: (dadosTenant: Partial<Tenant>, dadosUsuario: Partial<Usuario>, senha: string) => Promise<boolean>;
  carregando: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  const isAuthenticated = !!tenant && !!usuario;

  useEffect(() => {
    // Verificar se há dados de autenticação salvos no localStorage
    const tenantSalvo = localStorage.getItem('tenant');
    const usuarioSalvo = localStorage.getItem('usuario');

    if (tenantSalvo && usuarioSalvo) {
      try {
        setTenant(JSON.parse(tenantSalvo));
        setUsuario(JSON.parse(usuarioSalvo));
      } catch (error) {
        console.error('Erro ao carregar dados de autenticação:', error);
        localStorage.removeItem('tenant');
        localStorage.removeItem('usuario');
      }
    }
    setCarregando(false);
  }, []);

  const login = async (email: string, senha: string): Promise<boolean> => {
    try {
      setCarregando(true);
      
      // Simular autenticação - em produção seria uma chamada à API
      const tenantsMock = JSON.parse(localStorage.getItem('tenants') || '[]');
      const usuariosMock = JSON.parse(localStorage.getItem('usuarios') || '[]');

      const usuarioEncontrado = usuariosMock.find((u: Usuario) => u.email === email);
      if (!usuarioEncontrado) {
        return false;
      }

      const tenantEncontrado = tenantsMock.find((t: Tenant) => t.id === usuarioEncontrado.tenantId);
      if (!tenantEncontrado || !tenantEncontrado.statusAtivo) {
        return false;
      }

      // Verificar senha (em produção seria hash)
      const senhasSalvas = JSON.parse(localStorage.getItem('senhas') || '{}');
      if (senhasSalvas[usuarioEncontrado.id] !== senha) {
        return false;
      }

      setTenant(tenantEncontrado);
      setUsuario(usuarioEncontrado);

      localStorage.setItem('tenant', JSON.stringify(tenantEncontrado));
      localStorage.setItem('usuario', JSON.stringify(usuarioEncontrado));

      return true;
    } catch (error) {
      console.error('Erro no login:', error);
      return false;
    } finally {
      setCarregando(false);
    }
  };

  const logout = () => {
    setTenant(null);
    setUsuario(null);
    localStorage.removeItem('tenant');
    localStorage.removeItem('usuario');
  };

  const registrarTenant = async (
    dadosTenant: Partial<Tenant>,
    dadosUsuario: Partial<Usuario>,
    senha: string
  ): Promise<boolean> => {
    try {
      setCarregando(true);

      const novoTenantId = `tenant_${Date.now()}`;
      const novoUsuarioId = `user_${Date.now()}`;

      const novoTenant: Tenant = {
        id: novoTenantId,
        nomeEmpresa: dadosTenant.nomeEmpresa || '',
        nuit: dadosTenant.nuit || '',
        email: dadosTenant.email || '',
        telefone: dadosTenant.telefone,
        endereco: dadosTenant.endereco,
        cidade: dadosTenant.cidade,
        provincia: dadosTenant.provincia,
        timezone: dadosTenant.timezone || 'Africa/Maputo',
        moedaBase: dadosTenant.moedaBase || 'MZN',
        planoAssinatura: dadosTenant.planoAssinatura || 'basico',
        statusAtivo: true,
        dataRegistro: new Date().toISOString(),
        configuracoesFiscais: {
          regimeIva: 'normal',
          taxaIvaDefault: 16,
          seriesFaturas: [
            {
              id: 'serie_1',
              tipo: 'fatura',
              serie: 'FT',
              proximoNumero: 1,
              ativo: true
            }
          ],
          proximoNumeroFatura: 1,
          proximoNumeroRecibo: 1
        }
      };

      const novoUsuario: Usuario = {
        id: novoUsuarioId,
        tenantId: novoTenantId,
        nome: dadosUsuario.nome || '',
        email: dadosUsuario.email || '',
        funcao: 'TENANT_ADMIN',
        ativo: true,
        permissoes: ['*']
      };

      // Salvar no localStorage
      const tenants = JSON.parse(localStorage.getItem('tenants') || '[]');
      const usuarios = JSON.parse(localStorage.getItem('usuarios') || '[]');
      const senhas = JSON.parse(localStorage.getItem('senhas') || '{}');

      tenants.push(novoTenant);
      usuarios.push(novoUsuario);
      senhas[novoUsuarioId] = senha;

      localStorage.setItem('tenants', JSON.stringify(tenants));
      localStorage.setItem('usuarios', JSON.stringify(usuarios));
      localStorage.setItem('senhas', JSON.stringify(senhas));

      setTenant(novoTenant);
      setUsuario(novoUsuario);

      localStorage.setItem('tenant', JSON.stringify(novoTenant));
      localStorage.setItem('usuario', JSON.stringify(novoUsuario));

      return true;
    } catch (error) {
      console.error('Erro no registro:', error);
      return false;
    } finally {
      setCarregando(false);
    }
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
        carregando
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
