'use client';
import { AuthAPI } from '@/lib/api';

type Props = {
  className?: string;
};

export default function LoginButton({ className }: Props) {
  const handleLogin = () => {
    AuthAPI.googleStart(); // starts OAuth via backend
  };

  return (
    <button
      onClick={handleLogin}
      className={className ?? 'bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700'}
    >
      Login with Google
    </button>
  );
}
