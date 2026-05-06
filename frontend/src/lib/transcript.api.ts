import { api } from '@/lib/http';

export type TranscriptSegmentDto = {
  id: string;
  recordingId: string;
  trackId: string | null;
  startMs: number;
  endMs: number;
  text: string;
  speaker: string | null;
  confidence: number | null;
};

export type TranscriptAssetDto = {
  id?: string;
  state: 'pending' | 'processing' | 'ready' | 'failed';
  revision: number;
  language?: string;
  sourceType?: string;
  sourceAssetId?: string;
  segmentCount: number;
  processingStartedAt?: string;
  publishedAt?: string;
  readyAt?: string;
  failedAt?: string;
  failureReason?: string;
};

export type GetTranscriptResponse = {
  recordingId: string;
  transcript: TranscriptAssetDto;
  segments: TranscriptSegmentDto[];
};

export type SaveTranscriptSegmentInput = {
  trackId?: string | null;
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string | null;
  confidence?: number | null;
};

export type SaveTranscriptRequest = {
  baseRevision?: number;
  publish?: boolean;
  segments: SaveTranscriptSegmentInput[];
};

export const TranscriptAPI = {
  getForRecording: (recordingId: string) =>
    api<GetTranscriptResponse>(`/v1/recordings/${recordingId}/transcript`),
  saveRevision: (recordingId: string, body: SaveTranscriptRequest) =>
    api<GetTranscriptResponse>(`/v1/recordings/${recordingId}/transcript`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
};
