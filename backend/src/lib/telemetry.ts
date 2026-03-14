type LoggerMethod = (obj: Record<string, unknown>, msg?: string) => void;

type LoggerLike = {
  info?: LoggerMethod;
  warn?: LoggerMethod;
  error?: LoggerMethod;
};

export const TASK17_TELEMETRY_EVENTS = [
  'guest.bootstrap.accepted',
  'guest.claim.accepted',
  'guest.joined.session',
  'recording.session.started',
  'recording.session.stopped',
  'track.finalized',
  'upload.recovery.snapshot',
  'upload.chunk.completed',
  'upload.chunk.failed',
  'upload.participant.completed',
  'stitch.started',
  'stitch.finished',
  'stitch.failed',
  'asset.participant.ready',
  'asset.participant.failed',
  'asset.combined.ready',
  'asset.combined.failed',
  'transcript.ready',
  'transcript.failed',
  'export.ready',
  'export.failed',
] as const;

export type Task17TelemetryEvent = (typeof TASK17_TELEMETRY_EVENTS)[number];
export type TelemetryLevel = 'info' | 'warn' | 'error';

export type TelemetryFields = {
  recordingId?: string;
  sessionId?: string;
  participantId?: string;
  trackId?: string;
  chunkId?: string;
  assetId?: string;
  jobId?: string;
  [key: string]: unknown;
};

type EmitTelemetryArgs = TelemetryFields & {
  event: Task17TelemetryEvent | (string & {});
  level?: TelemetryLevel;
  message?: string;
  logger?: LoggerLike | null;
  err?: unknown;
};

function extractErrorFields(err: unknown): Record<string, unknown> | undefined {
  if (!err) return undefined;
  if (typeof err === 'string') {
    return { errorMessage: err };
  }
  if (typeof err === 'object') {
    const asAny = err as { name?: unknown; message?: unknown; code?: unknown; stack?: unknown };
    return {
      errorName: typeof asAny.name === 'string' ? asAny.name : undefined,
      errorCode: typeof asAny.code === 'string' ? asAny.code : undefined,
      errorMessage: typeof asAny.message === 'string' ? asAny.message : String(err),
      errorStack: typeof asAny.stack === 'string' ? asAny.stack : undefined,
    };
  }
  return { errorMessage: String(err) };
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as T;
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

export function emitTelemetry(args: EmitTelemetryArgs) {
  const {
    logger,
    event,
    level = 'info',
    message,
    err,
    ...fields
  } = args;

  const payload = stripUndefined({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
    ...extractErrorFields(err),
  });

  const msg = message ?? event;
  if (logger) {
    if (level === 'error' && logger.error) {
      logger.error(payload, msg);
      return;
    }
    if (level === 'warn' && logger.warn) {
      logger.warn(payload, msg);
      return;
    }
    if (logger.info) {
      logger.info(payload, msg);
      return;
    }
  }

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

