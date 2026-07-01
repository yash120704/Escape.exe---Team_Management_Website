import type {Metadata} from 'next';
import './globals.css';

import { Toaster } from "@/components/ui/toaster";
import { cn } from '@/lib/utils';
import { SupabaseAuthListener } from "@/components/supabase-auth-listener";

export const metadata: Metadata = {
  title: 'SCRS Gravitas Team Management',
  description: 'Team management, onboarding, and authentication for SCRS Gravitas.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Creepster&family=Roboto+Mono:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body className={cn('font-body antialiased min-h-screen bg-background')}>
        <SupabaseAuthListener />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
