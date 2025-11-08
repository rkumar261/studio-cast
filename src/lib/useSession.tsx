'use client';
import React, { createContext, useContext, useState, ReactNode } from 'react';

type Profile = {
  id?: string;
  email?: string;
  name?: string;
  imageUrl?: string;
} | null;

interface SessionContextType {
  profile: Profile;
  setProfile: (p: Profile) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile>(null);

  return (
    <SessionContext.Provider value={{ profile, setProfile }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}