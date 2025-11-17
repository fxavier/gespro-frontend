'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
	Search,
	Plus,
	Eye,
	Edit,
	FileText,
	CheckCircle,
	Clock,
	XCircle,
	Filter,
	Download,
} from 'lucide-react';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { usePagination } from '@/hooks/usePagination';

interface Cotacao {
	id: string;
	numeroCotacao: string;
	cliente: string;
	dataEmissao: string;
	dataValidade: string;
	status: 'pendente' | 'aprovada' | 'rejeitada' | 'expirada';
	valorTotal: number;
	observacoes?: string;
}

const cotacoesMock: Cotacao[] = [
	{
		id: '1',
		numeroCotacao: 'COT2024/001',
		cliente: 'João Silva',
		dataEmissao: '2024-01-20',
		dataValidade: '2024-02-20',
		status: 'pendente',
		valorTotal: 15000,
	},
	{
		id: '2',
		numeroCotacao: 'COT2024/002',
		cliente: 'Empresa ABC Lda',
		dataEmissao: '2024-01-18',
		dataValidade: '2024-02-18',
		status: 'aprovada',
		valorTotal: 28500,
	},
	{
		id: '3',
		numeroCotacao: 'COT2024/003',
		cliente: 'Maria Santos',
		dataEmissao: '2024-01-15',
		dataValidade: '2024-02-15',
		status: 'rejeitada',
		valorTotal: 8200,
	},
	{
		id: '4',
		numeroCotacao: 'COT2023/150',
		cliente: 'Comércio XYZ',
		dataEmissao: '2023-12-10',
		dataValidade: '2024-01-10',
		status: 'expirada',
		valorTotal: 12000,
	},
];

