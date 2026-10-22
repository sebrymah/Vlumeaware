import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { ToastProvider } from '@/components/toast';

export const metadata: Metadata = {
  title: 'Vlumeaware',
  description: 'Phishing simulation and security awareness platform by Vlumetech LTD',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
      <ToastProvider>{children}</ToastProvider>
    </body>
    </html>
  );
}
