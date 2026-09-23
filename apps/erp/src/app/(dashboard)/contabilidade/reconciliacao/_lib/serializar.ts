import 'server-only';
import type { Prisma } from '@prisma/client';
import type { MovimentoLinha, Natureza } from './tipos';

type Banco = {
  id: string; dataMovimento: Date; referencia: string | null; descricao: string;
  valor: Prisma.Decimal; natureza: string; estado: string; correspondenciaAtivaId: string | null;
};
type Contab = {
  id: string; dataContabilistica: Date; documento: string | null; referencia: string | null; descricao: string;
  valor: Prisma.Decimal; natureza: string; estado: string; correspondenciaAtivaId: string | null;
};

export const linhaBanco = (m: Banco): MovimentoLinha => ({
  id: m.id, lado: 'BANCO', data: m.dataMovimento.toISOString(), referencia: m.referencia,
  descricao: m.descricao, valor: m.valor.toString(), natureza: m.natureza as Natureza,
  estado: m.estado, correspondenciaId: m.correspondenciaAtivaId,
});

export const linhaContab = (m: Contab): MovimentoLinha => ({
  id: m.id, lado: 'CONTABILIDADE', data: m.dataContabilistica.toISOString(),
  referencia: m.documento ?? m.referencia, descricao: m.descricao, valor: m.valor.toString(),
  natureza: m.natureza as Natureza, estado: m.estado, correspondenciaId: m.correspondenciaAtivaId,
});
