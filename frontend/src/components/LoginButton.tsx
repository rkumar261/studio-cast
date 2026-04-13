'use client';
import { ReactNode } from 'react';
import {
  writeAuthRedirectCookie,
} from '@/lib/auth-redirect';
import { AuthAPI } from '@/lib/api';

type Props = {
  className?: string;
  children?: ReactNode;
  nextPath?: string | null;
};

export default function LoginButton({ className, children, nextPath }: Props) {
  const handleLogin = () => {
    writeAuthRedirectCookie(nextPath);
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
