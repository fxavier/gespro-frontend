
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, FolderOpen, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DocumentosRHPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Documentos de RH</h1>
          <p className="text-muted-foreground mt-1">
            Repositório centralizado de documentos de recursos humanos
          </p>
        </div>
        <Button className="gap-2">
          <Upload className="h-4 w-4" />
          Carregar Documento
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Documentos</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Categorias</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Adicionados Hoje</CardTitle>
            <Upload className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Downloads Hoje</CardTitle>
            <Download className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Categorias de Documentos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { nome: 'Contratos', total: 0 },
              { nome: 'Políticas e Procedimentos', total: 0 },
              { nome: 'Formulários', total: 0 },
              { nome: 'Avaliações', total: 0 },
              { nome: 'Formações', total: 0 },
              { nome: 'Benefícios', total: 0 }
            ].map((categoria) => (
              <Card key={categoria.nome}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FolderOpen className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{categoria.nome}</p>
                        <p className="text-sm text-muted-foreground">{categoria.total} documentos</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              Nenhum documento encontrado. Carregue o primeiro documento para começar.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
