import { API_BASE, api, setApiAuthMode } from '@/lib/http';

export const AuthAPI = {
  me: async () => {
    const data = await api<{ user: { id: string; email: string; name?: string; imageUrl?: string } }>(
      '/auth/me'
    );
    setApiAuthMode('default');
    return data.user;
  },
  logout: async () => {
    setApiAuthMode('default');
    const res = await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
    if (!res.ok) {
      throw new Error(`Logout failed with status ${res.status}`);
    }
  },
  googleStart: () => {
    setApiAuthMode('default');
    window.location.href = `${API_BASE}/auth/oauth/google/start`;
  },
};
