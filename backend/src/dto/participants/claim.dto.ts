export type ClaimGuestParticipantBody = {
  token: string;
};

export type ClaimGuestParticipantResponse = {
  participant: {
    id: string;
    recordingId: string;
    role: 'guest';
    displayName?: string;
    email?: string;
  };
};
