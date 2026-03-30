# P3 — Upload Flow from Home Dashboard

**Priority:** HIGH
**Status:** Not started
**Blocks:** Dashboard UX completeness
**Effort:** Human ~2 days / CC ~30 min

---

## Problem

The dashboard "Quick Actions" panel shows an "Upload" button. Clicking it currently does nothing (or navigates to a dead end). Users who want to upload pre-recorded files have no path from the home screen.

Backend upload infrastructure is **already complete**:
- `POST /v1/uploads/initiate` — starts multipart or TUS upload
- `POST /v1/uploads/:id/complete` — finalizes upload
- `backend/src/routes/uploads.routes.ts` — wired and auth-guarded

The missing piece is the **frontend upload flow**: file picker → upload progress → attach to recording.

## User Flow

```
Home Dashboard
  │
  └─ Quick Actions → "Upload" button
        │
        ├─ Option A: Navigate to /recordings/new?mode=upload
        │     → Create recording shell → open file picker → upload
        │
        └─ Option B: Open upload modal (no navigation)
              → File picker → choose recording to attach to → upload
```

**Recommended: Option A** — navigate to a dedicated upload page. Simpler state management, bookmarkable, shareable.

## Implementation

### Step 1 — Wire "Upload" Quick Action button

File: `frontend/src/components/dashboard/DashboardQuickActions.tsx`

Change the Upload button's `onClick` or `href` to navigate:
```typescript
import { useRouter } from 'next/navigation';

// Inside component:
const router = useRouter();

// Upload button:
<button onClick={() => router.push('/recordings/new?mode=upload')}>
  Upload
</button>
```

### Step 2 — Create upload recording page

File: `frontend/src/app/(authenticated)/recordings/new/page.tsx`

```typescript
'use client';
// searchParams.mode === 'upload' shows upload UI
// searchParams.mode !== 'upload' shows "New Recording" form (existing flow)
```

This page should:
1. Show a file drop zone (accept `.webm`, `.mp4`, `.wav`, `.mov`)
2. On file select → call `POST /v1/recordings` to create a draft recording shell
3. Then call `POST /v1/uploads/initiate` with `{ recordingId, fileName, mimeType, protocol: 'multipart' }`
4. Upload file parts using presigned URLs from initiate response
5. Call `POST /v1/uploads/:id/complete` when done
6. Redirect to `/recordings/:id` on completion

### Step 3 — Upload component

Create `frontend/src/components/upload/FileUploadZone.tsx`:
```typescript
// Props:
// onFile: (file: File) => void
// accept: string (e.g. 'video/*,audio/*')
// maxSizeMb: number

// Features:
// - drag-and-drop area
// - click to browse
// - file type and size validation
// - show selected file name + size
```

Create `frontend/src/components/upload/UploadProgress.tsx`:
```typescript
// Props:
// progress: number (0-100)
// fileName: string
// status: 'uploading' | 'processing' | 'done' | 'error'
// onCancel?: () => void
```

### Step 4 — Upload API calls

Add to `frontend/src/lib/api.ts`:
```typescript
export async function initiateUpload(params: {
  recordingId: string;
  fileName: string;
  mimeType: string;
  totalBytes: number;
  protocol: 'multipart';
}): Promise<{ uploadId: string; presignedUrls: string[] }> { ... }

export async function completeUpload(params: {
  uploadId: string;
  parts: { partNumber: number; etag: string }[];
}): Promise<void> { ... }
```

### Step 5 — Multipart upload logic

The backend returns presigned PUT URLs (one per part). Upload each part:
```typescript
async function uploadParts(
  file: File,
  presignedUrls: string[],
  onProgress: (pct: number) => void
): Promise<{ partNumber: number; etag: string }[]> {
  const PART_SIZE = 5 * 1024 * 1024; // 5MB parts
  const parts: { partNumber: number; etag: string }[] = [];

  for (let i = 0; i < presignedUrls.length; i++) {
    const start = i * PART_SIZE;
    const chunk = file.slice(start, start + PART_SIZE);
    const response = await fetch(presignedUrls[i], {
      method: 'PUT',
      body: chunk,
      headers: { 'Content-Type': file.type },
    });
    const etag = response.headers.get('etag') ?? '';
    parts.push({ partNumber: i + 1, etag });
    onProgress(Math.round(((i + 1) / presignedUrls.length) * 100));
  }

  return parts;
}
```

## Data Flow

```
User selects file
  │
  ├─ POST /v1/recordings { title: fileName, status: 'draft' }
  │     → recordingId
  │
  ├─ POST /v1/uploads/initiate { recordingId, fileName, mimeType, totalBytes, protocol: 'multipart' }
  │     → { uploadId, presignedUrls[] }
  │
  ├─ PUT presignedUrls[0..N] (file parts, 5MB each)
  │     → ETags[]
  │
  ├─ POST /v1/uploads/:uploadId/complete { parts: [{partNumber, etag}] }
  │
  └─ redirect → /recordings/:recordingId
```

## Edge Cases

| Case | Handling |
|------|----------|
| File > 2GB | Show error before upload starts (browser memory limit) |
| Upload interrupted mid-way | Show "Resume" option (TUS protocol) or restart from part 0 |
| Unsupported file type | Validate on file select, show inline error |
| Recording creation fails | Show error, do not attempt upload |
| Part upload fails | Retry that part up to 3 times before showing error |

## Files to Create

| File | Purpose |
|------|---------|
| `frontend/src/app/(authenticated)/recordings/new/page.tsx` | Upload + new recording page |
| `frontend/src/components/upload/FileUploadZone.tsx` | Drag-and-drop file picker |
| `frontend/src/components/upload/UploadProgress.tsx` | Progress indicator |

## Files to Change

| File | Change |
|------|--------|
| `frontend/src/components/dashboard/DashboardQuickActions.tsx` | Wire Upload button navigation |
| `frontend/src/lib/api.ts` | Add `initiateUpload`, `completeUpload` |

## Verification

1. Click "Upload" on home dashboard → navigates to `/recordings/new?mode=upload`
2. Drag a `.mp4` file onto the drop zone → shows file name and size
3. Click Upload → progress bar shows upload advancing
4. On completion → redirected to `/recordings/:id` page
5. File appears in the recording's assets list
6. Run `npm run typecheck` in `frontend/`
