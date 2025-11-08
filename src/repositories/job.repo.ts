import { prisma } from '../lib/prisma.js';

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

