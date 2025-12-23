export type GetParticipantsResponse = {
  participants: Array<{
    id: string;
    recordingId: string;
    role: 'host' | 'guest';
    displayName?: string;
    email?: string;
  }>;
};
