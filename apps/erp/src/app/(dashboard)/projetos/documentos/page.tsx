
import { Suspense } from 'react';
import DocumentosContent from './documentos-content';

export default function DocumentosPage() {
  return (
    <Suspense fallback={<div className="container mx-auto p-6">Carregando...</div>}>
      <DocumentosContent />
    </Suspense>
  );
}
