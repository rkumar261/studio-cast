import { randomBytes, createHash } from 'crypto';
import type { CreateParticipantRequestBody, CreateParticipantResponse } from '../dto/participants/create.dto.js';
import { findRecordingById } from '../repositories/recording.repo.js';
import { createParticipant, } from '../repositories/participant.repo.js';
import type { GetParticipantsResponse } from '../dto/participants/get.dto.js';
import { findRecordingOwner, listParticipantsByRecording } from '../repositories/participant.repo.js';

export async function createParticipantService(
    recordingId: string,
    requesterId: string | null,
    body: CreateParticipantRequestBody
): Promise<{
    code: 'ok';
    data: CreateParticipantResponse
} | {
    code: 'forbidden'
} | {
    code: 'not_found'
}> {

    const rec = await findRecordingById(recordingId);
    if (!rec) {
        return { code: 'not_found' };
    }

    if (rec.userId && rec.userId !== requesterId) {
        return { code: 'forbidden' };
    }

    let magicLink: string | undefined = undefined;
    let magicHash: string | undefined = undefined;

    const base = process.env.MAGIC_LINK_BASE_URL!;
    if (body.role == 'guest') {
        const token = randomBytes(32).toString('hex');
        magicHash = createHash('sha256').update(token).digest('hex');
        magicLink = `${base}/${token}`;
    }

    const participant = await createParticipant({
        recordingId,
        role: body.role,
        displayName: body.displayName,
        email: body.email,
        magicLinkHash: magicHash,
    });

    const response: CreateParticipantResponse = {
        participant: {
            id: participant.id,
            recordingId: participant.recording_id,
            role: participant.role as 'host' | 'guest',
            displayName: participant.display_name ?? undefined,
            email: participant.email ?? undefined,
        },
        ...(magicLink ? { magicLink } : {}),
    };

    return { code: 'ok', data: response };
}

export async function listParticipantsService(
    recordingId: string,
    requesterId: string | null
): Promise<{ code: 'ok'; data: GetParticipantsResponse } | { code: 'forbidden' } | { code: 'not_found' }> {
    const rec = await findRecordingOwner(recordingId);
    if (!rec) return { code: 'not_found' };
    if (rec.userId && rec.userId !== requesterId) return { code: 'forbidden' };

    const participants = await listParticipantsByRecording(recordingId);

    return {
        code: 'ok',
        data: {
            participants: participants.map(p => ({
                id: p.id,
                recordingId: p.recording_id,
                role: p.role as 'host' | 'guest',
                displayName: p.display_name ?? undefined,
                email: p.email ?? undefined,
            })),
        },
    };
}