export type ListRecordingsResponse = {
  items: Array<{
    id: string;
    title?: string;
    status: string;
    createdAt: string;
  }>;
  nextCursor?: string;
};
