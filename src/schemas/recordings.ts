// src/schemas/recordings.ts
import { z } from 'zod';

export const CreateRecordingSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

// path params
export const RecordingIdParam = z.object({
  id: z.string().uuid(),
});
