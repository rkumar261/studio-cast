export type ClaimGuestParticipantBody = {
  token: string;
  displayName?: string;
  email?: string;
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

export type BootstrapGuestParticipantBody = {
  token: string;
  displayName: string;
  email?: string;
};
