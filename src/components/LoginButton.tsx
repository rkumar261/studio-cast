'use client';
import { ReactNode } from 'react';
import { AuthAPI } from '@/lib/api';

type Props = {
  className?: string;
  children?: ReactNode;
};

export default function LoginButton({ className, children }: Props) {
  const handleLogin = () => {
    AuthAPI.googleStart(); // starts OAuth via backend
  };

  return (
    <button
      onClick={handleLogin}
      className={
        className ??
        'bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700'
      }
    >
      {children ?? 'Login with Google'}
    </button>
  );
}
