
import { Suspense } from 'react';
import { EquipaContent } from './equipa-content';

export default function EquipaPage() {
  return (
    <Suspense fallback={<div className="container mx-auto p-6">Carregando...</div>}>
      <EquipaContent />
    </Suspense>
  );
}
