import { prisma } from '../lib/prisma.js';
import { job_state, job_type } from '@prisma/client';


export async function createJob(recordingId: string, type: 'transcode' | 'asr' | 'export', payload: any = {}) {
    return prisma.job.create({
        data: {
            recording_id: recordingId, 
            type, 
            payload_json: payload,
            state: 'queued'
        }
    });
}

export async function enqueueTranscodeJob(recordingId: string, trackId: string) {
    return createJob(recordingId,  job_type.transcode, { trackId });
}

export async function enqueueAsrJob(recordingId: string, trackId: string) {
    return createJob(recordingId, job_type.asr, { trackId });
}