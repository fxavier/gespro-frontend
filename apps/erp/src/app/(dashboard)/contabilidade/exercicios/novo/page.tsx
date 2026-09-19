/**
 * Abrir Exercício Contabilístico — Server Component shell.
 *
 * A lógica de estado e submit está no Client Component AbrirExercicioForm.
 * A página apenas verifica a sessão e passa o ano sugerido (ano seguinte).
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { AbrirExercicioForm } from './_components/abrir-exercicio-form';

export default async function AbrirExercicioPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  // Sugestão: o próximo ano civil (o mais comum — apertura em Dezembro)
  const anoSugerido = new Date().getFullYear() + 1;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Abrir Exercício Contabilístico"
        description="Cria o exercício fiscal, os treze períodos e as séries de documento para o ano escolhido"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Exercícios', href: '/contabilidade/exercicios' },
          { label: 'Abrir exercício' },
        ]}
      />
      <AbrirExercicioForm anoSugerido={anoSugerido} />
    </div>
  );
}
