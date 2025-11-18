import type { Fatura, NotaCredito, NotaDebito } from '@/types/fatura';

export const faturasMock: Fatura[] = [
  {
    id: 'FAT-001',
    tenantId: 'tenant-001',
    numeroFatura: 'FAT-2024-001',
    serie: 'A',
    clienteId: 'CLI-001',
    vendaId: 'PED-2024-003',
    itens: [
      {
        id: 'ITEM-01',
        produtoId: 'PROD-001',
        descricao: 'Computador Dell OptiPlex 3090',
        quantidade: 2,
        precoUnitario: 60000,
        desconto: 0,
        taxaIva: 0.17,
        subtotal: 120000,
        ivaItem: 20400,
        total: 140400
      }
    ],
    subtotal: 120000,
    descontoTotal: 0,
    ivaTotal: 20400,
    total: 140400,
    statusFatura: 'paga',
    dataEmissao: '2024-01-15',
    dataVencimento: '2024-01-30',
    dataPagamento: '2024-01-20',
    observacoes: 'Pagamento por transferência bancária',
    qrCode: 'QR-FAT-2024-001',
    hashValidacao: 'HASH-001'
  },
  {
    id: 'FAT-002',
    tenantId: 'tenant-001',
    numeroFatura: 'FAT-2024-002',
    serie: 'A',
    clienteId: 'CLI-002',
    itens: [
      {
        id: 'ITEM-02',
        produtoId: 'PROD-010',
        descricao: 'Serviço de consultoria',
        quantidade: 1,
        precoUnitario: 35000,
        desconto: 2000,
        taxaIva: 0.17,
        subtotal: 33000,
        ivaItem: 5610,
        total: 38610
      }
    ],
    subtotal: 33000,
    descontoTotal: 2000,
    ivaTotal: 5610,
    total: 38610,
    statusFatura: 'emitida',
    dataEmissao: '2024-02-01',
    dataVencimento: '2024-02-28',
    qrCode: 'QR-FAT-2024-002',
    hashValidacao: 'HASH-002'
  },
  {
    id: 'FAT-003',
    tenantId: 'tenant-001',
    numeroFatura: 'FAT-2024-003',
    serie: 'B',
    clienteId: 'CLI-003',
    itens: [
      {
        id: 'ITEM-03',
        produtoId: 'PROD-020',
        descricao: 'Licenças de software',
        quantidade: 25,
        precoUnitario: 1000,
        desconto: 0,
        taxaIva: 0.17,
        subtotal: 25000,
        ivaItem: 4250,
        total: 29250
      }
    ],
    subtotal: 25000,
    descontoTotal: 0,
    ivaTotal: 4250,
    total: 29250,
    statusFatura: 'vencida',
    dataEmissao: '2023-12-10',
    dataVencimento: '2024-01-10',
    qrCode: 'QR-FAT-2024-003',
    hashValidacao: 'HASH-003'
  }
];

export const notasCreditoMock: NotaCredito[] = [
  {
    id: 'NC-001',
    tenantId: 'tenant-001',
    numeroNota: 'NC-2024-001',
    faturaOriginalId: 'FAT-001',
    motivo: 'Devolução parcial de mercadorias',
    itens: [
      {
        id: 'NC-ITEM-01',
        produtoId: 'PROD-001',
        descricao: 'Computador Dell OptiPlex 3090',
        quantidade: 1,
        precoUnitario: 60000,
        desconto: 0,
        taxaIva: 0.17,
        subtotal: 60000,
        ivaItem: 10200,
        total: 70200
      }
    ],
    subtotal: 60000,
    ivaTotal: 10200,
    total: 70200,
    dataEmissao: '2024-01-22',
    status: 'emitida',
    observacoes: 'Mercadoria devolvida sem uso'
  },
  {
    id: 'NC-002',
    tenantId: 'tenant-001',
    numeroNota: 'NC-2024-002',
    faturaOriginalId: 'FAT-003',
    motivo: 'Erro de faturação - desconto adicional',
    itens: [
      {
        id: 'NC-ITEM-02',
        produtoId: 'PROD-020',
        descricao: 'Licenças de software',
        quantidade: 5,
        precoUnitario: 1000,
        desconto: 0,
        taxaIva: 0.17,
        subtotal: 5000,
        ivaItem: 850,
        total: 5850
      }
    ],
    subtotal: 5000,
    ivaTotal: 850,
    total: 5850,
    dataEmissao: '2024-02-05',
    status: 'rascunho'
  }
];

export const notasDebitoMock: NotaDebito[] = [
  {
    id: 'ND-001',
    tenantId: 'tenant-001',
    numeroNota: 'ND-2024-001',
    clienteId: 'CLI-002',
    faturaReferenciaId: 'FAT-002',
    motivo: 'Serviços adicionais não faturados',
    itens: [
      {
        id: 'ND-ITEM-01',
        produtoId: 'SERV-001',
        descricao: 'Horas de consultoria extra',
        quantidade: 3,
        precoUnitario: 4500,
        desconto: 0,
        taxaIva: 0.17,
        subtotal: 13500,
        ivaItem: 2295,
        total: 15795
      }
    ],
    subtotal: 13500,
    ivaTotal: 2295,
    total: 15795,
    dataEmissao: '2024-02-07',
    status: 'emitida',
    observacoes: 'Cliente autorizado via email'
  },
  {
    id: 'ND-002',
    tenantId: 'tenant-001',
    numeroNota: 'ND-2024-002',
    clienteId: 'CLI-004',
    motivo: 'Atualização de tabela de preços',
    itens: [
      {
        id: 'ND-ITEM-02',
        produtoId: 'PROD-050',
        descricao: 'Equipamento Industrial',
        quantidade: 1,
        precoUnitario: 80000,
        desconto: -5000,
        taxaIva: 0.17,
        subtotal: 85000,
        ivaItem: 14450,
        total: 99450
      }
    ],
    subtotal: 85000,
    ivaTotal: 14450,
    total: 99450,
    dataEmissao: '2024-02-12',
    status: 'rascunho'
  }
];
