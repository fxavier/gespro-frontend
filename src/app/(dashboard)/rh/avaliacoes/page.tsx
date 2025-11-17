
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AvaliacaoStorage, ColaboradorStorage } from '@/lib/storage/rh-storage';
import { Avaliacao, Colaborador } from '@/types/rh';
import { Award, Clock, CheckCircle, Plus, Eye, Edit, MoreHorizontal } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';

export default function AvaliacoesPage() {
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [selectedAvaliacao, setSelectedAvaliacao] = useState<Avaliacao | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setAvaliacoes(AvaliacaoStorage.getAvaliacoes());
    setColaboradores(ColaboradorStorage.getColaboradores());
  };

  const getColaboradorNome = (colaboradorId: string) => {
    const colaborador = colaboradores.find(c => c.id === colaboradorId);
    return colaborador?.nome || 'Desconhecido';
  };

  const getStatusBadge = (status: Avaliacao['status']) => {
    const variants: Record<Avaliacao['status'], { variant: any; label: string }> = {
      pendente: { variant: 'outline', label: 'Pendente' },
      em_andamento: { variant: 'secondary', label: 'Em Andamento' },
      concluida: { variant: 'default', label: 'Concluída' },
      cancelada: { variant: 'destructive', label: 'Cancelada' }
    };
    const config = variants[status];
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getTipoLabel = (tipo: Avaliacao['tipo']) => {
    const labels: Record<Avaliacao['tipo'], string> = {
      desempenho: 'Desempenho',
      competencias: 'Competências',
      '360': 'Avaliação 360°',
      probatorio: 'Período Probatório'
    };
    return labels[tipo];
  };

  const viewDetails = (avaliacao: Avaliacao) => {
    setSelectedAvaliacao(avaliacao);
    setIsDialogOpen(true);
  };

  const editAvaliacao = (avaliacao: Avaliacao) => {
    // For now, show a message. In the future, this could navigate to an edit page
    alert(`Editar avaliação de ${getColaboradorNome(avaliacao.colaboradorId)} ainda não implementado`);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Avaliações de Desempenho</h1>
          <p className="text-muted-foreground mt-1">
            Gerir avaliações e desenvolvimento dos colaboradores
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/rh/avaliacoes/nova">
            <Plus className="h-4 w-4" />
            Nova Avaliação
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Avaliações</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avaliacoes.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {avaliacoes.filter(a => a.status === 'pendente').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Andamento</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {avaliacoes.filter(a => a.status === 'em_andamento').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Concluídas</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {avaliacoes.filter(a => a.status === 'concluida').length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Avaliações Registadas</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Avaliador</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Nota Final</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Data Início</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {avaliacoes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nenhuma avaliação encontrada
                  </TableCell>
                </TableRow>
              ) : (
                avaliacoes.map((avaliacao) => (
                  <TableRow key={avaliacao.id}>
                    <TableCell className="font-medium">{getColaboradorNome(avaliacao.colaboradorId)}</TableCell>
                    <TableCell>{getColaboradorNome(avaliacao.avaliadorId)}</TableCell>
                    <TableCell>{getTipoLabel(avaliacao.tipo)}</TableCell>
                    <TableCell>{avaliacao.periodo}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={avaliacao.notaFinal * 10} className="w-20" />
                        <span className="text-sm font-medium">{avaliacao.notaFinal.toFixed(1)}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(avaliacao.status)}</TableCell>
                    <TableCell>{new Date(avaliacao.dataInicio).toLocaleDateString('pt-PT')}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Ações</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => viewDetails(avaliacao)}>
                            <Eye className="mr-2 h-4 w-4" />
                            Ver Detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => editAvaliacao(avaliacao)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem>
                            <Award className="mr-2 h-4 w-4" />
                            Finalizar Avaliação
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Detalhes da Avaliação
            </DialogTitle>
            <DialogDescription>
              Informações completas da avaliação de desempenho
            </DialogDescription>
          </DialogHeader>
          
          {selectedAvaliacao && (
            <div className="space-y-6">
              {/* Basic Information */}
              <div>
                <h3 className="font-semibold mb-3">Informações Básicas</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Colaborador</Label>
                    <p className="text-sm">{getColaboradorNome(selectedAvaliacao.colaboradorId)}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Avaliador</Label>
                    <p className="text-sm">{getColaboradorNome(selectedAvaliacao.avaliadorId)}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Tipo</Label>
                    <p className="text-sm">{getTipoLabel(selectedAvaliacao.tipo)}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Status</Label>
                    <div className="mt-1">
                      {getStatusBadge(selectedAvaliacao.status)}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Período</Label>
                    <p className="text-sm">{selectedAvaliacao.periodo}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Nota Final</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Progress value={selectedAvaliacao.notaFinal * 10} className="w-20" />
                      <span className="text-sm font-medium">{selectedAvaliacao.notaFinal.toFixed(1)}/10</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Data Início</Label>
                    <p className="text-sm">{new Date(selectedAvaliacao.dataInicio).toLocaleDateString('pt-PT')}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Data Criação</Label>
                    <p className="text-sm">{new Date(selectedAvaliacao.dataCriacao).toLocaleDateString('pt-PT')}</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Evaluation Criteria */}
              {selectedAvaliacao.criterios && selectedAvaliacao.criterios.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">Critérios de Avaliação</h3>
                  <div className="space-y-3">
                    {selectedAvaliacao.criterios.map((criterio, index) => (
                      <div key={criterio.id || index} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{criterio.nome}</h4>
                            <Badge variant="outline">{criterio.peso}%</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Progress value={criterio.nota * 10} className="w-16" />
                            <span className="font-bold text-sm">{criterio.nota.toFixed(1)}</span>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{criterio.descricao}</p>
                        {criterio.comentario && (
                          <div className="bg-gray-50 rounded p-2">
                            <Label className="text-xs text-gray-500">Comentário:</Label>
                            <p className="text-sm">{criterio.comentario}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Strengths and Development Points */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {selectedAvaliacao.pontosFortres && selectedAvaliacao.pontosFortres.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-3 text-green-700">Pontos Fortes</h3>
                    <div className="space-y-2">
                      {selectedAvaliacao.pontosFortres.map((ponto, index) => (
                        <div key={index} className="flex items-start gap-2 bg-green-50 border border-green-200 rounded p-2">
                          <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                          <span className="text-sm">{ponto}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedAvaliacao.pontosDesenvolvimento && selectedAvaliacao.pontosDesenvolvimento.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-3 text-orange-700">Pontos de Desenvolvimento</h3>
                    <div className="space-y-2">
                      {selectedAvaliacao.pontosDesenvolvimento.map((ponto, index) => (
                        <div key={index} className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded p-2">
                          <Clock className="h-4 w-4 text-orange-600 mt-0.5" />
                          <span className="text-sm">{ponto}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Plan */}
              {selectedAvaliacao.planoAcao && selectedAvaliacao.planoAcao.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-3">Plano de Ação</h3>
                    <div className="space-y-2">
                      {selectedAvaliacao.planoAcao.map((acao, index) => (
                        <div key={index} className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded p-2">
                          <Award className="h-4 w-4 text-blue-600 mt-0.5" />
                          <span className="text-sm">{acao}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Comments */}
              {selectedAvaliacao.comentarios && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-3">Comentários Gerais</h3>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-sm">{selectedAvaliacao.comentarios}</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Fechar
            </Button>
            <Button onClick={() => {
              setIsDialogOpen(false);
              if (selectedAvaliacao) {
                editAvaliacao(selectedAvaliacao);
              }
            }}>
              <Edit className="mr-2 h-4 w-4" />
              Editar Avaliação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
