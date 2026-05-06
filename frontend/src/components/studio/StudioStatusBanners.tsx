'use client';

type StudioStatusBannersProps = {
  streamWarning: string | null;
  stoppedUploadingPhase: boolean;
  localStudioRole: 'host' | 'guest';
  fallbackNotice: string | null;
  sessionError: string | null;
  recorderError: string | null;
  chunkUploadError: string | null;
  activeError: string | null;
};

export function StudioStatusBanners(props: StudioStatusBannersProps) {
  return (
    <>
      {props.streamWarning && (
        <div className="mb-2 rounded-lg border border-amber-500/60 bg-amber-500/15 px-3 py-2 text-xs text-amber-200">
          {props.streamWarning}
        </div>
      )}
      {props.stoppedUploadingPhase && (
        <div className="mb-2 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs text-violet-200">
          {props.localStudioRole === 'host'
            ? '● Recording stopped — uploads in progress. Keep this page open. You can remove participants once their uploads are complete.'
            : '● Recording complete — your uploads are in progress. You may leave when ready.'}
        </div>
      )}
      {(props.fallbackNotice ||
        props.sessionError ||
        props.recorderError ||
        props.chunkUploadError ||
        props.activeError) && (
        <div className="mt-3 space-y-2">
          {props.fallbackNotice && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {props.fallbackNotice}
            </p>
          )}
          {props.sessionError && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {props.sessionError}
            </p>
          )}
          {props.recorderError && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {props.recorderError}
            </p>
          )}
          {props.chunkUploadError && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Upload queue: {props.chunkUploadError}
            </p>
          )}
          {props.activeError && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {props.activeError}
            </p>
          )}
        </div>
      )}
    </>
  );
}
