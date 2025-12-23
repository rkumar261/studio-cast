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

export type GetTranscriptResponse = {
    recordingId: string;
    segments: TranscriptSegmentDto[];
};
