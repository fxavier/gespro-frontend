
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Plus, 
  Package,
  Edit,
  Trash2,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { PacoteServicoStorage } from '@/lib/storage/servico-storage';
import { formatCurrency } from '@/lib/format-currency';

export default function PacotesPage() {
  const [pacotes, setPacotes] = useState<any[]>([]);

  useEffect(() => {
    const dados = PacoteServicoStorage.getPacotes();
    setPacotes(dados);
  }, []);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Pacotes de Serviços
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestão de pacotes e combos de serviços
          </p>
        </div>
        <Button asChild>
          <Link href="/servicos/pacotes/novo">
            <Plus className="h-4 w-4 mr-2" />
            Novo Pacote
          </Link>
        </Button>
      </div>

      {/* Cartões de Pacotes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {pacotes.map((pacote) => (
          <Card key={pacote.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center space-x-2">
                    <Package className="h-5 w-5" />
                    <span>{pacote.nome}</span>
                  </CardTitle>
                  <CardDescription className="mt-1">{pacote.codigo}</CardDescription>
                </div>
                <Badge variant={pacote.ativo ? 'default' : 'secondary'}>
                  {pacote.ativo ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {pacote.descricao}
              </p>

              <div className="space-y-2">
                <p className="text-sm font-medium">Serviços inclusos:</p>
                <div className="space-y-1">
                  {pacote.servicos.slice(0, 3).map((servico: any, idx: number) => (
                    <p key={idx} className="text-sm text-gray-600">
                      • {servico.servicoNome} (x{servico.quantidade})
                    </p>
                  ))}
                  {pacote.servicos.length > 3 && (
                    <p className="text-sm text-gray-500">
                      +{pacote.servicos.length - 3} mais...
                    </p>
                  )}
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-600">Preço Total:</span>
                  <span className="font-bold">{formatCurrency(pacote.precoTotal)}</span>
                </div>
                {pacote.precoComDesconto && (
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-gray-600">Com Desconto:</span>
                    <span className="font-bold text-green-600">
                      {formatCurrency(pacote.precoComDesconto)}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" asChild>
                  <Link href={`/servicos/pacotes/${pacote.id}`}>
                    <Edit className="h-4 w-4 mr-1" />
                    Editar
                  </Link>
                </Button>
                <Button variant="ghost" size="sm">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {pacotes.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">Nenhum pacote cadastrado</p>
            <p className="text-sm text-gray-400 mt-1">
              Crie um novo pacote para oferecer combos de serviços
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
