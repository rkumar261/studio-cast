import './globals.css';
import Navbar from '@/components/Navbar';
import { SessionProvider } from '@/lib/useSession';

export const metadata = {
  title: 'Studio Cast',
  description: 'AI Enabled Recording Studio',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <SessionProvider>
          <Navbar />
          <main>{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
