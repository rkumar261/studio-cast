import { createRecording } from '../repositories/recording.repo.js';
import type { CreateRecordingResponse } from '../dto/recordings/create.dto.js';
import type { GetRecordingResponse } from '../dto/recordings/get.dto.js';

import { findRecordingById } from '../repositories/recording.repo.js';
import { ListRecordingsResponse } from '../dto/recordings/list.dto.js';
import { listRecordingsByOwner } from '../repositories/recording.repo.js';


export type CreateRecordingArgs = {
  userId?: string | null;
  title?: string | null;
};


/**
 * Creates a recording and returns the API-shaped DTO.
 * - trims title; empty/whitespace -> null
 * - relies on Prisma default status ('draft') in schema
 */
export async function createRecordingService(
  args: CreateRecordingArgs
): Promise<CreateRecordingResponse['recording']> {
  // sanitize title
  const raw = args.title ?? '';
  const trimmed = raw.trim();
  const safeTitle = trimmed.length > 0 ? trimmed : null;

  // write to DB via repo
  const rec = await createRecording({
    userId: args.userId ?? null,
    title: safeTitle,
  });

  // NOTE: your Prisma field is `created_at` (snake_case)
  return {
    id: rec.id,
    title: rec.title ?? undefined,
    status: rec.status,
    createdAt: rec.created_at.toISOString(),
  };
}

export type GetRecordingArgs = {
  id: string;
  requesterId?: string | null;
};

export type GetRecordingResult =
  | { code: 'ok'; data: GetRecordingResponse }
  | { code: 'not_found' }
  | { code: 'forbidden' };

export async function getRecordingService(
  args: GetRecordingArgs
): Promise<GetRecordingResult> {

  const rec = await findRecordingById(args.id);

  if (!rec) return { code: 'not_found' };

  if (rec.userId && rec.userId !== (args.requesterId ?? undefined)) {
    return { code: 'forbidden' };
  }

  const data: GetRecordingResponse = {
    recording: {
      id: rec.id,
      title: rec.title ?? undefined,
      createdAt: rec.created_at.toISOString(),
    },
  };

  return { code: 'ok', data };
}

export async function listRecordingService(userId: string, limit = 20, cursor?: string): Promise<ListRecordingsResponse> {

  const { rows, nextCursor } = await listRecordingsByOwner(userId, limit, cursor);

  return {
    items: rows.map((r: any) => ({
      id: r.id,
      title: r.title ?? undefined,
      status: r.status,
      createdAt: r.created_at.toISOString(),
    })),
    nextCursor,
  };
}
