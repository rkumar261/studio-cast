import { transcript_state } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type {
    GetTranscriptResponse,
    SaveTranscriptRequest,
    SaveTranscriptResponse,
    TranscriptSegmentDto,
} from '../dto/transcripts/get.dto.js';
import { prisma } from '../lib/prisma.js';
import {
    getLatestTranscriptByRecordingId,
    listTranscriptSegmentsByRecordingId,
    listTranscriptSegmentsByTranscriptId,
} from '../repositories/transcript.repo.js';
import { getRecordingService } from './recordings.service.js';

type GetTranscriptArgs = {
    recordingId: string;
    requesterId: string;
};

export type GetTranscriptResult =
    | { code: 'ok'; data: GetTranscriptResponse }
    | { code: 'not_found' | 'forbidden' };

type SaveTranscriptArgs = {
    recordingId: string;
    requesterId: string;
    input: SaveTranscriptRequest;
};

export type SaveTranscriptResult =
    | { code: 'ok'; data: SaveTranscriptResponse }
    | { code: 'not_found' | 'forbidden' }
    | { code: 'conflict'; latestRevision: number }
    | { code: 'bad_request'; message: string };

function mapTranscriptSegments(
    rows: Array<{
        id: string;
        recording_id: string;
        track_id: string | null;
        start_ms: number;
        end_ms: number;
        text: string;
        speaker: string | null;
        confidence: unknown;
    }>,
): TranscriptSegmentDto[] {
    return rows.map((s) => ({
        id: s.id,
        recordingId: s.recording_id,
        trackId: s.track_id,
        startMs: s.start_ms,
        endMs: s.end_ms,
        text: s.text,
        speaker: s.speaker,
        confidence: s.confidence ? Number(s.confidence) : null,
    }));
}

function normalizeInputSegments(input: SaveTranscriptRequest['segments']) {
    return input
        .map((segment, idx) => {
            const text = String(segment.text ?? '').trim();
            if (!text) return null;
            const startMs = Math.max(0, Math.floor(Number(segment.startMs ?? 0)));
            const endMs = Math.max(startMs + 100, Math.floor(Number(segment.endMs ?? startMs + 100)));
            return {
                order: idx,
                trackId: segment.trackId ?? null,
                startMs,
                endMs,
                text,
                speaker: segment.speaker ? String(segment.speaker).trim() : null,
                confidence:
                    typeof segment.confidence === 'number' && Number.isFinite(segment.confidence)
                        ? segment.confidence
                        : null,
            };
        })
        .filter((segment): segment is NonNullable<typeof segment> => segment !== null)
        .sort((a, b) => (a.startMs === b.startMs ? a.order - b.order : a.startMs - b.startMs));
}

export async function getTranscriptByRecordingIdService(
    args: GetTranscriptArgs,
): Promise<GetTranscriptResult> {
    const { recordingId, requesterId } = args;

    // reuse recording ACL
    const recResult = await getRecordingService({ id: recordingId, requesterId });

    if (recResult.code === 'not_found') {
        return { code: 'not_found' };
    }

    if (recResult.code === 'forbidden') {
        return { code: 'forbidden' };
    }

    const transcript = await getLatestTranscriptByRecordingId(recordingId);
    const rows = transcript?.id
        ? await listTranscriptSegmentsByTranscriptId(transcript.id)
        : await listTranscriptSegmentsByRecordingId(recordingId);

    const segments = mapTranscriptSegments(rows);

    const data: GetTranscriptResponse = {
        recordingId,
        transcript: {
            id: transcript?.id,
            state: transcript?.state ?? 'pending',
            revision: transcript?.revision ?? 0,
            language: transcript?.language ?? undefined,
            sourceType: transcript?.source_type ?? undefined,
            sourceAssetId: transcript?.source_asset_id ?? undefined,
            segmentCount: transcript?.segment_count ?? segments.length,
            processingStartedAt: transcript?.processing_started_at?.toISOString(),
            publishedAt: transcript?.published_at?.toISOString(),
            readyAt: transcript?.ready_at?.toISOString(),
            failedAt: transcript?.failed_at?.toISOString(),
            failureReason: transcript?.failure_reason ?? undefined,
        },
        segments,
    };

    return { code: 'ok', data };
}

