
'use client';

import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/ThemeToggle';
import Sidebar from './Sidebar';
import {
  Building2,
  LogOut,
  Bell,
  Search,
  User
} from 'lucide-react';

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { tenant, usuario, logout } = useAuth();

  return (
    <div className="h-screen flex bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <Sidebar />

      {/* Conteúdo Principal */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Cabeçalho Superior */}
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Informações da Empresa */}
            <div className="flex items-center space-x-4">
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {tenant?.nomeEmpresa}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  NUIT: {tenant?.nuit} • {tenant?.cidade}, {tenant?.provincia}
                </p>
              </div>
            </div>

            {/* Ações do Cabeçalho */}
            <div className="flex items-center space-x-4">
              {/* Barra de Pesquisa */}
              <div className="hidden md:flex items-center space-x-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Pesquisar produtos, clientes..."
                    className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Notificações */}
              <Button variant="ghost" size="sm" className="relative">
                <Bell className="h-5 w-5" />
                <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  3
                </span>
              </Button>

              {/* Alternador de Tema */}
              <ThemeToggle />

              {/* Informações do Utilizador */}
              <div className="flex items-center space-x-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {usuario?.nome}
                  </p>
                  <div className="flex items-center justify-end space-x-2">
                    <Badge variant="secondary" className="text-xs">
                      {usuario?.funcao}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {tenant?.planoAssinatura}
                    </Badge>
                  </div>
                </div>

                <Button variant="ghost" size="sm" className="h-8 w-8 rounded-full p-0">
                  <User className="h-4 w-4" />
                </Button>

                <Button variant="outline" size="sm" onClick={logout}>
                  <LogOut className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Sair</span>
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Área de Conteúdo */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
