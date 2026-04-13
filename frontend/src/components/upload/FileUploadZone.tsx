'use client';

import { useId, useRef, useState } from 'react';
import { ACCEPTED_UPLOAD_TYPES } from '@/lib/upload-flow';

type FileUploadZoneProps = {
  disabled?: boolean;
  onFileSelected: (file: File) => void;
  selectedFileName?: string | null;
  error?: string | null;
};

export default function FileUploadZone({
  disabled = false,
  onFileSelected,
  selectedFileName,
  error,
}: FileUploadZoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOver, setIsOver] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file || disabled) return;
    onFileSelected(file);
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsOver(false);
          handleFiles(event.dataTransfer.files);
        }}
        disabled={disabled}
        data-testid="file-upload-zone"
        className={`flex w-full flex-col items-center justify-center rounded-[1.75rem] border border-dashed px-6 py-14 text-center transition ${
          isOver
            ? 'border-[var(--workspace-purple)] bg-[var(--workspace-purple)]/10'
            : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <div className="space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05] text-white">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 16V6" />
              <path d="m7.5 10.5 4.5-4.5 4.5 4.5" />
              <path d="M5 18h14" />
            </svg>
          </div>
          <div className="space-y-1">
            <p className="text-lg font-semibold text-white">Drop media here or browse files</p>
            <p className="text-sm text-slate-400">
              Upload a pre-recorded video or audio file and land directly in the project workspace.
            </p>
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            MP4, MOV, WEBM, WAV, MP3, M4A, AAC, OGG, FLAC
          </p>
        </div>
      </button>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPTED_UPLOAD_TYPES}
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />

      <div className="rounded-2xl border border-white/6 bg-white/[0.025] px-4 py-3 text-sm text-slate-300">
        <span className="font-medium text-white">Selected file:</span>{' '}
        {selectedFileName ?? 'None yet'}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}
    </div>
  );
}
