'use client';

type StudioRetryUploadsButtonProps = {
  failedCount: number;
  onRetry: () => void | Promise<void>;
};

export function StudioRetryUploadsButton(props: StudioRetryUploadsButtonProps) {
  if (props.failedCount <= 0) {
    return null;
  }

  return (
    <div className="mt-2 flex items-center justify-center">
      <button
        type="button"
        onClick={() => void props.onRetry()}
        className="rounded border border-amber-600/70 px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-800/20"
      >
        Retry failed uploads
      </button>
    </div>
  );
}