export default function CotacoesPage() {
	const [cotacoes] = useState<Cotacao[]>(cotacoesMock);
	const [busca, setBusca] = useState('');
	const [filtroStatus, setFiltroStatus] = useState<string>('todos');

	const dadosFiltrados = useMemo(() => {
		return cotacoes.filter((cotacao) => {
			const matchBusca =
				busca === '' ||
				cotacao.numeroCotacao.toLowerCase().includes(busca.toLowerCase()) ||
				cotacao.cliente.toLowerCase().includes(busca.toLowerCase());

			const matchStatus =
				filtroStatus === 'todos' || cotacao.status === filtroStatus;

			return matchBusca && matchStatus;
		});
	}, [cotacoes, busca, filtroStatus]);

	const {
		currentPage,
		totalPages,
		itemsPerPage,
		paginatedData,
		totalItems,
		handlePageChange,
		handleItemsPerPageChange,
	} = usePagination({ data: dadosFiltrados, initialItemsPerPage: 10 });

	const getStatusBadge = (status: string) => {
		switch (status) {
			case 'aprovada':
				return (
					<Badge className='bg-green-600'>
						<CheckCircle className='h-3 w-3 mr-1' />
						Aprovada
					</Badge>
				);
			case 'pendente':
				return (
					<Badge className='bg-blue-600'>
						<Clock className='h-3 w-3 mr-1' />
						Pendente
					</Badge>
				);
			case 'rejeitada':
				return (
					<Badge className='bg-red-600'>
						<XCircle className='h-3 w-3 mr-1' />
						Rejeitada
					</Badge>
				);
			case 'expirada':
				return (
					<Badge variant='secondary'>
						<XCircle className='h-3 w-3 mr-1' />
						Expirada
					</Badge>
				);
			default:
				return <Badge variant='secondary'>{status}</Badge>;
		}
	};

	return (
		<div className='container mx-auto p-6 space-y-6'>
			<div className='flex justify-between items-center'>
				<div>
					<h1 className='text-3xl font-bold'>Cotações</h1>
					<p className='text-muted-foreground'>
						Gerir cotações e propostas comerciais
					</p>
				</div>
				<Button className='gap-2'>
					<Plus className='h-4 w-4' />
					Nova Cotação
				</Button>
			</div>

			<div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
				<Card>
					<CardContent className='pt-6'>
						<div className='flex items-center justify-between'>
							<div>
								<p className='text-sm text-muted-foreground'>Total Cotações</p>
								<p className='text-2xl font-bold'>{cotacoes.length}</p>
							</div>
							<FileText className='h-8 w-8 text-muted-foreground' />
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardContent className='pt-6'>
						<div className='flex items-center justify-between'>
							<div>
								<p className='text-sm text-muted-foreground'>Pendentes</p>
								<p className='text-2xl font-bold text-blue-600'>
									{cotacoes.filter((c) => c.status === 'pendente').length}
								</p>
							</div>
							<Clock className='h-8 w-8 text-blue-600' />
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardContent className='pt-6'>
						<div className='flex items-center justify-between'>
							<div>
								<p className='text-sm text-muted-foreground'>Aprovadas</p>
								<p className='text-2xl font-bold text-green-600'>
									{cotacoes.filter((c) => c.status === 'aprovada').length}
								</p>
							</div>
							<CheckCircle className='h-8 w-8 text-green-600' />
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardContent className='pt-6'>
						<div className='flex items-center justify-between'>
							<div>
								<p className='text-sm text-muted-foreground'>Taxa Conversão</p>
								<p className='text-2xl font-bold'>
									{cotacoes.length > 0
										? Math.round(
												(cotacoes.filter((c) => c.status === 'aprovada')
													.length /
													cotacoes.length) *
													100
										  )
										: 0}
									%
								</p>
							</div>
							<CheckCircle className='h-8 w-8 text-green-600' />
						</div>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Filtros e Pesquisa</CardTitle>
				</CardHeader>
				<CardContent>
					<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
						<div className='md:col-span-2'>
							<div className='relative'>
								<Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground' />
								<Input
									placeholder='Pesquisar por número ou cliente...'
									value={busca}
									onChange={(e) => setBusca(e.target.value)}
									className='pl-10'
								/>
							</div>
						</div>

						<Select value={filtroStatus} onValueChange={setFiltroStatus}>
							<SelectTrigger>
								<SelectValue placeholder='Status' />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='todos'>Todos os Status</SelectItem>
								<SelectItem value='pendente'>Pendente</SelectItem>
								<SelectItem value='aprovada'>Aprovada</SelectItem>
								<SelectItem value='rejeitada'>Rejeitada</SelectItem>
								<SelectItem value='expirada'>Expirada</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className='flex gap-2 mt-4'>
						<Button variant='outline' size='sm' className='gap-2'>
							<Filter className='h-4 w-4' />
							Filtros Avançados
						</Button>
						<Button variant='outline' size='sm' className='gap-2'>
							<Download className='h-4 w-4' />
							Exportar
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Lista de Cotações ({dadosFiltrados.length})</CardTitle>
				</CardHeader>
				<CardContent>
					<div className='overflow-x-auto'>
						<table className='w-full'>
							<thead>
								<tr className='border-b'>
									<th className='text-left p-4 font-medium'>Nº Cotação</th>
									<th className='text-left p-4 font-medium'>Cliente</th>
									<th className='text-left p-4 font-medium'>Data Emissão</th>
									<th className='text-left p-4 font-medium'>Validade</th>
									<th className='text-left p-4 font-medium'>Valor Total</th>
									<th className='text-left p-4 font-medium'>Status</th>
									<th className='text-right p-4 font-medium'>Ações</th>
								</tr>
							</thead>
							<tbody>
								{paginatedData.map((cotacao) => (
									<tr key={cotacao.id} className='border-b hover:bg-muted/50'>
										<td className='p-4'>
											<div className='flex items-center gap-2'>
												<FileText className='h-4 w-4 text-muted-foreground' />
												<span className='font-medium'>
													{cotacao.numeroCotacao}
												</span>
											</div>
										</td>
										<td className='p-4'>{cotacao.cliente}</td>
										<td className='p-4'>
											{new Date(cotacao.dataEmissao).toLocaleDateString(
												'pt-PT'
											)}
										</td>
										<td className='p-4'>
											{new Date(cotacao.dataValidade).toLocaleDateString(
												'pt-PT'
											)}
										</td>
										<td className='p-4 font-bold'>
											{cotacao.valorTotal.toLocaleString('pt-MZ', {
												style: 'currency',
												currency: 'MZN',
											})}
										</td>
										<td className='p-4'>{getStatusBadge(cotacao.status)}</td>
										<td className='p-4'>
											<div className='flex justify-end gap-2'>
												<Button variant='ghost' size='icon'>
													<Eye className='h-4 w-4' />
												</Button>
												<Button variant='ghost' size='icon'>
													<Edit className='h-4 w-4' />
												</Button>
												<Button variant='ghost' size='icon'>
													<Download className='h-4 w-4' />
												</Button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{dadosFiltrados.length === 0 && (
						<div className='text-center py-12'>
							<p className='text-muted-foreground'>
								Nenhuma cotação encontrada
							</p>
						</div>
					)}

					{dadosFiltrados.length > 0 && (
						<PaginationControls
							currentPage={currentPage}
							totalPages={totalPages}
							itemsPerPage={itemsPerPage}
							totalItems={totalItems}
							onPageChange={handlePageChange}
							onItemsPerPageChange={handleItemsPerPageChange}
						/>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
