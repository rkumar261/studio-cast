import { api } from '@/lib/http';

export type UploadKind = 'audio' | 'video' | 'screen';
export type UploadProtocol = 'tus' | 'multipart';

export type InitiateUploadRequest = {
  recordingId: string;
  participantId: string;
  kind: UploadKind;
  protocol: UploadProtocol;
  filename?: string;
  size?: number;
  contentType?: string;
  partSize?: number;
};

export type InitiateUploadResponse = {
  upload: {
    id: string;
    trackId: string;
    protocol: UploadProtocol;
    state: 'in_progress';
  };
  tusEndpoint?: string;
  presignedUrls?: string[];
  partSize?: number;
};

export type CompleteMultipartUploadRequest = {
  protocol: 'multipart';
  parts: Array<{ partNumber: number; etag: string }>;
  totalBytes?: number;
};

export type CompleteUploadResponse = {
  ok: true;
  jobId: string;
};

export const UploadsAPI = {
  initiate: (body: InitiateUploadRequest) =>
    api<InitiateUploadResponse>('/v1/uploads/initiate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  completeMultipart: (uploadId: string, body: CompleteMultipartUploadRequest) =>
    api<CompleteUploadResponse>(`/v1/uploads/${uploadId}/complete`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
