import { api } from '@/lib/http';

export type LivekitTokenResponse = {
  token: string;
  wsUrl: string;
};

export const LiveKitAPI = {
  getToken: (roomName: string) =>
    api<LivekitTokenResponse>('/v1/livekit/token', {
      method: 'POST',
      body: JSON.stringify({ roomName }),
    }),
};
