'use client';

/**
 * Formulário de confirmação do apuramento de IVA.
 *
 * Trata os quatro códigos de recusa do ADR-0034 §4 com texto próprio.
 * PRORATA_NAO_SUPORTADO merece atenção especial: não é uma avaria, é uma
 * limitação declarada — o produto recusa calcular em vez de devolver um
 * número que não sabe calcular.
 *
 * useTransition obrigatório (CLAUDE.md): a action pode redirecionar.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, PercentCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apurarIvaAction } from '@/server/actions/financas-iva.actions';

// ─────────────────────────────────────────────────────────────────────────────
// Textos dos códigos de recusa (ADR-0034 §4)
// ─────────────────────────────────────────────────────────────────────────────

interface CodigoRecusaInfo {
  titulo: string;
  descricao: string;
  isProrataWarning?: boolean;
}

const TEXTOS_RECUSA: Record<string, CodigoRecusaInfo> = {
  PRORATA_NAO_SUPORTADO: {
    titulo: 'Pro rata não suportado — apuramento recusado',
    descricao:
      'Este período tem operações à taxa reduzida de 5 %, isentas ou fora do campo do imposto. ' +
      'Nessas situações, a dedução do IVA é limitada pelo coeficiente de pro rata, cujo cálculo ' +
      'o produto ainda não implementa. ' +
      'O sistema recusa produzir um número em vez de devolver um número que não sabe calcular — ' +
      'um valor incorrecto numa declaração assinada é pior do que nenhum valor. ' +
      'Para apurar, lance as regularizações manuais nas contas 44341/44342/44343 e confirme que ' +
      'não existem operações à taxa reduzida no razão antes de tentar novamente.',
    isProrataWarning: true,
  },
  PERIODO_COM_RASCUNHOS: {
    titulo: 'Existem lançamentos em rascunho no período',
    descricao:
      'O apuramento lê o razão contabilístico. Um lançamento em rascunho é um número que ainda ' +
      'pode mudar — apurar com rascunhos em aberto produziria um mapa que não reflecte o razão ' +
      'final. Confirme ou elimine todos os rascunhos do período antes de apurar.',
  },
  DOCUMENTO_SEM_LANCAMENTO: {
    titulo: 'Existem documentos fiscais sem lançamento contabilístico',
    descricao:
      'Há facturas, notas de crédito ou notas de débito emitidas neste período sem o lançamento ' +
      'contabilístico correspondente. O razão não contém o IVA desses documentos, e o apuramento ' +
      'ficaria incompleto. Registe os lançamentos em falta (Contabilidade → Lançamentos) e tente ' +
      'novamente.',
  },
  PERIODO_JA_APURADO: {
    titulo: 'O período já tem um apuramento activo',
    descricao:
      'Já existe um apuramento para este período no estado APURADO ou DECLARADO. ' +
      'Para recalcular, estorne o apuramento actual e execute um novo apuramento (versão seguinte). ' +
      'Se o apuramento já foi declarado à AT, a correcção tem de ser uma regularização no período ' +
      'seguinte (ADR-0034 §7).',
  },
};

function TextoRecusa({ codigo, info }: { codigo: string; info: CodigoRecusaInfo }) {
  return (
    <div
      className={[
        'rounded-lg border p-4 text-sm flex items-start gap-3',
        info.isProrataWarning
          ? 'border-warning/40 bg-warning/10'
          : 'border-destructive/40 bg-destructive/10',
      ].join(' ')}
    >
      <AlertTriangle
        className={[
          'h-4 w-4 mt-0.5 shrink-0',
          info.isProrataWarning ? 'text-warning' : 'text-destructive',
        ].join(' ')}
      />
      <div className="space-y-1">
        <p
          className={[
            'font-medium',
            info.isProrataWarning ? 'text-warning' : 'text-destructive',
          ].join(' ')}
        >
          {info.titulo}
        </p>
        <p className="text-muted-foreground">{info.descricao}</p>
        <p className="text-xs text-muted-foreground font-mono">Código: {codigo}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

interface ApurarIvaFormProps {
  periodoId: string;
  periodoCodigo: string;
}

export function ApurarIvaForm({ periodoId, periodoCodigo }: ApurarIvaFormProps) {
  const [aCorrer, iniciarTransicao] = useTransition();
  const [erroCode, setErroCode] = useState<string | null>(null);
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const router = useRouter();

  function apurar() {
    setErroCode(null);
    setErroMsg(null);
    iniciarTransicao(async () => {
      const res = await apurarIvaAction({ periodoId });
      if (!res.ok) {
        const code = (res.error as { code?: string })?.code ?? '';
        setErroCode(code);
        setErroMsg(res.error?.message ?? 'Erro ao apurar IVA');
        return;
      }
      toast.success(`IVA apurado com sucesso para o período ${periodoCodigo}`);
      router.push(`/contabilidade/iva/${periodoId}`);
    });
  }

  const infoRecusa = erroCode ? TEXTOS_RECUSA[erroCode] : null;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Informação sobre o que vai acontecer */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <PercentCircle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="space-y-2">
            <h2 className="font-semibold">Período {periodoCodigo}</h2>
            <p className="text-sm text-muted-foreground">
              O apuramento vai:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
              <li>Ler os saldos do razão contabilístico para as contas de IVA (4432x, 4433x, 4434x)</li>
              <li>Calcular o saldo líquido (liquidado − dedutível ± regularizações + crédito anterior)</li>
              <li>Gerar o lançamento de apuramento no diário de Operações, com data do fim do período</li>
              <li>Gravar as linhas do apuramento para os mapas de suporte à declaração</li>
            </ul>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-info/40 bg-info/10 p-3 text-sm">
          <Info className="h-4 w-4 mt-0.5 text-info shrink-0" />
          <p className="text-muted-foreground">
            O apuramento recusa-se a calcular quando não tem certeza do resultado correcto.
            Se houver operações à taxa reduzida (5 %), o sistema não implementa o cálculo
            do pro rata e diz isso claramente em vez de devolver um número incorrecto.
          </p>
        </div>
      </div>

      {/* Resultado de erro */}
      {erroCode && infoRecusa ? (
        <TextoRecusa codigo={erroCode} info={infoRecusa} />
      ) : erroMsg ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <p className="font-medium text-destructive">Erro ao apurar</p>
          <p className="mt-1 text-muted-foreground">{erroMsg}</p>
        </div>
      ) : null}

      {/* Acções */}
      <div className="flex gap-3">
        <Button onClick={apurar} disabled={aCorrer}>
          {aCorrer ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              A apurar…
            </>
          ) : (
            <>
              <PercentCircle className="h-4 w-4 mr-2" />
              Apurar IVA do período {periodoCodigo}
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          onClick={() => router.push(`/contabilidade/iva/${periodoId}`)}
          disabled={aCorrer}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}
