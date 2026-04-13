'use client';
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { clearAuthRedirectCookie } from '@/lib/auth-redirect';
import { AuthAPI } from '@/lib/api';

type Profile = {
  id?: string;
  email?: string;
  name?: string;
  imageUrl?: string;
} | null;

interface SessionContextType {
  profile: Profile;
  isLoading: boolean;
  setProfile: (p: Profile) => void;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

function clearFrontendSessionCookies() {
  if (typeof document === 'undefined') return;

  document.cookie = 'studio_cast_session=; Path=/; Max-Age=0; SameSite=Lax';
  document.cookie = 'access_token=; Path=/; Max-Age=0; SameSite=Lax';
}

function syncSessionMarkerCookie(isAuthed: boolean) {
  if (typeof document === 'undefined') return;

  if (!isAuthed) {
    clearFrontendSessionCookies();
    return;
  }

  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `studio_cast_session=1; Path=/; SameSite=Lax${secure}`;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function refreshProfile() {
    try {
      const user = await AuthAPI.me();
      syncSessionMarkerCookie(true);
      setProfile(user);
    } catch {
      syncSessionMarkerCookie(false);
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function logout() {
    setIsLoading(true);
    try {
      await AuthAPI.logout();
      clearFrontendSessionCookies();
      clearAuthRedirectCookie();
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refreshProfile();
  }, []);

  return (
    <SessionContext.Provider value={{ profile, isLoading, setProfile, refreshProfile, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
