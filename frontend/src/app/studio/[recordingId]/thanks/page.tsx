'use client';

import { use, useEffect } from 'react';
import Link from 'next/link';
import { Space_Grotesk } from 'next/font/google';
import { setApiAuthMode } from '@/lib/api';
import { deriveGuestUploadState, toConsumerStateLabel } from '@/lib/recording-journey';
import { useChunkUploadQueue } from '@/lib/studio/useChunkUploadQueue';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

type GuestThanksProps = {
  params: Promise<{ recordingId: string }>;
};

export default function StudioGuestThanksPage({ params }: GuestThanksProps) {
  const { recordingId } = use(params);
  const queue = useChunkUploadQueue({
    enabled: true,
    recordingId,
    concurrency: 2,
    maxRetries: 8,
  });

  useEffect(() => {
    setApiAuthMode('guest');
    return () => setApiAuthMode('default');
  }, []);

  const pending = queue.stats.pending + queue.stats.processing;
  const totalBytes = queue.stats.bytesTotal;
  const uploadedBytes = queue.stats.bytesUploaded + queue.stats.bytesProcessing;
  const uploadPercent = totalBytes > 0 ? Math.min(100, Math.round((uploadedBytes * 100) / totalBytes)) : 100;
  const uploadState = deriveGuestUploadState({
    pendingUploads: pending,
    failedUploads: queue.stats.failed,
  });

  return (
    <main className={`${spaceGrotesk.className} studio-shell-background flex min-h-screen items-center justify-center px-6 text-slate-100`}>
      <div className="studio-panel-surface w-full max-w-2xl rounded-3xl p-8 text-center">
        <p className="text-5xl font-semibold">
          {uploadState === 'uploading'
            ? 'Uploading'
            : uploadState === 'action required'
              ? 'Action required'
              : 'Upload complete'}
        </p>
        <p className="mt-4 text-lg text-slate-300">
          {uploadState === 'uploading'
            ? 'Your upload is still running. Keep this tab open until it finishes.'
            : uploadState === 'action required'
              ? 'This upload needs attention. Retry the failed upload before closing the page.'
              : 'Your recording upload is complete. You can close this tab now.'}
        </p>
        <div className="studio-panel-muted mt-6 rounded-xl p-4 text-left">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Upload status</p>
          <div className="mt-2 flex items-center justify-between text-sm text-slate-200">
            <span>{toConsumerStateLabel(uploadState)}</span>
            <span>{uploadPercent}%</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-[#2c3446]">
            <div className="h-full rounded-full bg-violet-400" style={{ width: `${Math.max(uploadPercent, 4)}%` }} />
          </div>
          {queue.stats.failed > 0 && (
            <button
              type="button"
              onClick={() => void queue.retryFailed()}
              className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200"
            >
              Retry failed uploads
            </button>
          )}
        </div>
        <div className="mt-6">
          <Link
            href="/"
            className="studio-control-surface inline-flex rounded-xl px-4 py-2 text-sm text-slate-100"
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
