export type RegisterTrackBody = {
  participantId: string;
  kind: 'audio' | 'video' | 'screen';
  codec?: string;
};

export type RegisterTrackResponse = {
  track: {
    id: string;
    recordingId: string;
    participantId: string;
    kind: 'audio' | 'video' | 'screen';
    codec?: string;
    state: string;
    createdAt: string;
  };
  existed: boolean;
};
