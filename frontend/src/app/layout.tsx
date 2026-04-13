import './globals.css';
import { Space_Grotesk } from 'next/font/google';
import LegacyRouteNavbar from '@/components/LegacyRouteNavbar';
import { SessionProvider } from '@/lib/useSession';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
});

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
      <body suppressHydrationWarning className={spaceGrotesk.variable}>
        <SessionProvider>
          <LegacyRouteNavbar />
          <main>{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
