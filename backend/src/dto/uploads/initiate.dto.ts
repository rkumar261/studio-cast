export type InitiateUploadBody = {
  recordingId: string;
  participantId: string;
  kind: 'audio' | 'video' | 'screen';
  protocol: 'tus' | 'multipart';
  // multipart-only (optional at type level; validated in service)
  filename?: string;
  size?: number;
  contentType?: string;
  partSize?: number;
};

export type InitiateUploadResponse = {
    upload: {
        id: string;
        trackId: string;
        protocol: 'tus' | 'multipart';
        state: 'in_progress';
    };
    tusEndpoint?: string;

    // multipart
    presignedUrls?: string[];
    partSize?: number;
}