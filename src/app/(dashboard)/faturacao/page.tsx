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
	Download,
	FileText,
	CheckCircle,
	Clock,
	XCircle,
	Filter,
	TrendingUp,
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
import type { Fatura } from '@/types/fatura';

const faturasMock: Fatura[] = [
	{
		id: '1',
		tenantId: '1',
		numeroFatura: 'FT2024/001',
		serie: 'A',
		clienteId: '1',
		itens: [],
		subtotal: 10000,
		descontoTotal: 0,
		ivaTotal: 1600,
		total: 11600,
		statusFatura: 'paga',
		dataEmissao: '2024-01-15',
		dataVencimento: '2024-02-15',
		dataPagamento: '2024-01-20',
		qrCode: '',
		hashValidacao: '',
	},
	{
		id: '2',
		tenantId: '1',
		numeroFatura: 'FT2024/002',
		serie: 'A',
		clienteId: '2',
		itens: [],
		subtotal: 25000,
		descontoTotal: 1000,
		ivaTotal: 3840,
		total: 27840,
		statusFatura: 'emitida',
		dataEmissao: '2024-01-18',
		dataVencimento: '2024-02-18',
		qrCode: '',
		hashValidacao: '',
	},
	{
		id: '3',
		tenantId: '1',
		numeroFatura: 'FT2024/003',
		serie: 'A',
		clienteId: '3',
		itens: [],
		subtotal: 5000,
		descontoTotal: 0,
		ivaTotal: 800,
		total: 5800,
		statusFatura: 'vencida',
		dataEmissao: '2023-12-10',
		dataVencimento: '2024-01-10',
		qrCode: '',
		hashValidacao: '',
	},
];

