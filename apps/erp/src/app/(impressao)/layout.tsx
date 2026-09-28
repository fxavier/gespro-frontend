/**
 * Layout de impressão (issue #127) — sem barra lateral, coluna estreita
 * (~80 mm, largura de talão térmico). Em papel as margens desaparecem.
 */
export default function ImpressaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground print:min-h-0">
      <div className="mx-auto w-full max-w-[80mm] px-4 py-6 print:p-0">
        {children}
      </div>
    </main>
  );
}
