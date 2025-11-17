'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { DocumentoStorage } from '@/lib/storage/projeto-storage';
import { DocumentoProjeto } from '@/types/projeto';
import {
	Plus,
	Trash2,
	Download,
	FileText,
	Upload,
	File,
	X,
} from 'lucide-react';
import { toast } from 'sonner';

export default function DocumentosContent() {
	const searchParams = useSearchParams();
	const projetoId = searchParams.get('projetoId');

	const [documentos, setDocumentos] = useState<DocumentoProjeto[]>([]);
	const [loading, setLoading] = useState(true);
	const [showForm, setShowForm] = useState(false);
	const [isDragOver, setIsDragOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [formData, setFormData] = useState({
		nome: '',
		descricao: '',
		tipo: 'contrato' as const,
		categoria: '',
		arquivo: null as File | null,
	});

	useEffect(() => {
		const data = DocumentoStorage.getDocumentos();
		if (projetoId) {
			const filtered = data.filter((d) => d.projetoId === projetoId);
			setDocumentos(filtered);
		} else {
			setDocumentos(data);
		}
		setLoading(false);
	}, [projetoId]);

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			processFile(file);
		}
	};

	const processFile = (file: File) => {
		if (file.size > 10 * 1024 * 1024) {
			toast.error('Arquivo muito grande (máximo 10MB)');
			return;
		}
		setFormData((prev) => ({ ...prev, arquivo: file }));
		toast.success(`Arquivo "${file.name}" selecionado com sucesso`);
	};

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(true);
	};

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);

		const files = Array.from(e.dataTransfer.files);
		if (files.length > 0) {
			const file = files[0]; // Take only the first file
			processFile(file);
		}
	};

	const handleClickUpload = () => {
		fileInputRef.current?.click();
	};

	const clearFile = () => {
		setFormData((prev) => ({ ...prev, arquivo: null }));
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	};

	const handleAddDocumento = (e: React.FormEvent) => {
		e.preventDefault();

		if (!formData.nome) {
			toast.error('Preencha o nome do documento');
			return;
		}

		if (!formData.arquivo) {
			toast.error('Selecione um arquivo');
			return;
		}

		const novoDocumento: DocumentoProjeto = {
			id: `doc_${Date.now()}`,
			tenantId: 'default',
			projetoId: projetoId || '',
			projetoNome: '',
			nome: formData.nome,
			descricao: formData.descricao,
			tipo: formData.tipo,
			categoria: formData.categoria,
			arquivo: {
				nome: formData.arquivo.name,
				tipo: formData.arquivo.type,
				tamanho: formData.arquivo.size,
				url: URL.createObjectURL(formData.arquivo),
			},
			versao: 1,
			status: 'rascunho',
			uploadPorId: 'user_1',
			uploadPorNome: 'Usuário',
			dataUpload: new Date().toISOString(),
			dataAtualizacao: new Date().toISOString(),
		};

		DocumentoStorage.addDocumento(novoDocumento);
		setDocumentos(
			DocumentoStorage.getDocumentos().filter((d) => d.projetoId === projetoId)
		);
		setShowForm(false);
		setFormData({
			nome: '',
			descricao: '',
			tipo: 'contrato',
			categoria: '',
			arquivo: null,
		});
		clearFile();
		toast.success('Documento adicionado com sucesso');
	};

	const handleDeleteDocumento = (id: string) => {
		if (confirm('Tem certeza que deseja deletar este documento?')) {
			DocumentoStorage.deleteDocumento(id);
			setDocumentos(
				DocumentoStorage.getDocumentos().filter(
					(d) => d.projetoId === projetoId
				)
			);
			toast.success('Documento deletado com sucesso');
		}
	};

	const handleDownload = (doc: DocumentoProjeto) => {
		const link = document.createElement('a');
		link.href = doc.arquivo.url;
		link.download = doc.arquivo.nome;
		link.click();
	};

	if (loading) {
		return <div className='container mx-auto p-6'>Carregando...</div>;
	}

	return (
		<div className='container mx-auto p-6 space-y-6'>
			<div className='flex items-center justify-between'>
				<h1 className='text-3xl font-bold'>Documentos do Projeto</h1>
				<Button onClick={() => setShowForm(!showForm)} className='gap-2'>
					<Plus className='h-4 w-4' />
					Adicionar Documento
				</Button>
			</div>

			{/* Formulário de Adição */}
			{showForm && (
				<Card>
					<CardHeader>
						<CardTitle>Adicionar Novo Documento</CardTitle>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleAddDocumento} className='space-y-4'>
							<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
								<div className='space-y-2'>
									<Label htmlFor='nome'>Nome do Documento *</Label>
									<Input
										id='nome'
										value={formData.nome}
										onChange={(e) =>
											setFormData((prev) => ({ ...prev, nome: e.target.value }))
										}
										placeholder='Nome do documento'
									/>
								</div>

								<div className='space-y-2'>
									<Label htmlFor='tipo'>Tipo *</Label>
									<Select
										value={formData.tipo}
										onValueChange={(value) =>
											setFormData((prev) => ({ ...prev, tipo: value as any }))
										}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value='contrato'>Contrato</SelectItem>
											<SelectItem value='proposta'>Proposta</SelectItem>
											<SelectItem value='especificacao'>
												Especificação
											</SelectItem>
											<SelectItem value='manual'>Manual</SelectItem>
											<SelectItem value='relatorio'>Relatório</SelectItem>
											<SelectItem value='outro'>Outro</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>

							<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
								<div className='space-y-2'>
									<Label htmlFor='categoria'>Categoria</Label>
									<Input
										id='categoria'
										value={formData.categoria}
										onChange={(e) =>
											setFormData((prev) => ({
												...prev,
												categoria: e.target.value,
											}))
										}
										placeholder='Categoria do documento'
									/>
								</div>

								<div className='space-y-2'>
									<Label htmlFor='arquivo'>Arquivo *</Label>
									<div
										className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
											isDragOver
												? 'border-blue-500 bg-blue-50'
												: formData.arquivo
												? 'border-green-500 bg-green-50'
												: 'border-gray-300 hover:border-gray-400'
										}`}
										onDragOver={handleDragOver}
										onDragLeave={handleDragLeave}
										onDrop={handleDrop}
										onClick={handleClickUpload}
									>
										<input
											ref={fileInputRef}
											type='file'
											onChange={handleFileChange}
											className='hidden'
											accept='.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.gif'
										/>

										{formData.arquivo ? (
											<div className='space-y-2'>
												<div className='flex justify-center items-center gap-2'>
													<File className='h-8 w-8 text-green-600' />
													<Button
														type='button'
														variant='ghost'
														size='sm'
														onClick={(e) => {
															e.stopPropagation();
															clearFile();
														}}
														className='h-6 w-6 p-0 hover:bg-red-100'
													>
														<X className='h-4 w-4 text-red-500' />
													</Button>
												</div>
												<div>
													<p className='text-sm font-medium text-green-600'>
														✓ {formData.arquivo.name}
													</p>
													<p className='text-xs text-gray-500'>
														{(formData.arquivo.size / 1024).toFixed(2)} KB
													</p>
												</div>
												<p className='text-xs text-gray-500'>
													Clique ou arraste outro arquivo para substituir
												</p>
											</div>
										) : (
											<div className='space-y-2'>
												<Upload className='h-8 w-8 mx-auto text-gray-400' />
												<div>
													<p className='text-sm font-medium text-gray-600'>
														Arraste e solte um arquivo aqui
													</p>
													<p className='text-xs text-gray-500'>
														ou clique para selecionar
													</p>
												</div>
												<p className='text-xs text-gray-400'>
													PDF, DOC, XLS, PPT, TXT, JPG, PNG (máx. 10MB)
												</p>
											</div>
										)}
									</div>
								</div>
							</div>

							<div className='space-y-2'>
								<Label htmlFor='descricao'>Descrição</Label>
								<Textarea
									id='descricao'
									value={formData.descricao}
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											descricao: e.target.value,
										}))
									}
									placeholder='Descrição do documento'
									rows={3}
								/>
							</div>

							<div className='flex gap-2 justify-end'>
								<Button
									type='button'
									variant='outline'
									onClick={() => setShowForm(false)}
								>
									Cancelar
								</Button>
								<Button type='submit'>Adicionar Documento</Button>
							</div>
						</form>
					</CardContent>
				</Card>
			)}

			{/* Lista de Documentos */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center gap-2'>
						<FileText className='h-5 w-5' />
						Documentos ({documentos.length})
					</CardTitle>
				</CardHeader>
				<CardContent>
					{documentos.length === 0 ? (
						<div className='text-center py-8'>
							<p className='text-muted-foreground'>
								Nenhum documento encontrado
							</p>
						</div>
					) : (
						<div className='overflow-x-auto'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Nome</TableHead>
										<TableHead>Tipo</TableHead>
										<TableHead>Categoria</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Versão</TableHead>
										<TableHead>Upload Por</TableHead>
										<TableHead>Data</TableHead>
										<TableHead>Tamanho</TableHead>
										<TableHead>Ações</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{documentos.map((doc) => (
										<TableRow key={doc.id}>
											<TableCell className='font-medium'>{doc.nome}</TableCell>
											<TableCell className='capitalize'>{doc.tipo}</TableCell>
											<TableCell>{doc.categoria || 'N/A'}</TableCell>
											<TableCell className='capitalize'>{doc.status}</TableCell>
											<TableCell>{doc.versao}</TableCell>
											<TableCell>{doc.uploadPorNome}</TableCell>
											<TableCell>
												{new Date(doc.dataUpload).toLocaleDateString('pt-PT')}
											</TableCell>
											<TableCell>
												{(doc.arquivo.tamanho / 1024).toFixed(2)} KB
											</TableCell>
											<TableCell>
												<div className='flex gap-2'>
													<Button
														variant='ghost'
														size='sm'
														onClick={() => handleDownload(doc)}
														title='Baixar documento'
													>
														<Download className='h-4 w-4' />
													</Button>
													<Button
														variant='ghost'
														size='sm'
														onClick={() => handleDeleteDocumento(doc.id)}
														title='Deletar documento'
													>
														<Trash2 className='h-4 w-4 text-red-600' />
													</Button>
												</div>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
