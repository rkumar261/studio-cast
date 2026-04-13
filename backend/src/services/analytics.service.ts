import { prisma } from '../lib/prisma.js';
import type { AnalyticsSummaryResponse } from '../dto/analytics/summary.dto.js';

export async function getAnalyticsSummaryService(userId: string): Promise<AnalyticsSummaryResponse> {
  const [projectCount, latestRecording, durationAggregate] = await Promise.all([
    prisma.recording.count({
      where: { userId },
    }),
    prisma.recording.findFirst({
      where: { userId },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      select: { created_at: true },
    }),
    prisma.combined_asset.aggregate({
      where: {
        recording: { userId },
        duration_ms: { not: null },
      },
      _sum: {
        duration_ms: true,
      },
    }),
  ]);

  const totalDurationMs = durationAggregate._sum.duration_ms ?? 0;

  return {
    totalMinutesRecorded: Math.max(0, Math.round(totalDurationMs / 60000)),
    projectCount,
    lastRecordingAt: latestRecording?.created_at.toISOString() ?? null,
  };
}
