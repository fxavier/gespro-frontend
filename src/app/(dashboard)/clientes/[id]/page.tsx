
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
  DollarSign,
  Calendar,
  User,
  FileText,
  History,
  Users,
  AlertCircle
} from 'lucide-react';
import { ClienteStorage, ContactoClienteStorage, HistoricoTransacaoStorage, SegmentacaoClienteStorage } from '@/lib/storage/cliente-storage';
import { formatCurrency } from '@/lib/format-currency';

export default function ClientePerfilPage() {
  const params = useParams();
  const router = useRouter();
  const clienteId = params.id as string;

  const [cliente, setCliente] = useState<any>(null);
  const [contactos, setContactos] = useState<any[]>([]);
  const [historico, setHistorico] = useState<any[]>([]);
  const [segmentacao, setSegmentacao] = useState<any>(null);

  useEffect(() => {
    const clienteData = ClienteStorage.getClienteById(clienteId);
    if (clienteData) {
      setCliente(clienteData);
      setContactos(ContactoClienteStorage.getContactosByClienteId(clienteId));
      setHistorico(HistoricoTransacaoStorage.getHistoricoByClienteId(clienteId));
      setSegmentacao(SegmentacaoClienteStorage.getSegmentacaoByClienteId(clienteId));
    }
  }, [clienteId]);

  if (!cliente) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <div className="mt-8 text-center">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Cliente não encontrado</p>
        </div>
      </div>
    );
  }

  const totalVendas = historico
    .filter(h => h.tipo === 'venda' && h.status === 'concluido')
    .reduce((acc, h) => acc + h.valorMT, 0);

  const creditoDisponivel = cliente.limiteCreditoMT - cliente.creditoUtilizadoMT;
  const percentualCredito = (cliente.creditoUtilizadoMT / cliente.limiteCreditoMT) * 100;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{cliente.nome}</h1>
            <p className="text-gray-600 dark:text-gray-400">{cliente.codigo}</p>
          </div>
        </div>
        <Button asChild>
          <Link href={`/clientes/${clienteId}/editar`}>
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
              {cliente.tipo === 'fisica' ? 'Pessoa Física' : cliente.tipo === 'juridica' ? 'Pessoa Jurídica' : 'Revendedor'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Status</p>
            <Badge className="mt-2" variant={cliente.status === 'ativo' ? 'default' : 'secondary'}>
              {cliente.status.charAt(0).toUpperCase() + cliente.status.slice(1)}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Categoria</p>
            <Badge className="mt-2" variant={cliente.categoria === 'vip' ? 'default' : 'secondary'}>
              {cliente.categoria.charAt(0).toUpperCase() + cliente.categoria.slice(1)}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Total Vendas</p>
            <p className="text-lg font-bold mt-2">{formatCurrency(totalVendas)}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="informacoes" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="informacoes">Informações</TabsTrigger>
          <TabsTrigger value="contactos">Contactos</TabsTrigger>
          <TabsTrigger value="credito">Crédito</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
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
                  <p className="font-medium">{cliente.nuit}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Email</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Mail className="h-4 w-4" />
                    <a href={`mailto:${cliente.email}`} className="text-blue-600 hover:underline">
                      {cliente.email}
                    </a>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Telefone</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Phone className="h-4 w-4" />
                    <a href={`tel:${cliente.telefone}`} className="text-blue-600 hover:underline">
                      {cliente.telefone}
                    </a>
                  </div>
                </div>
                {cliente.telefoneSec && (
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Telefone Secundário</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Phone className="h-4 w-4" />
                      <a href={`tel:${cliente.telefoneSec}`} className="text-blue-600 hover:underline">
                        {cliente.telefoneSec}
                      </a>
                    </div>
                  </div>
                )}
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
                <div>
                  <p className="font-medium">{cliente.endereco.rua}, {cliente.endereco.numero}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {cliente.endereco.bairro}, {cliente.endereco.cidade}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {cliente.endereco.provincia}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Informações Comerciais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Data de Cadastro</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Calendar className="h-4 w-4" />
                    <span>{new Date(cliente.dataCadastro).toLocaleDateString('pt-PT')}</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Dias para Pagamento</p>
                  <p className="font-medium mt-1">{cliente.diasPagamento} dias</p>
                </div>
              </div>
              {cliente.observacoes && (
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Observações</p>
                  <p className="mt-1">{cliente.observacoes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba Contactos */}
        <TabsContent value="contactos">
          <Card>
            <CardHeader>
              <CardTitle>Contactos</CardTitle>
            </CardHeader>
            <CardContent>
              {contactos.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Cargo</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contactos.map((contacto) => (
                        <TableRow key={contacto.id}>
                          <TableCell className="font-medium">{contacto.nome}</TableCell>
                          <TableCell>{contacto.cargo}</TableCell>
                          <TableCell>
                            <a href={`mailto:${contacto.email}`} className="text-blue-600 hover:underline">
                              {contacto.email}
                            </a>
                          </TableCell>
                          <TableCell>
                            <a href={`tel:${contacto.telefone}`} className="text-blue-600 hover:underline">
                              {contacto.telefone}
                            </a>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{contacto.tipo}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={contacto.ativo ? 'default' : 'secondary'}>
                              {contacto.ativo ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Nenhum contacto registado</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba Crédito */}
        <TabsContent value="credito">
          <Card>
            <CardHeader>
              <CardTitle>Gestão de Crédito</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Limite de Crédito</p>
                  <p className="text-2xl font-bold mt-2">{formatCurrency(cliente.limiteCreditoMT)}</p>
                </div>
                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Crédito Utilizado</p>
                  <p className="text-2xl font-bold mt-2">{formatCurrency(cliente.creditoUtilizadoMT)}</p>
                </div>
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Crédito Disponível</p>
                  <p className="text-2xl font-bold mt-2">{formatCurrency(creditoDisponivel)}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Utilização de Crédito</p>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                  <div
                    className={`h-4 rounded-full transition-all ${
                      percentualCredito > 80 ? 'bg-red-600' : percentualCredito > 50 ? 'bg-orange-600' : 'bg-green-600'
                    }`}
                    style={{ width: `${Math.min(percentualCredito, 100)}%` }}
                  />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  {percentualCredito.toFixed(1)}% utilizado
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba Histórico */}
        <TabsContent value="historico">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Transações</CardTitle>
            </CardHeader>
            <CardContent>
              {historico.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Referência</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historico.map((transacao) => (
                        <TableRow key={transacao.id}>
                          <TableCell className="font-medium">{transacao.referencia}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {transacao.tipo.charAt(0).toUpperCase() + transacao.tipo.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell>{transacao.descricao}</TableCell>
                          <TableCell className="font-medium">{formatCurrency(transacao.valorMT)}</TableCell>
                          <TableCell>{new Date(transacao.dataTransacao).toLocaleDateString('pt-PT')}</TableCell>
                          <TableCell>
                            <Badge variant={transacao.status === 'concluido' ? 'default' : 'secondary'}>
                              {transacao.status.charAt(0).toUpperCase() + transacao.status.slice(1)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <History className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Nenhuma transação registada</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
