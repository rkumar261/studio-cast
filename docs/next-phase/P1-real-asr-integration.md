# P1 — Real ASR Integration

**Priority:** HIGH
**Status:** Not started
**Blocks:** Transcript feature, mp4_captions export
**Effort:** Human ~3 days / CC ~30 min

---

## Problem

`runAsrForTrack` in `backend/src/services/asr.service.ts` generates fake placeholder transcript text. This means:
- The transcript UI always shows dummy "Transcript segment N from..." text
- `mp4_captions` export always produces captions from fake segments — the burns are visually wrong
- The transcript revision lifecycle, the ASR worker, and the captions service are ALL complete — only this one function is a stub

## What's Already Built (Do Not Touch)

```
ASR flow (complete):
  asr.worker.ts
    → claims job from DB
    → calls runAsrForTrack()      ← ONLY this is a stub
    → publishTranscriptRevision()  ← complete
    → marks job done

Captions flow (complete):
  captions.service.ts
    → fetches published transcript segments
    → writes .srt file
    → ffmpeg subtitles burn-in
    → produces mp4_captions artifact
```

## Implementation

### Step 1 — Choose Provider

**Recommended: OpenAI Whisper API** (`whisper-1` model)
- Simple REST API, no streaming needed for batch ASR
- Supports WebM/Opus directly (no transcode required)
- Max 25MB per request — chunk large files

**Alternative: Deepgram** (better for future real-time, more complex now)

### Step 2 — Add env var

In `backend/.env`:
```
OPENAI_API_KEY=sk-...
```

In `backend/src/config.ts` (or wherever env is validated), add:
```typescript
OPENAI_API_KEY: z.string().min(1),
```

### Step 3 — Replace `runAsrForTrack`

File: `backend/src/services/asr.service.ts`

The function signature must stay identical:
```typescript
export async function runAsrForTrack(opts: {
  sourceStorageKey: string;
  sourceType: 'track' | 'participant_asset' | 'combined_asset';
  durationMs: number;
  language?: string;
}): Promise<{ segments: AsrSegment[] }>
```

Implementation outline:
```typescript
import OpenAI from 'openai';
import { downloadFromR2 } from './r2.service.ts'; // or however R2 download works
import { createReadStream } from 'fs';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function runAsrForTrack(opts): Promise<{ segments: AsrSegment[] }> {
  // 1. Download the source file from R2 to a temp path
  const tmpPath = join(tmpdir(), `asr-${Date.now()}.webm`);
  await downloadR2Object(opts.sourceStorageKey, tmpPath);

  try {
    // 2. Check file size — Whisper max is 25MB
    // If > 25MB, split into chunks (see chunking section below)
    const stat = await fs.stat(tmpPath);
    const WHISPER_MAX_BYTES = 25 * 1024 * 1024;

    let rawSegments: WhisperSegment[];

    if (stat.size <= WHISPER_MAX_BYTES) {
      rawSegments = await transcribeFile(tmpPath, opts.language);
    } else {
      rawSegments = await transcribeInChunks(tmpPath, opts.durationMs, opts.language);
    }

    // 3. Map Whisper segments → AsrSegment[]
    return {
      segments: rawSegments.map((s, i) => ({
        startMs: Math.round(s.start * 1000),
        endMs: Math.round(s.end * 1000),
        text: s.text.trim(),
        speaker: undefined, // Whisper base doesn't do diarization
        confidence: s.no_speech_prob != null ? 1 - s.no_speech_prob : 0.9,
      })),
    };
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}
```

### Step 4 — Chunking for large files

For files > 25MB, split by duration using ffmpeg:
```typescript
async function transcribeInChunks(
  filePath: string,
  totalDurationMs: number,
  language?: string
): Promise<WhisperSegment[]> {
  const CHUNK_MS = 10 * 60 * 1000; // 10-minute chunks
  const chunks = Math.ceil(totalDurationMs / CHUNK_MS);
  const allSegments: WhisperSegment[] = [];

  for (let i = 0; i < chunks; i++) {
    const startSec = (i * CHUNK_MS) / 1000;
    const chunkPath = `${filePath}.chunk${i}.webm`;

    // ffmpeg -ss startSec -t 600 -i filePath -c copy chunkPath
    await runFfmpegChunk(filePath, chunkPath, startSec, 600);

    const segments = await transcribeFile(chunkPath, language);
    // Adjust timestamps by chunk offset
    allSegments.push(
      ...segments.map((s) => ({
        ...s,
        start: s.start + startSec,
        end: s.end + startSec,
      }))
    );

    await unlink(chunkPath).catch(() => {});
  }

  return allSegments;
}
```

### Step 5 — R2 download utility

Check if a download-from-R2 utility already exists. Search:
```bash
grep -r "getObject\|downloadFromR2\|r2.*download" backend/src/services/ --include="*.ts" -l
```

If not, add to `backend/src/services/r2.service.ts`:
```typescript
export async function downloadR2Object(key: string, destPath: string): Promise<void> {
  const { Body } = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  const stream = Body as NodeJS.ReadableStream;
  await pipeline(stream, createWriteStream(destPath));
}
```

## Data Flow

```
ASR Worker
  │
  ├─ claims job (source = track | participant_asset | combined_asset)
  │
  ├─ runAsrForTrack(sourceStorageKey, durationMs, language)
  │     │
  │     ├─ download R2 object → /tmp/asr-{ts}.webm
  │     │
  │     ├─ size check ─── ≤25MB ──→ transcribeFile() → Whisper API
  │     │                │
  │     │                └─ >25MB → transcribeInChunks() → N × Whisper API calls
  │     │
  │     └─ map WhisperSegment[] → AsrSegment[] → return
  │
  ├─ publishTranscriptRevision(segments)   [unchanged]
  │
  └─ mark job done                         [unchanged]
```

## Edge Cases

| Case | Handling |
|------|----------|
| Whisper returns no segments (silence) | Return `[]` — transcript shows "No speech detected" |
| R2 download fails | Throw — worker marks job `failed`, retries on next poll |
| Whisper API 429 rate limit | Retry with exponential backoff (max 3 attempts) |
| File > 25MB with no ffmpeg | Throw with clear error message |
| language not set | Pass `undefined` — Whisper auto-detects |

## Speaker Diarization

Whisper `whisper-1` does not do diarization. Options:
1. **Now:** Leave `speaker: undefined` — transcript shows continuous text, no speaker labels
2. **Future:** Deepgram with diarization, or post-process with pyannote

For alpha, option 1 is correct. Add `// TODO(diarization): wire speaker labels when Deepgram replaces Whisper` comment.

## Dependencies

```bash
cd backend && npm install openai
```

No other new dependencies needed.

## Files to Change

| File | Change |
|------|--------|
| `backend/src/services/asr.service.ts` | Replace function body — signature unchanged |
| `backend/.env` / `.env.example` | Add `OPENAI_API_KEY` |
| `backend/src/services/r2.service.ts` | Add `downloadR2Object` (if not exists) |
| `backend/package.json` | Add `openai` dependency |

**Do not touch:** `asr.worker.ts`, `captions.service.ts`, `export.worker.ts` — they all work.

## Verification

1. Create a short recording (< 2 min) with real speech
2. Wait for ASR worker to process
3. Check transcript in UI — should show real words, not "Transcript segment N..."
4. Trigger `mp4_captions` export — should produce video with correct subtitle burn-in
5. Run `npm run typecheck` in `backend/` — must pass
