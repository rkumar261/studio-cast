import { api, setApiAuthMode } from '@/lib/http';

export type CreateParticipantResponse = {
  participant: { id: string; recordingId: string; role: 'host' | 'guest'; displayName?: string; email?: string };
  magicLink?: string;
};

export type GetParticipantsResponse = {
  participants: Array<{ id: string; recordingId: string; role: 'host' | 'guest'; displayName?: string; email?: string }>;
};

export type ClaimGuestParticipantResponse = {
  participant: { id: string; recordingId: string; role: 'guest'; displayName?: string; email?: string };
};

export const ParticipantsAPI = {
  bootstrapGuest: async (payload: { token: string; displayName: string; email?: string }) => {
    const response = await api<ClaimGuestParticipantResponse>('/v1/guest/bootstrap', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setApiAuthMode('guest');
    return response;
  },
  claimGuest: async (token: string) => {
    const response = await api<ClaimGuestParticipantResponse>('/v1/participants/claim', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    setApiAuthMode('guest');
    return response;
  },
  create: (recordingId: string, payload: { role: 'host' | 'guest'; displayName: string; email?: string }) =>
    api<CreateParticipantResponse>(`/v1/recordings/${recordingId}/participants`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  list: (recordingId: string) =>
    api<GetParticipantsResponse>(`/v1/recordings/${recordingId}/participants`),
};
