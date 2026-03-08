export type CompleteTrackChunkBody = {
  protocol: 'tus' | 'multipart';
  bytesReceived?: number;
  storageKeyRaw?: string;
  etag?: string;
  checksumSha256?: string;
  tusUrl?: string;
};

export type CompleteTrackChunkResponse = {
  chunk: {
    id: string;
    trackId: string;
    seq: number;
    protocol?: string;
    state: string;
    bytesReceived: number;
    bytesExpected?: number;
    storageKeyRaw?: string;
    tusUploadId?: string;
    tusResourceUrl?: string;
    tusUploadState?: string;
    failureReason?: string;
    lastErrorAt?: string;
    materializedAt?: string;
    etag?: string;
    checksumSha256?: string;
    createdAt: string;
    updatedAt: string;
  };
  already?: boolean;
};
