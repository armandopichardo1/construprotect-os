import type { ReactNode } from 'react';
import { BottomNav } from './BottomNav';

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-[480px] px-4 pb-24 pt-4">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
