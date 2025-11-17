
'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { User, Palette, Shield, Lock } from 'lucide-react';
import PerfilTab from '@/components/configuracoes/PerfilTab';
import PreferenciasTab from '@/components/configuracoes/PreferenciasTab';
import SegurancaTab from '@/components/configuracoes/SegurancaTab';
import PrivacidadeTab from '@/components/configuracoes/PrivacidadeTab';

type TabType = 'perfil' | 'preferencias' | 'seguranca' | 'privacidade';

interface TabItem {
  id: TabType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  component: React.ComponentType;
}

const tabs: TabItem[] = [
  {
    id: 'perfil',
    label: 'Perfil do Usuário',
    icon: User,
    component: PerfilTab,
  },
  {
    id: 'preferencias',
    label: 'Preferências do Sistema',
    icon: Palette,
    component: PreferenciasTab,
  },
  {
    id: 'seguranca',
    label: 'Segurança',
    icon: Shield,
    component: SegurancaTab,
  },
  {
    id: 'privacidade',
    label: 'Privacidade',
    icon: Lock,
    component: PrivacidadeTab,
  },
];

export default function ConfiguracoesPage() {
  const [activeTab, setActiveTab] = useState<TabType>('perfil');

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component;

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground mt-2">
          Gerencie suas preferências e configurações do sistema
        </p>
      </div>

      <div className="flex gap-6">
        {/* Menu Lateral */}
        <Card className="w-64 h-fit">
          <ScrollArea className="h-full">
            <nav className="p-2 space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors',
                      'hover:bg-accent hover:text-accent-foreground',
                      activeTab === tab.id
                        ? 'bg-[#1877F2] text-white hover:bg-[#1877F2]/90'
                        : 'text-muted-foreground'
                    )}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span className="font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </ScrollArea>
        </Card>

        {/* Conteúdo da Aba */}
        <div className="flex-1">
          {ActiveComponent && <ActiveComponent />}
        </div>
      </div>
    </div>
  );
}
