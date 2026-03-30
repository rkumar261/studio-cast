'use client';

import { usePathname } from 'next/navigation';
import Navbar from '@/components/Navbar';

const LEGACY_PUBLIC_PATHS = ['/start', '/tech-check', '/meet'];

export default function LegacyRouteNavbar() {
  const pathname = usePathname();

  if (!pathname) return null;

  const shouldRenderNavbar = LEGACY_PUBLIC_PATHS.some(
    (segment) => pathname === segment || pathname.startsWith(`${segment}/`)
  );

  if (!shouldRenderNavbar) return null;

  return <Navbar />;
}
