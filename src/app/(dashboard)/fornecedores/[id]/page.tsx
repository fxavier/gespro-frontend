
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowLeft,
  Edit,
  Mail,
  Phone,
  MapPin,
  Star,
  Calendar,
  Building,
  FileText,
  Package,
  ShoppingCart,
  DollarSign,
  AlertCircle,
  Users
} from 'lucide-react';
import { formatCurrency } from '@/lib/format-currency';

export default function FornecedorPerfilPage() {
  const params = useParams();
  const router = useRouter();
  const fornecedorId = params.id as string;

  const [fornecedor, setFornecedor] = useState<any>(null);

  useEffect(() => {
    // Dados mockados para demonstração
    const fornecedores: Record<string, any> = {
      'F001': {
        id: 'F001',
        codigo: 'FOR-0001',
        nome: 'Distribuidora ABC Moçambique',
        tipo: 'pessoa_juridica',
        nuit: '123456789',
        email: 'vendas@distribuidoraabc.co.mz',
        telefone: '+258 21 123 456',
        endereco: 'Av. Julius Nyerere, 123, Sommerschield, Maputo',
        dataCadastro: '2023-06-15',
        status: 'ativo',
        classificacao: 'preferencial',
        rating: 4.5,
        diasPagamento: 30,
        formasPagamento: ['Transferência Bancária', 'Cheque'],
        desconto: 5,
        totalCompras: 450000,
        numeroCompras: 28,
        ultimaCompra: '2024-01-20',
        observacoes: 'Fornecedor preferencial com excelente histórico'
      },
      'F002': {
        id: 'F002',
        codigo: 'FOR-0002',
        nome: 'Importadora XYZ Lda',
        tipo: 'pessoa_juridica',
        nuit: '987654321',
        email: 'contato@importadoraxyz.co.mz',
        telefone: '+258 84 321 654',
        endereco: 'Av. 24 de Julho, 456, Polana, Maputo',
        dataCadastro: '2023-03-10',
        status: 'ativo',
        classificacao: 'regular',
        rating: 4,
        diasPagamento: 45,
        formasPagamento: ['Transferência Bancária'],
        desconto: 3,
        totalCompras: 285000,
        numeroCompras: 18,
        ultimaCompra: '2024-01-19',
        observacoes: 'Fornecedor regular com bom atendimento'
      }
    };

    setFornecedor(fornecedores[fornecedorId] || null);
  }, [fornecedorId]);

  if (!fornecedor) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <div className="mt-8 text-center">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Fornecedor não encontrado</p>
        </div>
      </div>
    );
  }

  const renderizarEstrelas = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`h-4 w-4 ${i < Math.floor(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
          />
        ))}
        <span className="text-sm font-medium ml-1">{rating.toFixed(1)}</span>
      </div>
    );
  };

  const obterCorClassificacao = (classificacao: string) => {
    const cores: Record<string, string> = {
      preferencial: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      regular: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      novo: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
    };
    return cores[classificacao] || 'bg-gray-100 text-gray-800';
  };

  const pedidosRecentes = [
    {
      id: '1',
      numero: 'PED-2024-001',
      dataPedido: '2024-01-15',
      dataEntrega: '2024-01-20',
      valor: 22500,
      status: 'entregue'
    },
    {
      id: '2',
      numero: 'PED-2024-002',
      dataPedido: '2024-01-18',
      dataEntrega: '2024-01-25',
      valor: 24000,
      status: 'confirmado'
    }
  ];

  const produtos = [
    {
      id: '1',
      codigo: 'PROD-001',
      nome: 'Papel A4 (Resma)',
      categoria: 'Papelaria',
      preco: 450,
      quantidade: 50
    },
    {
      id: '2',
      codigo: 'PROD-002',
      nome: 'Toner Preto',
      categoria: 'Consumíveis',
      preco: 1200,
      quantidade: 20
    }
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{fornecedor.nome}</h1>
            <p className="text-gray-600 dark:text-gray-400">{fornecedor.codigo}</p>
          </div>
        </div>
        <Button asChild>
          <Link href={`/fornecedores/${fornecedorId}/editar`}>
            <Edit className="h-4 w-4 mr-2" />
            Editar
          </Link>
        </Button>
      </div>

      {/* Informações Principais */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Tipo</p>
            <p className="text-lg font-bold mt-2">
              {fornecedor.tipo === 'pessoa_fisica' ? 'Pessoa Física' : 'Pessoa Jurídica'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Status</p>
            <Badge className="mt-2" variant={fornecedor.status === 'ativo' ? 'default' : 'secondary'}>
              {fornecedor.status.charAt(0).toUpperCase() + fornecedor.status.slice(1)}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Classificação</p>
            <Badge className={`mt-2 ${obterCorClassificacao(fornecedor.classificacao)}`}>
              {fornecedor.classificacao.charAt(0).toUpperCase() + fornecedor.classificacao.slice(1)}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Rating</p>
            <div className="mt-2">
              {renderizarEstrelas(fornecedor.rating)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="informacoes" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="informacoes">Informações</TabsTrigger>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
          <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
          <TabsTrigger value="contactos">Contactos</TabsTrigger>
        </TabsList>

        {/* Aba Informações */}
        <TabsContent value="informacoes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Dados Pessoais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">NUIT</p>
                  <p className="font-medium">{fornecedor.nuit}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Email</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Mail className="h-4 w-4" />
                    <a href={`mailto:${fornecedor.email}`} className="text-blue-600 hover:underline">
                      {fornecedor.email}
                    </a>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Telefone</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Phone className="h-4 w-4" />
                    <a href={`tel:${fornecedor.telefone}`} className="text-blue-600 hover:underline">
                      {fornecedor.telefone}
                    </a>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Endereço</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-gray-400 mt-1" />
                <p>{fornecedor.endereco}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Condições Comerciais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Dias para Pagamento</p>
                  <p className="font-medium mt-1">{fornecedor.diasPagamento} dias</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Desconto Comercial</p>
                  <p className="font-medium mt-1">{fornecedor.desconto}%</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Data de Cadastro</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Calendar className="h-4 w-4" />
                    <span>{new Date(fornecedor.dataCadastro).toLocaleDateString('pt-PT')}</span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Formas de Pagamento</p>
                <div className="flex flex-wrap gap-2">
                  {fornecedor.formasPagamento.map((forma: string) => (
                    <Badge key={forma} variant="outline">{forma}</Badge>
                  ))}
                </div>
              </div>

              {fornecedor.observacoes && (
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Observações</p>
                  <p className="mt-1">{fornecedor.observacoes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Estatísticas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total de Compras</p>
                  <p className="text-2xl font-bold mt-2">{formatCurrency(fornecedor.totalCompras)}</p>
                </div>
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Número de Compras</p>
                  <p className="text-2xl font-bold mt-2">{fornecedor.numeroCompras}</p>
                </div>
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Última Compra</p>
                  <p className="text-lg font-bold mt-2">
                    {new Date(fornecedor.ultimaCompra).toLocaleDateString('pt-PT')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba Produtos */}
        <TabsContent value="produtos">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Produtos e Serviços
              </CardTitle>
            </CardHeader>
            <CardContent>
              {produtos.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Preço Unitário</TableHead>
                        <TableHead>Quantidade Mínima</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {produtos.map((produto) => (
                        <TableRow key={produto.id}>
                          <TableCell className="font-medium">{produto.codigo}</TableCell>
                          <TableCell>{produto.nome}</TableCell>
                          <TableCell>{produto.categoria}</TableCell>
                          <TableCell>{formatCurrency(produto.preco)}</TableCell>
                          <TableCell>{produto.quantidade}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Nenhum produto registado</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba Pedidos */}
        <TabsContent value="pedidos">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Pedidos Recentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pedidosRecentes.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Data do Pedido</TableHead>
                        <TableHead>Data de Entrega</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pedidosRecentes.map((pedido) => (
                        <TableRow key={pedido.id}>
                          <TableCell className="font-medium">{pedido.numero}</TableCell>
                          <TableCell>{new Date(pedido.dataPedido).toLocaleDateString('pt-PT')}</TableCell>
                          <TableCell>{new Date(pedido.dataEntrega).toLocaleDateString('pt-PT')}</TableCell>
                          <TableCell>{formatCurrency(pedido.valor)}</TableCell>
                          <TableCell>
                            <Badge variant={pedido.status === 'entregue' ? 'default' : 'secondary'}>
                              {pedido.status.charAt(0).toUpperCase() + pedido.status.slice(1)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <ShoppingCart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Nenhum pedido registado</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba Pagamentos */}
        <TabsContent value="pagamentos">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Histórico de Pagamentos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">Nenhum pagamento registado</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba Contactos */}
        <TabsContent value="contactos">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Contactos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">Nenhum contacto registado</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
