'use client';
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function refreshProfile() {
    try {
      const user = await AuthAPI.me();
      setProfile(user);
    } catch {
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refreshProfile();
  }, []);

  return (
    <SessionContext.Provider value={{ profile, isLoading, setProfile, refreshProfile }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
