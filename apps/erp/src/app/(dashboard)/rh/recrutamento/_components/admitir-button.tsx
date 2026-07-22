'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { UserCheck } from 'lucide-react';

interface AdmitirButtonProps {
  candidaturaId: string;
  candidato: { id: string; nome: string; email: string };
}

export function AdmitirButton({ candidaturaId }: AdmitirButtonProps) {
  return (
    <Button asChild>
      <Link href={`/rh/recrutamento/candidaturas/${candidaturaId}/admitir`}>
        <UserCheck className="h-4 w-4 mr-2" />
        Admitir como Colaborador
      </Link>
    </Button>
  );
}
