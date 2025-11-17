
'use client';

import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import MainSidebar from '@/components/layout/Sidebar';
import Footer from '@/components/layout/Footer';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Bell, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <MainSidebar />
        <SidebarInset className="flex-1 overflow-auto flex flex-col">
          <header className="h-16 border-b flex items-center justify-between px-6" style={{ backgroundColor: '#1877F2' }}>
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-semibold text-white">Sistema ERP</h1>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                <Bell className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                <User className="h-5 w-5" />
              </Button>
              <div className="[&_button]:text-white [&_button]:hover:bg-white/10">
                <ThemeToggle />
              </div>
            </div>
          </header>
          
          <main className="flex-1 overflow-auto">
            {children}
          </main>

          <Footer />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
