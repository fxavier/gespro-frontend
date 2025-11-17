
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { BookText, Search, Plus, ThumbsUp, ThumbsDown, Eye } from 'lucide-react';

export default function BaseConhecimento() {
  const [searchTerm, setSearchTerm] = useState('');

  const artigos = [
    {
      id: '1',
      titulo: 'Como resetar sua senha',
      resumo: 'Guia passo a passo para resetar sua senha de acesso ao sistema',
      categoria: 'Acesso',
      visualizacoes: 245,
      util: 42,
      naoUtil: 3
    },
    {
      id: '2',
      titulo: 'Configuração de impressora de rede',
      resumo: 'Instruções para configurar impressoras compartilhadas na rede',
      categoria: 'Hardware',
      visualizacoes: 189,
      util: 35,
      naoUtil: 5
    },
    {
      id: '3',
      titulo: 'Solução de problemas de conexão VPN',
      resumo: 'Troubleshooting comum para problemas de VPN',
      categoria: 'Rede',
      visualizacoes: 312,
      util: 58,
      naoUtil: 2
    }
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookText className="h-8 w-8" />
            Base de Conhecimento
          </h1>
          <p className="text-muted-foreground">Artigos e guias de solução de problemas</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Novo Artigo
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar artigos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {artigos.map((artigo) => (
            <Card key={artigo.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">{artigo.titulo}</h3>
                      <Badge variant="outline">{artigo.categoria}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {artigo.resumo}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {artigo.visualizacoes} visualizações
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3 text-green-500" />
                        {artigo.util}
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsDown className="h-3 w-3 text-red-500" />
                        {artigo.naoUtil}
                      </span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    Ver Artigo
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
