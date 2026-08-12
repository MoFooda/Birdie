import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Website Opportunity Engine',
  description:
    'Import an Apollo export, audit each company website against its sector and competitors, and generate evidence-based outreach.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
