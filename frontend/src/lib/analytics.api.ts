import { api } from '@/lib/http';

export type AnalyticsSummaryResponse = {
  totalMinutesRecorded: number;
  projectCount: number;
  lastRecordingAt: string | null;
};

export const AnalyticsAPI = {
  summary: async () => api<AnalyticsSummaryResponse>('/v1/analytics/summary'),
};
