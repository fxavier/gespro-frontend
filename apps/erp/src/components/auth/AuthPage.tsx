
'use client';

import { useState } from 'react';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';

export default function AuthPage() {
  const [modoAtual, setModoAtual] = useState<'login' | 'register'>('login');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Sistema de Gestão Empresarial
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Gestão completa de stocks, faturação e POS para empresas moçambicanas
          </p>
        </div>

        {modoAtual === 'login' ? (
          <LoginForm onSwitchToRegister={() => setModoAtual('register')} />
        ) : (
          <RegisterForm onSwitchToLogin={() => setModoAtual('login')} />
        )}
      </div>
    </div>
  );
}
