'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getSystemModuleById } from '@/data/system-modules';
import {
  Building2,
  ShieldCheck,
  Users,
  FileText,
  Globe,
  Layers,
  KeyRound,
  ShieldAlert
} from 'lucide-react';

export default function CoreTenancyDashboardPage() {
  const moduleInfo = getSystemModuleById('core-tenancy');

  if (!moduleInfo) {
    return null;
  }

  const estatisticas = [
    {
      label: 'Tenants Ativos',
      value: '18',
      helper: '+2 vs último mês',
      icon: Building2,
      color: 'text-blue-600'
    },
    {
      label: 'Utilizadores',
      value: '214',
      helper: '32 administradores',
      icon: Users,
      color: 'text-emerald-600'
    },
    {
      label: 'Séries Documentais',
      value: '64',
      helper: '9 expirando em 30 dias',
      icon: Layers,
      color: 'text-purple-600'
    },
    {
      label: 'Validações BI/NUIT',
      value: '1.482',
      helper: 'Últimos 7 dias',
      icon: ShieldCheck,
      color: 'text-orange-500'
    }
  ];

  const eventosRecentes = [
    {
      tipo: 'Série Documental',
      descricao: 'Nova série "FAT-2025" criada para o tenant Zambeze Agro',
      data: 'Hoje · 09:42',
      status: 'configurado'
    },
    {
      tipo: 'Configuração Fiscal',
      descricao: 'Atualização da taxa de ISPC do tenant UrbanFoods',
      data: 'Ontem · 18:10',
      status: 'pendente'
    },
    {
      tipo: 'Utilizador',
      descricao: 'Andre Matola promoveu-se para Tenant Admin',
      data: 'Ontem · 10:21',
      status: 'aprovado'
    }
  ];

  const verificacoes = [
    { titulo: 'NUIT', resultado: '100% válido', icon: ShieldCheck, color: 'text-green-600' },
    { titulo: 'BI', resultado: '98,4% válido', icon: ShieldAlert, color: 'text-amber-600' },
    { titulo: 'Email', resultado: '92% válido', icon: Globe, color: 'text-blue-600' }
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold">{moduleInfo.title}</h1>
          <Badge variant="outline" className="text-xs">
            {moduleInfo.springModule}
          </Badge>
        </div>
        <p className="text-muted-foreground max-w-3xl">{moduleInfo.description}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="default">
            <Link href="/dashboard">
              <Users className="mr-2 h-4 w-4" />Gerir Tenants
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">
              <FileText className="mr-2 h-4 w-4" />Configurar Séries
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/dashboard">
              <ShieldCheck className="mr-2 h-4 w-4" />Validar Identificadores
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {estatisticas.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-3xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{stat.helper}</p>
                  </div>
                  <Icon className={`h-10 w-10 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Responsabilidades chave</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm text-muted-foreground">
              {moduleInfo.responsibilities.map((responsibility) => (
                <li key={responsibility} className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-blue-500" />
                  <span>{responsibility}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verificações recentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {verificacoes.map((verificacao) => {
              const Icon = verificacao.icon;
              return (
                <div key={verificacao.titulo} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{verificacao.titulo}</p>
                    <p className="text-sm text-muted-foreground">{verificacao.resultado}</p>
                  </div>
                  <Icon className={`h-5 w-5 ${verificacao.color}`} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Utilitários Partilhados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-muted-foreground">
              {moduleInfo.typescriptModels.map((model) => (
                <div key={model} className="rounded-lg border p-3">
                  <p className="font-medium text-gray-900 dark:text-gray-100">{model}</p>
                  <p>Disponível no shared kernel</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Eventos Recentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {eventosRecentes.map((evento) => (
              <div key={evento.descricao} className="rounded-lg border p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{evento.tipo}</span>
                  <span>{evento.data}</span>
                </div>
                <p className="mt-2 text-sm font-medium">{evento.descricao}</p>
                <Badge
                  variant={evento.status === 'aprovado' ? 'default' : evento.status === 'pendente' ? 'destructive' : 'secondary'}
                  className="mt-3 capitalize"
                >
                  {evento.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Segurança &amp; Compliance</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border p-4">
            <KeyRound className="h-5 w-5 text-blue-600" />
            <p className="mt-2 font-semibold">Gestão de Acessos</p>
            <p className="text-sm text-muted-foreground">
              Políticas de password e MFA aplicadas em todos os tenants.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <ShieldCheck className="h-5 w-5 text-green-600" />
            <p className="mt-2 font-semibold">Auditoria</p>
            <p className="text-sm text-muted-foreground">
              Log centralizado de alterações em configurações críticas.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <Globe className="h-5 w-5 text-purple-600" />
            <p className="mt-2 font-semibold">Localização Fiscal</p>
            <p className="text-sm text-muted-foreground">
              Controlo de províncias/distritos e conversores monetários.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
