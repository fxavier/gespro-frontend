/**
 * Página pública de contacto/suporte — acessível sem sessão (ligada a partir do
 * ecrã de login). Não fabrica contactos específicos: a orientação real para um
 * ERP multi-tenant é o utilizador contactar o administrador da sua organização.
 * O owner pode preencher canais concretos (email/telefone) quando os definir.
 */

import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft, Building2, LifeBuoy, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Contacto e Suporte',
  description: 'Como obter ajuda com o acesso e utilização do GestPro.',
};

export default function ContactosPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-2xl space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Contacto e Suporte</h1>
          <p className="text-muted-foreground">
            Estamos aqui para ajudar. Escolha o canal adequado à sua questão.
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3">
            <Building2 className="h-5 w-5 text-primary" aria-hidden />
            <CardTitle className="text-base">Acesso à conta</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Para recuperar credenciais, obter um convite ou alterar permissões,
            contacte o <strong className="text-foreground">administrador da sua organização</strong>.
            É quem gere os utilizadores e os acessos do vosso espaço no GestPro.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3">
            <LifeBuoy className="h-5 w-5 text-primary" aria-hidden />
            <CardTitle className="text-base">Suporte técnico</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              Para incidentes técnicos ou dúvidas de utilização, o administrador da
              sua organização encaminha o pedido para a equipa de suporte do GestPro.
            </p>
            <p className="flex items-center gap-2">
              <Mail className="h-4 w-4" aria-hidden />
              <span>Canal de suporte a definir pela organização.</span>
            </p>
          </CardContent>
        </Card>

        <div className="text-center">
          <Button asChild variant="ghost">
            <Link href="/auth/login">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar ao início de sessão
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
