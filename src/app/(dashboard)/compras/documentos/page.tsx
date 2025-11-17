
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  FileText, 
  Plus, 
  Search, 
  Filter,
  Download,
  Eye,
  Trash2,
  Calendar,
  User,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { usePagination } from '@/hooks/usePagination';

export default function ComprasDocumentosPage() {
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('todos');

  const documentos = [
    {
      id: 'DOC-001',
      nome: 'Contrato Fornecedor ABC',
      tipo: 'contrato',
      fornecedor: 'Distribuidora ABC Lda',
      dataUpload: '2024-01-15',
      uploadPor: 'João Silva',
      tamanho: '2.5 MB',
      url: '#'
    },
    {
      id: 'DOC-002',
      nome: 'Certificado de Qualidade',
      tipo: 'certificado',
      fornecedor: 'Bebidas Moçambique SA',
      dataUpload: '2024-01-14',
      uploadPor: 'Maria Santos',
      tamanho: '1.2 MB',
      url: '#'
    },
    {
      id: 'DOC-003',
      nome: 'Nota Fiscal NF-2024-001',
      tipo: 'nota_fiscal',
      fornecedor: 'Produtos de Limpeza Norte',
      dataUpload: '2024-01-13',
      uploadPor: 'Pedro Costa',
      tamanho: '0.8 MB',
      url: '#'
    },
    {
      id: 'DOC-004',
      nome: 'Declaração de Conformidade',
      tipo: 'declaracao',
      fornecedor: 'Eletrodomésticos Beira',
      dataUpload: '2024-01-12',
      uploadPor: 'Ana Oliveira',
      tamanho: '1.5 MB',
      url: '#'
    },
    {
      id: 'DOC-005',
      nome: 'Relatório de Inspeção',
      tipo: 'relatorio',
      fornecedor: 'Alimentos Norte Lda',
      dataUpload: '2024-01-11',
      uploadPor: 'Carlos Mendes',
      tamanho: '3.2 MB',
      url: '#'
    }
  ];

  const documentosFiltrados = documentos.filter(doc => {
    const correspondeNome = doc.nome.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                           doc.fornecedor.toLowerCase().includes(termoPesquisa.toLowerCase());
    const correspondeTipo = tipoFiltro === 'todos' || doc.tipo === tipoFiltro;
    
    return correspondeNome && correspondeTipo;
  });

  const { paginatedData, currentPage, totalPages, handlePageChange, itemsPerPage, handleItemsPerPageChange } = usePagination({
    data: documentosFiltrados,
    initialItemsPerPage: 10
  });

  const obterCorTipo = (tipo: string) => {
    const cores = {
      'contrato': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      'certificado': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      'nota_fiscal': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      'declaracao': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      'relatorio': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
    };
    return cores[tipo as keyof typeof cores] || 'bg-gray-100 text-gray-800';
  };

  const obterLabelTipo = (tipo: string) => {
    const labels = {
      'contrato': 'Contrato',
      'certificado': 'Certificado',
      'nota_fiscal': 'Nota Fiscal',
      'declaracao': 'Declaração',
      'relatorio': 'Relatório'
    };
    return labels[tipo as keyof typeof labels] || tipo;
  };

  const estatisticas = {
    total: documentos.length,
    contratos: documentos.filter(d => d.tipo === 'contrato').length,
    certificados: documentos.filter(d => d.tipo === 'certificado').length,
    notasFiscais: documentos.filter(d => d.tipo === 'nota_fiscal').length
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Documentos de Compras
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Repositório centralizado de documentos
          </p>
        </div>
        <Button asChild>
          <Link href="/compras/documentos/novo">
            <Plus className="h-4 w-4 mr-2" />
            Novo Documento
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total de Documentos</p>
                <p className="text-2xl font-bold">{estatisticas.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Certificados</p>
                <p className="text-2xl font-bold">{estatisticas.certificados}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Notas Fiscais</p>
                <p className="text-2xl font-bold">{estatisticas.notasFiscais}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Contratos</p>
                <p className="text-2xl font-bold">{estatisticas.contratos}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Filtros e Pesquisa</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Pesquisar por nome ou fornecedor..."
                  value={termoPesquisa}
                  onChange={(e) => setTermoPesquisa(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Tipo de Documento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Tipos</SelectItem>
                <SelectItem value="contrato">Contrato</SelectItem>
                <SelectItem value="certificado">Certificado</SelectItem>
                <SelectItem value="nota_fiscal">Nota Fiscal</SelectItem>
                <SelectItem value="declaracao">Declaração</SelectItem>
                <SelectItem value="relatorio">Relatório</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Documentos ({documentosFiltrados.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome do Documento</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Data de Upload</TableHead>
                  <TableHead>Upload Por</TableHead>
                  <TableHead>Tamanho</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.nome}</TableCell>
                    <TableCell>
                      <Badge className={obterCorTipo(doc.tipo)}>
                        {obterLabelTipo(doc.tipo)}
                      </Badge>
                    </TableCell>
                    <TableCell>{doc.fornecedor}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{new Date(doc.dataUpload).toLocaleDateString('pt-MZ')}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span>{doc.uploadPor}</span>
                      </div>
                    </TableCell>
                    <TableCell>{doc.tamanho}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={doc.url}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={doc.url} download>
                            <Download className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {paginatedData.length === 0 && (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Nenhum documento encontrado</p>
              <p className="text-sm text-gray-400 mt-1">
                Tente ajustar os filtros ou fazer upload de um novo documento
              </p>
            </div>
          )}

          {paginatedData.length > 0 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Itens por página:
                </span>
                <Select value={itemsPerPage.toString()} onValueChange={(value) => handleItemsPerPageChange(parseInt(value))}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
