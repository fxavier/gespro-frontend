/**
 * Isolamento multi-tenant do storage de documentos de fornecedor (vetor B2).
 *
 * `storageKey`/`url` chegam crus do cliente. Um utilizador do tenant A não pode:
 *   (a) registar um documento cuja key aponte para o prefixo de outro tenant
 *       (metadado envenenado → fuga no download + remoção de objeto estrangeiro);
 *   (b) ao remover, apagar o objeto de storage de outro tenant.
 *
 * Prisma e ObjectStorage mockados; `prefixoTenant`/`urlRefParaKey` são reais
 * (funções puras) para exercitar o caminho de segurança tal como em produção.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusinessRuleError } from '@/lib/errors';

const h = vi.hoisted(() => ({
  storageDelete: vi.fn(),
  prisma: {
    fornecedor: { findUnique: vi.fn() },
    documentoFornecedor: { create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock('@/server/db/client', () => ({ prisma: h.prisma, prismaBase: h.prisma }));

vi.mock('@/lib/storage/objeto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage/objeto')>();
  return {
    ...actual,
    getObjectStorage: () => ({
      delete: h.storageDelete,
      presignGet: vi.fn(),
      presignPut: vi.fn(),
    }),
  };
});

import { fornecedorService } from '../fornecedor.service';
import { prefixoTenant, keyParaUrlRef } from '@/lib/storage/objeto';

const ctx = { tenantId: 'tenant-a', userId: 'u1' };
const keyPropria = `${prefixoTenant('tenant-a')}fornecedor/f1/uuid-doc.pdf`;
const keyEstrangeira = `${prefixoTenant('tenant-b')}fornecedor/f1/uuid-doc.pdf`;

beforeEach(() => {
  vi.clearAllMocks();
  h.prisma.fornecedor.findUnique.mockResolvedValue({ id: 'f1', tenantId: 'tenant-a' });
});

describe('adicionarDocumento — bloqueio de key cross-tenant (B2 escrita)', () => {
  it('rejeita storageKey do prefixo de outro tenant e NÃO persiste', async () => {
    await expect(
      fornecedorService.adicionarDocumento(
        {
          fornecedorId: 'f1',
          nome: 'doc.pdf',
          tipo: 'OUTRO',
          url: keyParaUrlRef(keyEstrangeira),
          storageKey: keyEstrangeira,
        } as never,
        ctx,
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(h.prisma.documentoFornecedor.create).not.toHaveBeenCalled();
  });

  it('rejeita url-ref (gestpro-storage:) de outro tenant mesmo sem storageKey', async () => {
    await expect(
      fornecedorService.adicionarDocumento(
        {
          fornecedorId: 'f1',
          nome: 'doc.pdf',
          tipo: 'OUTRO',
          url: keyParaUrlRef(keyEstrangeira),
        } as never,
        ctx,
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(h.prisma.documentoFornecedor.create).not.toHaveBeenCalled();
  });

  it('aceita e persiste uma key do próprio tenant', async () => {
    h.prisma.documentoFornecedor.create.mockResolvedValue({
      id: 'd1',
      tipo: 'OUTRO',
      nome: 'doc.pdf',
      dataUpload: new Date(),
      dataValidade: null,
      url: keyParaUrlRef(keyPropria),
    });

    const dto = await fornecedorService.adicionarDocumento(
      {
        fornecedorId: 'f1',
        nome: 'doc.pdf',
        tipo: 'OUTRO',
        url: keyParaUrlRef(keyPropria),
        storageKey: keyPropria,
      } as never,
      ctx,
    );

    expect(dto.id).toBe('d1');
    expect(h.prisma.documentoFornecedor.create).toHaveBeenCalledTimes(1);
  });
});

describe('removerDocumento — delete scoped ao tenant (B2 remoção)', () => {
  it('NÃO apaga o objeto de storage de outro tenant, mas remove o metadado', async () => {
    h.prisma.documentoFornecedor.findUnique.mockResolvedValue({
      id: 'd1',
      tenantId: 'tenant-a', // metadado envenenado: pertence a A, aponta para B
      storageKey: keyEstrangeira,
      url: keyParaUrlRef(keyEstrangeira),
    });

    await fornecedorService.removerDocumento('d1', ctx);

    expect(h.storageDelete).not.toHaveBeenCalled();
    expect(h.prisma.documentoFornecedor.delete).toHaveBeenCalledWith({ where: { id: 'd1' } });
  });

  it('apaga o objeto quando a key pertence ao próprio tenant', async () => {
    h.prisma.documentoFornecedor.findUnique.mockResolvedValue({
      id: 'd1',
      tenantId: 'tenant-a',
      storageKey: keyPropria,
      url: keyParaUrlRef(keyPropria),
    });

    await fornecedorService.removerDocumento('d1', ctx);

    expect(h.storageDelete).toHaveBeenCalledWith(keyPropria);
    expect(h.prisma.documentoFornecedor.delete).toHaveBeenCalledWith({ where: { id: 'd1' } });
  });
});