export default function FaturacaoPage() {
	const [faturas] = useState<Fatura[]>(faturasMock);
	const [busca, setBusca] = useState('');
	const [filtroStatus, setFiltroStatus] = useState<string>('todos');

	const dadosFiltrados = useMemo(() => {
		return faturas.filter((fatura) => {
			const matchBusca =
				busca === '' ||
				fatura.numeroFatura.toLowerCase().includes(busca.toLowerCase());

			const matchStatus =
				filtroStatus === 'todos' || fatura.statusFatura === filtroStatus;

			return matchBusca && matchStatus;
		});
	}, [faturas, busca, filtroStatus]);

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
			case 'paga':
				return (
					<Badge className='bg-green-600'>
						<CheckCircle className='h-3 w-3 mr-1' />
						Paga
					</Badge>
				);
			case 'emitida':
				return (
					<Badge className='bg-blue-600'>
						<Clock className='h-3 w-3 mr-1' />
						Emitida
					</Badge>
				);
			case 'vencida':
				return (
					<Badge className='bg-red-600'>
						<XCircle className='h-3 w-3 mr-1' />
						Vencida
					</Badge>
				);
			case 'cancelada':
				return (
					<Badge variant='secondary'>
						<XCircle className='h-3 w-3 mr-1' />
						Cancelada
					</Badge>
				);
			default:
				return <Badge variant='secondary'>{status}</Badge>;
		}
	};

	const totalFaturado = faturas.reduce((acc, f) => acc + f.total, 0);
	const totalPago = faturas
		.filter((f) => f.statusFatura === 'paga')
		.reduce((acc, f) => acc + f.total, 0);
	const totalPendente = faturas
		.filter((f) => f.statusFatura === 'emitida')
		.reduce((acc, f) => acc + f.total, 0);
	const totalVencido = faturas
		.filter((f) => f.statusFatura === 'vencida')
		.reduce((acc, f) => acc + f.total, 0);

	return (
		<div className='container mx-auto p-6 space-y-6'>
			<div className='flex justify-between items-center'>
				<div>
					<h1 className='text-3xl font-bold'>Gestão de Faturação</h1>
					<p className='text-muted-foreground'>
						Gerir faturas, pagamentos e documentos fiscais
					</p>
				</div>
				<Button className='gap-2'>
					<Plus className='h-4 w-4' />
					Nova Fatura
				</Button>
			</div>

			<div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
				<Card>
					<CardContent className='pt-6'>
						<div className='flex items-center justify-between'>
							<div>
								<p className='text-sm text-muted-foreground'>Total Faturado</p>
								<p className='text-2xl font-bold'>
									{totalFaturado.toLocaleString('pt-MZ', {
										style: 'currency',
										currency: 'MZN',
									})}
								</p>
							</div>
							<TrendingUp className='h-8 w-8 text-muted-foreground' />
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardContent className='pt-6'>
						<div className='flex items-center justify-between'>
							<div>
								<p className='text-sm text-muted-foreground'>Pagas</p>
								<p className='text-2xl font-bold text-green-600'>
									{totalPago.toLocaleString('pt-MZ', {
										style: 'currency',
										currency: 'MZN',
									})}
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
								<p className='text-sm text-muted-foreground'>Pendentes</p>
								<p className='text-2xl font-bold text-blue-600'>
									{totalPendente.toLocaleString('pt-MZ', {
										style: 'currency',
										currency: 'MZN',
									})}
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
								<p className='text-sm text-muted-foreground'>Vencidas</p>
								<p className='text-2xl font-bold text-red-600'>
									{totalVencido.toLocaleString('pt-MZ', {
										style: 'currency',
										currency: 'MZN',
									})}
								</p>
							</div>
							<XCircle className='h-8 w-8 text-red-600' />
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
									placeholder='Pesquisar por número de fatura...'
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
								<SelectItem value='emitida'>Emitida</SelectItem>
								<SelectItem value='paga'>Paga</SelectItem>
								<SelectItem value='vencida'>Vencida</SelectItem>
								<SelectItem value='cancelada'>Cancelada</SelectItem>
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
					<CardTitle>Lista de Faturas ({dadosFiltrados.length})</CardTitle>
				</CardHeader>
				<CardContent>
					<div className='overflow-x-auto'>
						<table className='w-full'>
							<thead>
								<tr className='border-b'>
									<th className='text-left p-4 font-medium'>Nº Fatura</th>
									<th className='text-left p-4 font-medium'>Data Emissão</th>
									<th className='text-left p-4 font-medium'>Data Vencimento</th>
									<th className='text-left p-4 font-medium'>Subtotal</th>
									<th className='text-left p-4 font-medium'>IVA</th>
									<th className='text-left p-4 font-medium'>Total</th>
									<th className='text-left p-4 font-medium'>Status</th>
									<th className='text-right p-4 font-medium'>Ações</th>
								</tr>
							</thead>
							<tbody>
								{paginatedData.map((fatura) => (
									<tr key={fatura.id} className='border-b hover:bg-muted/50'>
										<td className='p-4'>
											<div className='flex items-center gap-2'>
												<FileText className='h-4 w-4 text-muted-foreground' />
												<span className='font-medium'>
													{fatura.numeroFatura}
												</span>
											</div>
										</td>
										<td className='p-4'>
											{new Date(fatura.dataEmissao).toLocaleDateString('pt-PT')}
										</td>
										<td className='p-4'>
											{new Date(fatura.dataVencimento).toLocaleDateString(
												'pt-PT'
											)}
										</td>
										<td className='p-4'>
											{fatura.subtotal.toLocaleString('pt-MZ', {
												style: 'currency',
												currency: 'MZN',
											})}
										</td>
										<td className='p-4'>
											{fatura.ivaTotal.toLocaleString('pt-MZ', {
												style: 'currency',
												currency: 'MZN',
											})}
										</td>
										<td className='p-4 font-bold'>
											{fatura.total.toLocaleString('pt-MZ', {
												style: 'currency',
												currency: 'MZN',
											})}
										</td>
										<td className='p-4'>
											{getStatusBadge(fatura.statusFatura)}
										</td>
										<td className='p-4'>
											<div className='flex justify-end gap-2'>
												<Button variant='ghost' size='icon'>
													<Eye className='h-4 w-4' />
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
							<p className='text-muted-foreground'>Nenhuma fatura encontrada</p>
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
