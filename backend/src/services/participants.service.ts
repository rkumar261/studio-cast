import { randomBytes, createHash } from 'crypto';
import type { CreateParticipantRequestBody, CreateParticipantResponse } from '../dto/participants/create.dto.js';
import type {
    ClaimGuestParticipantBody,
    ClaimGuestParticipantResponse,
} from '../dto/participants/claim.dto.js';
import { findRecordingById } from '../repositories/recording.repo.js';
import { createParticipant, findHostParticipantByRecording } from '../repositories/participant.repo.js';
import type { GetParticipantsResponse } from '../dto/participants/get.dto.js';
import { findRecordingOwner, listParticipantsByRecording } from '../repositories/participant.repo.js';
import { prisma } from '../lib/prisma.js';
import { signGuestAccessJwt } from '../lib/jwt.js';

type GuestParticipantLookup = {
    id: string;
    recording_id: string;
    role: string;
    display_name: string | null;
    email: string | null;
    invite_expires_at: Date | null;
    invite_revoked_at: Date | null;
    invite_claimed_at: Date | null;
};

type GuestInviteRejectReason = 'invalid_token' | 'expired_invite' | 'revoked_invite';

export type GuestBootstrapAudit = {
    participantId: string;
    recordingId: string;
    inviteTokenHashPrefix: string;
    displayName: string;
    emailProvided: boolean;
};

const GUEST_INVITE_TTL_HOURS = Number.parseInt(process.env.GUEST_INVITE_TTL_HOURS ?? '168', 10);

function createGuestInviteExpiry(now = new Date()): Date {
    const ttlHours = Number.isFinite(GUEST_INVITE_TTL_HOURS) && GUEST_INVITE_TTL_HOURS > 0
        ? GUEST_INVITE_TTL_HOURS
        : 168;
    return new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
}

function toGuestParticipantResponse(participant: GuestParticipantLookup): ClaimGuestParticipantResponse {
    return {
        participant: {
            id: participant.id,
            recordingId: participant.recording_id,
            role: 'guest',
            displayName: participant.display_name ?? undefined,
            email: participant.email ?? undefined,
        },
    };
}

async function findGuestParticipantByInviteToken(token: string): Promise<{
    participant: GuestParticipantLookup | null;
    tokenHash: string;
    rejectReason?: GuestInviteRejectReason;
}> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const participant = await prisma.participant.findFirst({
        where: {
            magic_link_hash: tokenHash,
            role: 'guest',
        },
        select: {
            id: true,
            recording_id: true,
            role: true,
            display_name: true,
            email: true,
            invite_expires_at: true,
            invite_revoked_at: true,
            invite_claimed_at: true,
        },
    });

    if (!participant) {
        return { participant: null, tokenHash, rejectReason: 'invalid_token' };
    }
    if (participant.invite_revoked_at) {
        return { participant: null, tokenHash, rejectReason: 'revoked_invite' };
    }
    if (participant.invite_expires_at && participant.invite_expires_at.getTime() <= Date.now()) {
        return { participant: null, tokenHash, rejectReason: 'expired_invite' };
    }

    return { participant, tokenHash };
}

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

    if (body.role === 'host') {
        const existingHost = await findHostParticipantByRecording(recordingId);
        if (existingHost) {
            return {
                code: 'ok',
                data: {
                    participant: {
                        id: existingHost.id,
                        recordingId: existingHost.recording_id,
                        role: existingHost.role as 'host' | 'guest',
                        displayName: existingHost.display_name ?? undefined,
                        email: existingHost.email ?? undefined,
                    },
                },
            };
        }
    }

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
        inviteExpiresAt: body.role === 'guest' ? createGuestInviteExpiry() : null,
        userId: body.role === 'host' ? requesterId : null,
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

export async function claimGuestParticipantService(
    body: ClaimGuestParticipantBody
): Promise<
    | { code: 'ok'; data: ClaimGuestParticipantResponse; guestAccessToken: string }
    | { code: 'invalid_token'; reason: GuestInviteRejectReason }
> {
    const token = body.token?.trim();
    if (!token) return { code: 'invalid_token', reason: 'invalid_token' };

    const { participant, rejectReason } = await findGuestParticipantByInviteToken(token);

    if (!participant) return { code: 'invalid_token', reason: rejectReason ?? 'invalid_token' };

    const updated = await prisma.participant.update({
        where: { id: participant.id },
        data: {
            invite_claimed_at: participant.invite_claimed_at ?? new Date(),
        },
        select: {
            id: true,
            recording_id: true,
            role: true,
            display_name: true,
            email: true,
            invite_expires_at: true,
            invite_revoked_at: true,
            invite_claimed_at: true,
        },
    });

    const guestAccessToken = await signGuestAccessJwt({
        participantId: updated.id,
        recordingId: updated.recording_id,
    });

    return {
        code: 'ok',
        guestAccessToken,
        data: toGuestParticipantResponse(updated),
    };
}

export async function bootstrapGuestParticipantService(body: ClaimGuestParticipantBody): Promise<
    | {
        code: 'ok';
        data: ClaimGuestParticipantResponse;
        guestAccessToken: string;
        audit: GuestBootstrapAudit;
    }
    | { code: 'invalid_token'; reason: GuestInviteRejectReason }
    | { code: 'invalid_display_name'; message: string }
> {
    const token = body.token?.trim();
    if (!token) return { code: 'invalid_token', reason: 'invalid_token' };

    const displayName = body.displayName?.trim();
    if (!displayName) {
        return { code: 'invalid_display_name', message: 'displayName is required' };
    }

    const normalizedEmail = body.email?.trim();
    const { participant, tokenHash, rejectReason } = await findGuestParticipantByInviteToken(token);
    if (!participant) return { code: 'invalid_token', reason: rejectReason ?? 'invalid_token' };

    const updated = await prisma.participant.update({
        where: { id: participant.id },
        data: {
            invite_claimed_at: participant.invite_claimed_at ?? new Date(),
            display_name: displayName,
            ...(normalizedEmail !== undefined ? { email: normalizedEmail || null } : {}),
        },
        select: {
            id: true,
            recording_id: true,
            role: true,
            display_name: true,
            email: true,
            invite_expires_at: true,
            invite_revoked_at: true,
            invite_claimed_at: true,
        },
    });

    const guestAccessToken = await signGuestAccessJwt({
        participantId: updated.id,
        recordingId: updated.recording_id,
    });

    return {
        code: 'ok',
        guestAccessToken,
        data: toGuestParticipantResponse(updated),
        audit: {
            participantId: updated.id,
            recordingId: updated.recording_id,
            inviteTokenHashPrefix: tokenHash.slice(0, 12),
            displayName,
            emailProvided: normalizedEmail !== undefined && normalizedEmail.length > 0,
        },
    };
}
