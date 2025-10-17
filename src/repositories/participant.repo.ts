import { prisma } from '../lib/prisma.js';

export  type ParticipantCreateInput = {
    recordingId: string;
    role: 'guest' | 'host';
    displayName?: string;
    email?: string;
    magicLinkHash?: string;
};

export async function createParticipant(input: ParticipantCreateInput) {

    return prisma.participant.create({
        data: {
            recording_id: input.recordingId,
            role: input.role,
            display_name: input.displayName ?? null,
            email: input.email ?? null,
            magic_link_hash: input.magicLinkHash ?? null,
        }
    });
}

export async function findRecordingOwner(recordingId: string) {
    return prisma.recording.findUnique({
        where: { id: recordingId },
        select: { userId: true },
    });
}