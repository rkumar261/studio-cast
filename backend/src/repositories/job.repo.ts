import { prisma } from '../lib/prisma.js';
import { job_state, job_type } from '@prisma/client';

export async function createJob(
    recordingId: string,
    type: job_type,
    payload: any = {}
) {
    return prisma.job.create({
        data: {
            recording_id: recordingId,
            type,
            payload_json: payload,
            state: job_state.queued, // optional; default is queued anyway
        },
    });
}

function hasTrackId(payload: unknown, trackId: string): boolean {
    if (!payload || typeof payload !== 'object') return false;
    return (payload as { trackId?: unknown }).trackId === trackId;
}

export async function findLatestTrackJob(
    recordingId: string,
    type: job_type,
    trackId: string
) {
    const jobs = await prisma.job.findMany({
        where: {
            recording_id: recordingId,
            type,
        },
        orderBy: { created_at: 'desc' },
        take: 100,
    });

    return jobs.find((job) => hasTrackId(job.payload_json, trackId)) ?? null;
}

export async function ensureTrackJob(
    recordingId: string,
    type: job_type,
    trackId: string,
    payload: Record<string, unknown> = {}
) {
    const existing = await findLatestTrackJob(recordingId, type, trackId);
    if (
        existing &&
        (existing.state === job_state.queued ||
            existing.state === job_state.running ||
            existing.state === job_state.succeeded)
    ) {
        return { created: false as const, job: existing };
    }

    const created = await createJob(recordingId, type, {
        ...payload,
        trackId,
    });
    return { created: true as const, job: created };
}

export async function enqueueTranscodeJob(recordingId: string, trackId: string) {
    return ensureTrackJob(recordingId, job_type.transcode, trackId);
}

export async function enqueueStitchJob(recordingId: string, trackId: string) {
    return ensureTrackJob(recordingId, job_type.stitch, trackId);
}

export async function enqueueAsrJob(recordingId: string, trackId: string) {
    return ensureTrackJob(recordingId, job_type.asr, trackId);
}
