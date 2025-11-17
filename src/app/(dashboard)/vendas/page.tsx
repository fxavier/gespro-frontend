
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function VendasPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/vendas/dashboard');
  }, [router]);

  return null;
}
