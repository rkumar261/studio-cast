export type ListRecordingsResponse = {
  items: Array<{
    id: string;
    title?: string;
    participantNames?: string[];
    status: string;
    createdAt: string;
    thumbnailUrl?: string;
  }>;
  nextCursor?: string;
};
