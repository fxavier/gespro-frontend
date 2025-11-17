
'use client';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-auto">
      <div className="container mx-auto px-6 py-4">
        <p className="text-center text-sm text-gray-600 dark:text-gray-400">
          © {currentYear} Sistema ERP. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