export async function saveTranscriptRevisionService(
    args: SaveTranscriptArgs,
): Promise<SaveTranscriptResult> {
    const { recordingId, requesterId, input } = args;

    const recResult = await getRecordingService({ id: recordingId, requesterId });
    if (recResult.code === 'not_found') return { code: 'not_found' };
    if (recResult.code === 'forbidden') return { code: 'forbidden' };

    const normalized = normalizeInputSegments(input.segments ?? []);
    if (normalized.length === 0) {
        return { code: 'bad_request', message: 'At least one transcript segment is required.' };
    }

    const latest = await getLatestTranscriptByRecordingId(recordingId);
    if (
        typeof input.baseRevision === 'number' &&
        latest &&
        input.baseRevision !== latest.revision
    ) {
        return { code: 'conflict', latestRevision: latest.revision };
    }
    if (
        typeof input.baseRevision === 'number' &&
        !latest &&
        input.baseRevision !== 0
    ) {
        return { code: 'conflict', latestRevision: 0 };
    }

    const now = new Date();
    const publish = input.publish !== false;
    const nextState: transcript_state = publish ? transcript_state.ready : transcript_state.processing;
    const nextRevision = latest ? latest.revision + 1 : 1;
    const transcriptId = latest?.id ?? randomUUID();

    await prisma.$transaction(async (tx) => {
        if (latest) {
            await tx.transcript.update({
                where: { id: latest.id },
                data: {
                    revision: nextRevision,
                    state: nextState,
                    source_type: 'manual_edit',
                    source_asset_id: latest.source_asset_id ?? latest.id,
                    segment_count: normalized.length,
                    processing_started_at: publish ? latest.processing_started_at : now,
                    published_at: publish ? now : null,
                    ready_at: publish ? now : null,
                    failed_at: null,
                    failure_reason: null,
                },
            });
        } else {
            await tx.transcript.create({
                data: {
                    id: transcriptId,
                    recording_id: recordingId,
                    track_id: null,
                    revision: nextRevision,
                    state: nextState,
                    language: 'en',
                    source_type: 'manual_edit',
                    source_asset_id: transcriptId,
                    segment_count: normalized.length,
                    processing_started_at: now,
                    published_at: publish ? now : null,
                    ready_at: publish ? now : null,
                    failed_at: null,
                    failure_reason: null,
                    storage_key: null,
                },
            });
        }

        await tx.transcript_segment.deleteMany({
            where: { transcript_id: transcriptId },
        });

        await tx.transcript_segment.createMany({
            data: normalized.map((segment) => ({
                transcript_id: transcriptId,
                recording_id: recordingId,
                track_id: segment.trackId,
                start_ms: segment.startMs,
                end_ms: segment.endMs,
                text: segment.text,
                speaker: segment.speaker,
                confidence: segment.confidence,
            })),
        });
    });

    const transcript = await getLatestTranscriptByRecordingId(recordingId);
    const rows = transcript?.id
        ? await listTranscriptSegmentsByTranscriptId(transcript.id)
        : [];
    const segments = mapTranscriptSegments(rows);

    return {
        code: 'ok',
        data: {
            recordingId,
            transcript: {
                id: transcript?.id,
                state: transcript?.state ?? 'pending',
                revision: transcript?.revision ?? 0,
                language: transcript?.language ?? undefined,
                sourceType: transcript?.source_type ?? undefined,
                sourceAssetId: transcript?.source_asset_id ?? undefined,
                segmentCount: transcript?.segment_count ?? segments.length,
                processingStartedAt: transcript?.processing_started_at?.toISOString(),
                publishedAt: transcript?.published_at?.toISOString(),
                readyAt: transcript?.ready_at?.toISOString(),
                failedAt: transcript?.failed_at?.toISOString(),
                failureReason: transcript?.failure_reason ?? undefined,
            },
            segments,
        },
    };
}
