import './globals.css';
import Navbar from '@/components/Navbar';
import { SessionProvider } from '@/lib/useSession';

export const metadata = {
  title: 'riverside-lite',
  description: 'Lightweight recording app',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <Navbar />
          <main>{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}